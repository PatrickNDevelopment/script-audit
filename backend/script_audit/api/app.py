"""The FastAPI application (docs/spec/02-ai-broker-and-api.md)."""

from __future__ import annotations

import logging
import sqlite3
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, Header, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .. import __version__
from ..ai import AiService, ExplainIn, make_provider
from ..clock import Clock, utc_now
from ..config import Settings
from ..errors import AppError, envelope
from ..store import Store, migrate
from .middleware import BodyLimit, Deadline, HostGuard, OriginGuard

log = logging.getLogger("script_audit.api")

_HTTP_CODES = {
    400: "bad_request",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
    415: "unsupported_media_type",
}


@dataclass
class Context:
    settings: Settings
    ai: AiService


def create_app(
    settings: Settings | None = None,
    *,
    clock: Clock | None = None,
    epoch: Callable[[], float] | None = None,
    ai_transport: httpx.BaseTransport | None = None,
) -> FastAPI:
    config = settings if settings is not None else Settings.from_env()
    now = clock if clock is not None else utc_now
    migrate(config.db_path)
    ctx = Context(
        settings=config,
        ai=AiService(
            config,
            make_provider(config, ai_transport),
            Store(config.db_path),
            now,
            epoch if epoch is not None else time.time,
        ),
    )
    app = FastAPI(
        title="ScriptAudit API",
        version=__version__,
        description=(
            "Local-only backend of ScriptAudit: an optional, opt-in AI explanation broker with a "
            "schema-validated output contract and a usage ledger. No authentication: loopback."
        ),
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.ctx = ctx

    @app.exception_handler(AppError)
    async def _app_error(_r: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AppError)
        return JSONResponse(
            status_code=exc.status_code,
            content=envelope(exc.code, exc.message, exc.details),
            headers=exc.headers or None,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_r: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)
        problems = [
            {
                "loc": [p for p in err.get("loc", ()) if isinstance(p, str | int)],
                "message": str(err.get("msg", "invalid value")),
            }
            for err in exc.errors()
        ]
        first = problems[0] if problems else None
        where = ".".join(str(p) for p in first["loc"]) if first else ""
        message = "The request is invalid" + (f": {where}: {first['message']}" if first else "")
        return JSONResponse(
            status_code=422, content=envelope("invalid_request", message, {"errors": problems})
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_r: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, StarletteHTTPException)
        code = _HTTP_CODES.get(exc.status_code, "http_error")
        message = str(exc.detail) if exc.detail else code.replace("_", " ")
        return JSONResponse(status_code=exc.status_code, content=envelope(code, message))

    @app.exception_handler(sqlite3.OperationalError)
    async def _db(_r: Request, exc: Exception) -> JSONResponse:
        text = str(exc).lower()
        if "locked" in text or "busy" in text:
            return JSONResponse(
                status_code=503,
                content=envelope("database_busy", "The usage ledger is locked. Try again."),
                headers={"Retry-After": "5"},
            )
        log.exception("database error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=envelope("internal_error", "The server hit an unexpected error; see its log"),
        )

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error in %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=envelope("internal_error", "The server hit an unexpected error; see its log"),
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.get("/api/capabilities")
    def capabilities() -> dict[str, Any]:
        return {"version": __version__, "ai": ctx.ai.capabilities()}

    @app.get("/api/ai/usage")
    def usage() -> dict[str, Any]:
        return {"usage": ctx.ai.usage()}

    @app.post("/api/ai/explain")
    async def explain(
        body: ExplainIn,
        opt_in: Annotated[str | None, Header(alias="X-ScriptAudit-AI-Opt-In")] = None,
    ) -> dict[str, Any]:
        return await run_in_threadpool(ctx.ai.explain, opt_in == "session", body)

    # Guards: the last one added is the outermost.
    app.add_middleware(BodyLimit, max_bytes=config.max_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-ScriptAudit-AI-Opt-In"],
        expose_headers=["Retry-After"],
        allow_credentials=False,
    )
    app.add_middleware(OriginGuard, allowed=frozenset(config.cors_origins))
    app.add_middleware(Deadline, seconds=config.request_timeout_s)
    app.add_middleware(HostGuard, served_hosts=config.served_hosts())
    return app
