"""``python -m script_audit``: run the API with uvicorn on loopback."""

from __future__ import annotations

import argparse
import logging
import sqlite3
from collections.abc import Sequence
from pathlib import Path

import uvicorn

from .api.app import create_app
from .config import LOOPBACK_HOSTS, ConfigError, Settings


def build_settings(argv: Sequence[str] | None = None) -> Settings:
    parser = argparse.ArgumentParser(
        prog="python -m script_audit",
        description="Run the ScriptAudit backend. Settings come from SCRIPT_AUDIT_* variables.",
    )
    parser.add_argument("--host", help="bind address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, help="port (default 8799)")
    parser.add_argument("--db-path", type=Path, help="SQLite file")
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    changes: dict[str, object] = {}
    if args.host:
        changes["host"] = args.host
    if args.port is not None:
        changes["port"] = args.port
    if args.db_path is not None:
        changes["db_path"] = args.db_path.expanduser().resolve()
    return settings.with_overrides(**changes) if changes else settings


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        settings = build_settings(argv)
    except ConfigError as exc:
        print(f"script_audit: configuration error: {exc}")
        return 2
    log = logging.getLogger("script_audit")
    if settings.host not in LOOPBACK_HOSTS:
        log.warning(
            "Binding to %s: the API has no authentication; use loopback only", settings.host
        )
    if settings.ai_provider == "anthropic" and not settings.ai_enabled:
        log.warning(
            "AI provider 'anthropic' needs ANTHROPIC_API_KEY and SCRIPT_AUDIT_AI_MODEL; "
            "the assistant stays disabled"
        )
    try:
        app = create_app(settings)
    except (sqlite3.Error, OSError, RuntimeError) as exc:
        print(f"script_audit: cannot open the database at {settings.db_path}: {exc}")
        return 2
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
    return 0
