"""SQLite: the append-only AI usage ledger and the answer cache, with ordered migrations.

The ledger never stores script text, only a SHA-256 of the prompt and counts. The rate limit is
counted from the ledger, so it survives restarts.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Final

MIGRATIONS: Final[tuple[str, ...]] = (
    # 1: the usage ledger
    """
    CREATE TABLE ai_calls (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        epoch REAL NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        prompt_sha256 TEXT NOT NULL,
        findings INTEGER NOT NULL,
        kept INTEGER NOT NULL,
        dropped INTEGER NOT NULL,
        cached INTEGER NOT NULL,
        error TEXT
    );
    CREATE INDEX ai_calls_epoch ON ai_calls (epoch);
    """,
    # 2: validated answers for identical prompts
    """
    CREATE TABLE ai_cache (
        prompt_sha256 TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        body TEXT NOT NULL
    );
    """,
)


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    return conn


def migrate(path: Path) -> int:
    """Applies pending migrations in order and returns the schema version."""
    conn = connect(path)
    try:
        version = int(conn.execute("PRAGMA user_version").fetchone()[0])
        if version > len(MIGRATIONS):
            raise RuntimeError(
                f"database schema version {version} is newer than this program ({len(MIGRATIONS)})"
            )
        for number, script in enumerate(MIGRATIONS, start=1):
            if number <= version:
                continue
            conn.executescript("BEGIN;\n" + script + f"\nPRAGMA user_version = {number};\nCOMMIT;")
        return int(conn.execute("PRAGMA user_version").fetchone()[0])
    finally:
        conn.close()


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = connect(self.path)
        try:
            yield conn
        finally:
            conn.close()

    def record(self, row: dict[str, Any]) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT INTO ai_calls (at, epoch, provider, model, prompt_version, prompt_sha256, "
                "findings, kept, dropped, cached, error) VALUES "
                "(:at, :epoch, :provider, :model, :prompt_version, :prompt_sha256, :findings, "
                ":kept, :dropped, :cached, :error)",
                row,
            )
            c.commit()

    def provider_calls_since(self, epoch: float) -> int:
        """Calls that reached the provider (cache hits do not count against the limit)."""
        with self._conn() as c:
            row = c.execute(
                "SELECT COUNT(*) FROM ai_calls WHERE epoch > ? AND cached = 0", (epoch,)
            ).fetchone()
        return int(row[0])

    def usage(self, since_hour: float, since_day: float) -> dict[str, int]:
        with self._conn() as c:
            row = c.execute(
                "SELECT "
                "SUM(CASE WHEN epoch > ? THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN epoch > ? THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN epoch > ? THEN kept ELSE 0 END), "
                "SUM(CASE WHEN epoch > ? THEN dropped ELSE 0 END), "
                "SUM(CASE WHEN epoch > ? AND cached = 1 THEN 1 ELSE 0 END) FROM ai_calls",
                (since_hour, since_day, since_day, since_day, since_day),
            ).fetchone()
        keys = ("callsLastHour", "callsToday", "keptToday", "droppedToday", "cachedToday")
        return {k: int(v or 0) for k, v in zip(keys, row, strict=True)}

    def cached(self, digest: str) -> str | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT body FROM ai_cache WHERE prompt_sha256 = ?", (digest,)
            ).fetchone()
        return None if row is None else str(row["body"])

    def put_cache(self, digest: str, at: str, body: str) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO ai_cache (prompt_sha256, at, body) VALUES (?, ?, ?)",
                (digest, at, body),
            )
            c.commit()

    def ledger(self) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute("SELECT * FROM ai_calls ORDER BY seq").fetchall()
        return [dict(r) for r in rows]
