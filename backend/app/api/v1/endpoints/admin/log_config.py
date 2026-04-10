from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import reconfigure_log_rotation
from app.db.session import get_db
from app.models import User
from app.schemas.admin import LogConfig, LogConfigUpdate

from ._deps import require_platform_admin

router = APIRouter()


@router.get("/logs/config", response_model=LogConfig)
async def get_log_config(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> LogConfig:
    """Get current log rotation settings (separate for app and audit logs)."""
    from app.models.global_config import get_config_int

    # Default values must match logging.py (10MB, 10 files)
    app_size = await get_config_int(db, "app_log_rotation_size_mb", 10)
    app_count = await get_config_int(db, "app_log_retention_count", 10)
    audit_size = await get_config_int(db, "audit_log_rotation_size_mb", 10)
    audit_count = await get_config_int(db, "audit_log_retention_count", 10)

    return LogConfig(
        app_log_rotation_size_mb=app_size,
        app_log_retention_count=app_count,
        audit_log_rotation_size_mb=audit_size,
        audit_log_retention_count=audit_count,
    )


@router.post("/logs/config", response_model=LogConfig)
async def update_log_config(
    config: LogConfigUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> LogConfig:
    """
    Update log rotation settings (separate for app and audit logs).
    Changes are persisted and applied to the current process immediately.
    """
    from sqlalchemy import select

    from app.models.global_config import GlobalConfig, clear_config_cache

    canonical = config.to_log_config()

    # Helper to upsert config
    async def upsert_config(key: str, value: int, display: str, desc: str):
        result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
        cfg = result.scalar_one_or_none()

        if cfg:
            cfg.value = str(value)
        else:
            cfg = GlobalConfig(
                key=key,
                value=str(value),
                value_type="int",
                category="system",
                display_name=display,
                description=desc,
                min_value=1,
                max_value=500,
                is_editable=True,
            )
            db.add(cfg)

    # App log settings
    await upsert_config(
        "app_log_rotation_size_mb",
        canonical.app_log_rotation_size_mb,
        "App Log Rotation Size (MB)",
        "Maximum size of each application log file before rotation in megabytes",
    )
    await upsert_config(
        "app_log_retention_count",
        canonical.app_log_retention_count,
        "App Log Retention Count",
        "Number of backup application log files to keep after rotation",
    )

    # Audit log settings
    await upsert_config(
        "audit_log_rotation_size_mb",
        canonical.audit_log_rotation_size_mb,
        "Audit Log Rotation Size (MB)",
        "Maximum size of each audit log file before rotation in megabytes",
    )
    await upsert_config(
        "audit_log_retention_count",
        canonical.audit_log_retention_count,
        "Audit Log Retention Count",
        "Number of backup audit log files to keep after rotation",
    )

    await db.commit()
    clear_config_cache()
    reconfigure_log_rotation(
        app_rotation_size_mb=canonical.app_log_rotation_size_mb,
        app_retention_count=canonical.app_log_retention_count,
        audit_rotation_size_mb=canonical.audit_log_rotation_size_mb,
        audit_retention_count=canonical.audit_log_retention_count,
    )

    return canonical
