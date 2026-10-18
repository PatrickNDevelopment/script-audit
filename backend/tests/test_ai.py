"""Adversarial provider output: the broker must drop or refuse it (spec 02 "Output contract")."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from script_audit.ai import FindingIn, Rewrite, parse_provider_text, rewrite_problem
from script_audit.errors import AppError

from .conftest import OPT_IN, finding


def explain(c: TestClient, *findings: dict[str, object]) -> dict[str, object]:
    r = c.post("/api/ai/explain", json={"findings": list(findings)}, headers=OPT_IN)
    assert r.status_code == 200, r.text
    body: dict[str, object] = r.json()
    return body


@pytest.mark.parametrize("marker", ["NUMBER", "CITE", "QUOTE"])
def test_rewrites_that_add_facts_are_dropped(fake_client: TestClient, marker: str) -> None:
    ex = f"One, two three [[FAKE:{marker}]]."
    body = explain(fake_client, finding(f"S1|{ex}|0", excerpt=ex))
    recs = body["recommendations"]
    assert isinstance(recs, list)
    assert "rewrite" not in recs[0]
    assert body["meta"]["dropped"] == 1  # type: ignore[index]


def test_grounding_findings_never_get_rewrites(fake_client: TestClient) -> None:
    ex = "It rose, by a lot."
    body = explain(fake_client, finding(f"G1|{ex}|0", audit="grounding", rule="G1", excerpt=ex))
    recs = body["recommendations"]
    assert isinstance(recs, list)
    assert recs[0]["explanation"]
    assert "rewrite" not in recs[0]


def test_answers_for_unsent_findings_are_dropped(fake_client: TestClient) -> None:
    ex = "Plain text [[FAKE:OTHER]]"
    body = explain(fake_client, finding(f"N1|{ex}|0", audit="narrative", rule="N1", excerpt=ex))
    recs = body["recommendations"]
    assert isinstance(recs, list)
    assert [r["findingKey"] for r in recs] == [f"N1|{ex}|0"]
    assert body["meta"]["dropped"] == 1  # type: ignore[index]


@pytest.mark.parametrize(
    ("marker", "status", "code"),
    [
        ("EXTRA", 502, "ai_invalid_output"),
        ("PROSE", 502, "ai_invalid_output"),
        ("ERROR", 502, "ai_provider_error"),
    ],
)
def test_broken_provider_answers_are_refused(
    fake_client: TestClient, marker: str, status: int, code: str
) -> None:
    ex = f"Text [[FAKE:{marker}]]"
    r = fake_client.post(
        "/api/ai/explain", json={"findings": [finding(f"S1|{ex}|0", excerpt=ex)]}, headers=OPT_IN
    )
    assert r.status_code == status
    assert r.json()["error"]["code"] == code


def test_failed_calls_are_not_cached(fake_client: TestClient) -> None:
    ex = "Text [[FAKE:ERROR]]"
    payload = {"findings": [finding(f"S1|{ex}|0", excerpt=ex)]}
    assert fake_client.post("/api/ai/explain", json=payload, headers=OPT_IN).status_code == 502
    assert fake_client.post("/api/ai/explain", json=payload, headers=OPT_IN).status_code == 502


def test_rewrite_rules() -> None:
    f = FindingIn(**finding())

    def p(original: str, replacement: str) -> str | None:
        return rewrite_problem(f, Rewrite(original=original, replacement=replacement))

    assert p("One, two three four.", "One. Two three four.") is None
    assert p("other", "x") == "not_the_excerpt"
    assert p("One, two three four.", "  ") == "empty"
    assert p("One, two three four.", "x" * 200) == "too_long"
    assert p("One, two three four.", "One [C:x].") == "claim_tag"
    assert p("One, two three four.", "{setup:k} One.") == "story_tag"
    assert p("One, two three four.", "See www.x.y") == "link"
    assert p("One, two three four.", "“One”") == "quotation"
    assert p("One, two three four.", "One of 5.") == "number"


def test_fenced_json_is_accepted_but_extra_keys_are_not() -> None:
    ok = parse_provider_text('```json\n{"recommendations": []}\n```')
    assert ok.recommendations == []
    with pytest.raises(AppError):
        parse_provider_text('{"recommendations": [], "approve": true}')
    with pytest.raises(AppError):
        parse_provider_text(
            '{"recommendations": [{"findingKey": "k", "explanation": "x", "apply": true}]}'
        )
    with pytest.raises(AppError):
        parse_provider_text('{"recommendations": [{"findingKey": "k", "explanation": ""}]}')
