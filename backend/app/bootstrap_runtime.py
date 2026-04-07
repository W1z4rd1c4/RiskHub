from __future__ import annotations

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.logging import configure_logging, get_logger
from app.core.scheduler import configure_scheduler, start_scheduler_async
from app.models.global_config import GlobalConfig

from app.bootstrap_validation import LOG_ROTATION_CONFIG_KEYS, parse_log_rotation_config

logger = get_logger("bootstrap")


async def apply_log_rotation_config(app: FastAPI) -> None:
    settings: Settings = app.state.settings
    sessionmaker = getattr(app.state, "db_sessionmaker", None)
    if sessionmaker is None:
        return

    try:
        async with sessionmaker() as db:
            result = await db.execute(
                select(GlobalConfig.key, GlobalConfig.value).where(GlobalConfig.key.in_(LOG_ROTATION_CONFIG_KEYS))
            )
            raw_values = {key: value for key, value in result.all()}
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        logger.warning("log_config_load_error", message=f"Could not load log rotation config from database: {exc}")
        return

    try:
        parsed_values = parse_log_rotation_config(raw_values)
    except ValueError as exc:
        if settings.debug:
            logger.warning("log_config_invalid", message=str(exc))
            return
        raise RuntimeError(f"Invalid log rotation config: {exc}") from exc

    if not any(value is not None for value in parsed_values.values()):
        return

    configure_logging(
        app_rotation_size_mb=parsed_values["app_log_rotation_size_mb"],
        app_retention_count=parsed_values["app_log_retention_count"],
        audit_rotation_size_mb=parsed_values["audit_log_rotation_size_mb"],
        audit_retention_count=parsed_values["audit_log_retention_count"],
    )
    logger.info(
        "log_config_applied",
        message=(
            "Log rotation config applied: "
            f"App={parsed_values['app_log_rotation_size_mb']}MB x {parsed_values['app_log_retention_count']}, "
            f"Audit={parsed_values['audit_log_rotation_size_mb']}MB x {parsed_values['audit_log_retention_count']}"
        ),
    )


async def bootstrap_runtime_services(app: FastAPI) -> None:
    settings: Settings = app.state.settings
    await apply_log_rotation_config(app)

    if not settings.debug:
        if not settings.redis_url:
            raise RuntimeError("FATAL: REDIS_URL is required in production mode (DEBUG=false).")
        from redis.asyncio import Redis

        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        try:
            await redis.ping()
        except Exception:
            await redis.aclose()
            raise
        app.state.redis = redis
    else:
        app.state.redis = None

    from app.services.account_lockout_service import (
        AccountLockoutService,
        InMemoryAccountLockoutBackend,
        RedisAccountLockoutBackend,
    )
    from app.services.sso_challenge_store import InMemorySsoChallengeStore, RedisSsoChallengeStore

    if app.state.redis is not None:
        app.state.account_lockout = AccountLockoutService(RedisAccountLockoutBackend(app.state.redis))
        app.state.sso_challenge_store = RedisSsoChallengeStore(app.state.redis)
    else:
        app.state.account_lockout = AccountLockoutService(InMemoryAccountLockoutBackend())
        app.state.sso_challenge_store = InMemorySsoChallengeStore()

    await start_scheduler_async()


def configure_default_runtime_state(app: FastAPI, settings: Settings) -> None:
    app.state.settings = settings
    app.state.redis = None

    from app.services.account_lockout_service import AccountLockoutService, InMemoryAccountLockoutBackend
    from app.services.sso_challenge_store import InMemorySsoChallengeStore

    app.state.account_lockout = AccountLockoutService(InMemoryAccountLockoutBackend())
    app.state.sso_challenge_store = InMemorySsoChallengeStore()
    app.state.process_started_at = utc_now()


def configure_database_and_scheduler(app: FastAPI, settings: Settings) -> None:
    from app.db.session import init_app_db

    init_app_db(app, settings)
    configure_scheduler(app.state.db_sessionmaker, app.state.db_engine)
