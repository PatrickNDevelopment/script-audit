from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from script_audit.api.app import create_app
from script_audit.config import Settings

FIXED = "2026-10-18T12:00:00.000Z"
ORIGIN = "http://localhost:4178"
OPT_IN = {"X-ScriptAudit-AI-Opt-In": "session"}


class FakeEpoch:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    base = Settings(db_path=tmp_path / "t.sqlite3", cors_origins=(ORIGIN,))
    return base.with_overrides(**overrides) if overrides else base


def make_client(app: object) -> TestClient:
    """The Host guard is on in tests too: speak to it as a browser on loopback would."""
    return TestClient(app, base_url="http://localhost")  # type: ignore[arg-type]


def finding(key: str = "S1|One, two three four.|0", **over: Any) -> dict[str, Any]:
    base = {
        "key": key,
        "audit": "spoken",
        "rule": "S1",
        "message": "Long sentence.",
        "excerpt": "One, two three four.",
        "sentence": "One, two three four.",
    }
    return {**base, **over}


@pytest.fixture
def epoch() -> FakeEpoch:
    return FakeEpoch()


@pytest.fixture
def fake_client(tmp_path: Path, epoch: FakeEpoch) -> Iterator[TestClient]:
    app = create_app(make_settings(tmp_path, ai_provider="fake"), clock=lambda: FIXED, epoch=epoch)
    with make_client(app) as c:
        yield c


@pytest.fixture
def off_client(tmp_path: Path) -> Iterator[TestClient]:
    with make_client(create_app(make_settings(tmp_path), clock=lambda: FIXED)) as c:
        yield c
