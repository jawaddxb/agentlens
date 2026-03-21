"""HTTP middleware for FastAPI and Flask to capture X-AgentLens-Token header."""

from __future__ import annotations

import time
import uuid
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from agentlens.client import LensClient


# ---------------------------------------------------------------------------
# FastAPI middleware
# ---------------------------------------------------------------------------

def make_fastapi_middleware(lens_client: "LensClient") -> Any:
    """Return a FastAPI/Starlette middleware class bound to the given LensClient.

    Usage::

        from fastapi import FastAPI
        from agentlens import LensClient
        from agentlens.integrations.http import make_fastapi_middleware

        app = FastAPI()
        lens = LensClient(url="http://localhost:8002", agent_name="my-api")
        app.add_middleware(make_fastapi_middleware(lens))
    """
    try:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request
        from starlette.responses import Response
    except ImportError:
        raise ImportError(
            "starlette is required for FastAPI middleware: pip install starlette"
        )

    class AgentLensMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Response:
            trace_id = request.headers.get(
                "x-agentlens-token",
                request.headers.get("x-agentlens-trace-id", uuid.uuid4().hex[:16]),
            )
            start = time.monotonic()
            status = "ok"
            response = None
            try:
                response = await call_next(request)
                if response.status_code >= 400:
                    status = "error"
                return response
            except Exception as exc:
                status = "error"
                raise exc
            finally:
                latency_ms = round((time.monotonic() - start) * 1000, 2)
                lens_client.send_event(
                    event_type="http_request",
                    data={
                        "method": request.method,
                        "path": str(request.url.path),
                        "status_code": response.status_code if response else 500,
                        "latency_ms": latency_ms,
                        "status": status,
                    },
                    trace_id=trace_id,
                )

    return AgentLensMiddleware


# ---------------------------------------------------------------------------
# Flask middleware (WSGI)
# ---------------------------------------------------------------------------

class FlaskAgentLensMiddleware:
    """WSGI middleware for Flask that captures X-AgentLens-Token header.

    Usage::

        from flask import Flask
        from agentlens import LensClient
        from agentlens.integrations.http import FlaskAgentLensMiddleware

        app = Flask(__name__)
        lens = LensClient(url="http://localhost:8002", agent_name="my-flask-app")
        app.wsgi_app = FlaskAgentLensMiddleware(app.wsgi_app, lens)
    """

    def __init__(self, wsgi_app: Any, lens_client: "LensClient") -> None:
        self.app = wsgi_app
        self.lens = lens_client

    def __call__(self, environ: dict, start_response: Any) -> Any:
        trace_id = (
            environ.get("HTTP_X_AGENTLENS_TOKEN")
            or environ.get("HTTP_X_AGENTLENS_TRACE_ID")
            or uuid.uuid4().hex[:16]
        )
        path = environ.get("PATH_INFO", "/")
        method = environ.get("REQUEST_METHOD", "GET")
        start = time.monotonic()
        status_code = 200

        def _start_response_wrapper(status: str, headers: list, *args: Any) -> Any:
            nonlocal status_code
            try:
                status_code = int(status.split(" ", 1)[0])
            except (ValueError, AttributeError):
                pass
            return start_response(status, headers, *args)

        result = None
        event_status = "ok"
        try:
            result = self.app(environ, _start_response_wrapper)
            if status_code >= 400:
                event_status = "error"
            return result
        except Exception as exc:
            event_status = "error"
            raise exc
        finally:
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            self.lens.send_event(
                event_type="http_request",
                data={
                    "method": method,
                    "path": path,
                    "status_code": status_code,
                    "latency_ms": latency_ms,
                    "status": event_status,
                },
                trace_id=trace_id,
            )
