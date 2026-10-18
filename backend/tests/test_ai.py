"""Adversarial provider output: the broker must drop or refuse it (spec 02 "Output contract")."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from script_audit.ai import (
    AiService,
    ExplainIn,
    FindingIn,
    Rewrite,
    parse_provider_text,
    rewrite_problem,
)
from script_audit.errors import AppError
from script_audit.store import Store, migrate

from .conftest import OPT_IN, finding, make_settings


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


def test_rewrites_that_add_spelled_numbers_claims_quotes_or_links_are_dropped() -> None:
    """Acceptance review 06B: the first rule set let these through."""
    ex = "The tower is tall, and it is old."
    f = FindingIn(**finding(f"S1|{ex}|0", excerpt=ex))

    def p(replacement: str) -> str | None:
        return rewrite_problem(f, Rewrite(original=ex, replacement=replacement))

    assert p("The tower is tall. It is old.") is None
    assert p("The tower is tall. It is three million years old.") == "number"
    assert p("The tower is tall. It is twice as old.") == "number"
    assert p("According to experts, the tower is tall. It is old.") == "new_claim"
    assert p("The tower is the tallest. It is old.") == "new_claim"
    assert p("The tower is tall. It is the first.") == "new_claim"
    assert p("The tower is tall. It is ‘old’, they say.") == "quotation"
    assert p("The tower is tall. It is «old».") == "quotation"
    assert p("The tower is tall. It is 'old', they say.") == "quotation"
    assert p("The tower is tall. See [here](example.com).") == "link"
    assert p("The tower is tall. See example.org.") == "link"
    assert p("The tower’s tall. It’s old.") is None  # apostrophes are not quotations


class _DuplicateProvider:
    name = "stub"
    model = "stub-model"

    def complete(self, system: str, user: str) -> str:
        del system, user
        key = "S1|One, two three four.|0"
        return json.dumps(
            {
                "recommendations": [
                    {"findingKey": key, "explanation": "First answer."},
                    {"findingKey": key, "explanation": "Second answer for the same finding."},
                ]
            }
        )


def test_a_second_answer_for_the_same_finding_is_dropped(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    migrate(settings.db_path)
    service = AiService(settings, _DuplicateProvider(), Store(settings.db_path), lambda: "t")
    out = service.explain(True, ExplainIn(findings=[FindingIn(**finding())]))
    assert [r["explanation"] for r in out["recommendations"]] == ["First answer."]
    assert out["meta"]["dropped"] == 1
