from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from script_audit.api.app import create_app
from script_audit.config import ConfigError, Settings
from script_audit.store import MIGRATIONS, Store, migrate

from .conftest import FIXED, OPT_IN, ORIGIN, FakeEpoch, finding, make_client, make_settings


def test_health_and_capabilities_without_ai(off_client: TestClient) -> None:
    assert off_client.get("/api/health").json() == {"status": "ok", "version": "0.1.0"}
    caps = off_client.get("/api/capabilities").json()
    assert caps["ai"]["enabled"] is False
    assert caps["ai"]["requiresOptIn"] is True


def test_disabled_ai_refuses(off_client: TestClient) -> None:
    r = off_client.post("/api/ai/explain", json={"findings": [finding()]}, headers=OPT_IN)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ai_disabled"


def test_opt_in_header_required(fake_client: TestClient) -> None:
    r = fake_client.post("/api/ai/explain", json={"findings": [finding()]})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ai_opt_in_required"
    r = fake_client.post(
        "/api/ai/explain",
        json={"findings": [finding()]},
        headers={"X-ScriptAudit-AI-Opt-In": "always"},
    )
    assert r.json()["error"]["code"] == "ai_opt_in_required"


def test_explain_returns_validated_recommendations(fake_client: TestClient) -> None:
    r = fake_client.post(
        "/api/ai/explain", json={"title": "T", "findings": [finding()]}, headers=OPT_IN
    )
    assert r.status_code == 200
    body = r.json()
    assert body["recommendations"] == [
        {
            "findingKey": "S1|One, two three four.|0",
            "explanation": "S1: Long sentence. (deterministic test provider)",
            "rewrite": {"original": "One, two three four.", "replacement": "One. Two three four."},
        }
    ]
    assert body["meta"] == {
        "provider": "fake",
        "model": "fake-deterministic",
        "promptVersion": "sa-explain-1",
        "dropped": 0,
        "cached": False,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"findings": []},
        {"findings": [finding()] * 9},
        {"findings": [finding(rule="X1")]},
        {"findings": [finding(audit="vibes")]},
        {"findings": [finding(excerpt="")]},
        {"findings": [finding()], "extra": 1},
        {"findings": [{**finding(), "status": "approved"}]},
        {"findings": [finding(), finding()]},
    ],
)
def test_invalid_requests(fake_client: TestClient, payload: dict[str, object]) -> None:
    r = fake_client.post("/api/ai/explain", json=payload, headers=OPT_IN)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_guards(fake_client: TestClient, tmp_path: Path) -> None:
    r = fake_client.post(
        "/api/ai/explain",
        json={"findings": [finding()]},
        headers={**OPT_IN, "Origin": "https://evil.example"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "origin_not_allowed"
    ok = fake_client.post(
        "/api/ai/explain", json={"findings": [finding()]}, headers={**OPT_IN, "Origin": ORIGIN}
    )
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == ORIGIN
    with TestClient(fake_client.app, base_url="http://attacker.example") as other:
        assert other.get("/api/health").json()["error"]["code"] == "host_not_allowed"
    big = "x" * 300_000
    r = fake_client.post(
        "/api/ai/explain",
        content=big,
        headers={**OPT_IN, "content-type": "application/json"},
    )
    assert r.status_code == 413
    assert fake_client.get("/api/nope").json()["error"]["code"] == "not_found"


def test_usage_counts_and_ledger_has_no_text(fake_client: TestClient, tmp_path: Path) -> None:
    secret_text = "One, two three four."
    fake_client.post("/api/ai/explain", json={"findings": [finding()]}, headers=OPT_IN)
    fake_client.post("/api/ai/explain", json={"findings": [finding()]}, headers=OPT_IN)
    usage = fake_client.get("/api/ai/usage").json()["usage"]
    assert usage == {
        "callsLastHour": 2,
        "callsToday": 2,
        "keptToday": 2,
        "droppedToday": 0,
        "cachedToday": 1,
    }
    rows = Store(tmp_path / "t.sqlite3").ledger()
    assert len(rows) == 2
    assert all(secret_text not in json.dumps(r) for r in rows)
    assert {r["cached"] for r in rows} == {0, 1}


def test_rate_limit_counts_provider_calls_only_and_survives_restart(
    tmp_path: Path, epoch: FakeEpoch
) -> None:
    settings = make_settings(tmp_path, ai_provider="fake", ai_calls_per_hour=2)
    with make_client(create_app(settings, clock=lambda: FIXED, epoch=epoch)) as c:
        for i in range(2):
            k = f"S1|{i}, x y z.|0"
            assert (
                c.post(
                    "/api/ai/explain",
                    json={"findings": [finding(k, excerpt=f"{i}, x y z.")]},
                    headers=OPT_IN,
                ).status_code
                == 200
            )
        # A cached repeat is still answered.
        same = {"findings": [finding("S1|0, x y z.|0", excerpt="0, x y z.")]}
        cached = c.post("/api/ai/explain", json=same, headers=OPT_IN)
        assert cached.json()["meta"]["cached"] is True
    with make_client(create_app(settings, clock=lambda: FIXED, epoch=epoch)) as c:
        r = c.post(
            "/api/ai/explain",
            json={"findings": [finding("S1|new, a b c.|0", excerpt="new, a b c.")]},
            headers=OPT_IN,
        )
        assert r.status_code == 429
        assert r.headers["retry-after"] == "600"
        epoch.t += 3601
        assert (
            c.post(
                "/api/ai/explain",
                json={"findings": [finding("S1|new, a b c.|0", excerpt="new, a b c.")]},
                headers=OPT_IN,
            ).status_code
            == 200
        )


def test_migrations_are_ordered_and_refuse_newer_schema(tmp_path: Path) -> None:
    db = tmp_path / "m.sqlite3"
    assert migrate(db) == len(MIGRATIONS) == 2
    assert migrate(db) == 2
    conn = sqlite3.connect(db)
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    conn.execute("PRAGMA user_version = 9")
    conn.commit()
    conn.close()
    assert {"ai_calls", "ai_cache"} <= names
    with pytest.raises(RuntimeError, match="newer"):
        migrate(db)


def test_config_from_env() -> None:
    s = Settings.from_env(
        {
            "SCRIPT_AUDIT_PORT": "9000",
            "SCRIPT_AUDIT_CORS_ORIGINS": "http://localhost:1, http://127.0.0.1:2",
            "SCRIPT_AUDIT_AI_PROVIDER": "anthropic",
            "ANTHROPIC_API_KEY": "k",
            "SCRIPT_AUDIT_AI_MODEL": "m",
        }
    )
    assert s.port == 9000
    assert s.cors_origins == ("http://localhost:1", "http://127.0.0.1:2")
    assert s.ai_enabled
    assert not Settings.from_env({"SCRIPT_AUDIT_AI_PROVIDER": "anthropic"}).ai_enabled
    for bad in (
        {"SCRIPT_AUDIT_PORT": "0"},
        {"SCRIPT_AUDIT_CORS_ORIGINS": "*"},
        {"SCRIPT_AUDIT_AI_PROVIDER": "other"},
        {"SCRIPT_AUDIT_AI_BASE_URL": "https://evil.example"},
    ):
        with pytest.raises(ConfigError):
            Settings.from_env(bad)


def test_anthropic_provider_never_leaks_the_key(tmp_path: Path) -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers["x-api-key"]
        seen["body"] = request.content.decode()
        text = json.dumps(
            {"recommendations": [{"findingKey": finding()["key"], "explanation": "Shorter."}]}
        )
        return httpx.Response(200, json={"content": [{"type": "text", "text": text}]})

    settings = make_settings(
        tmp_path, ai_provider="anthropic", ai_api_key="sk-test-key", ai_model="test-model"
    )
    app = create_app(settings, clock=lambda: FIXED, ai_transport=httpx.MockTransport(handler))
    with make_client(app) as c:
        caps = c.get("/api/capabilities").text
        r = c.post("/api/ai/explain", json={"findings": [finding()]}, headers=OPT_IN)
    assert r.status_code == 200
    assert seen["key"] == "sk-test-key"
    assert "sk-test-key" not in caps
    assert "sk-test-key" not in r.text
    assert "untrusted" in seen["body"]
