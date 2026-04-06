from starlette.responses import JSONResponse


def build_rate_limit_response(*, retry_after: int) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


def build_rate_limit_backend_unavailable_response() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Rate limiting backend temporarily unavailable. Please retry.",
            "code": "rate_limit_backend_unavailable",
        },
        headers={"Retry-After": "5"},
    )
