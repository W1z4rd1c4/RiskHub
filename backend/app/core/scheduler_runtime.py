from __future__ import annotations

import os
from types import ModuleType
from typing import Callable


def get_scheduler_role_status(
    *,
    scheduler_enabled: bool,
    scheduler_running: bool,
    lock_acquired: bool,
) -> dict[str, str]:
    if not scheduler_enabled:
        return {
            "scheduler_role": "disabled",
            "scheduler_status": "disabled",
        }

    if scheduler_running and lock_acquired:
        return {
            "scheduler_role": "leader",
            "scheduler_status": "leader_running",
        }

    if not scheduler_running and not lock_acquired:
        return {
            "scheduler_role": "follower",
            "scheduler_status": "follower_ready",
        }

    return {
        "scheduler_role": "leader" if lock_acquired else "follower",
        "scheduler_status": "error",
    }


outbox_dispatch_state: dict[str, object | None] = {
    "last_started_at": None,
    "last_finished_at": None,
    "last_status": None,
    "last_processed": None,
    "last_error": None,
}


def get_outbox_dispatch_runtime_state() -> dict[str, object | None]:
    return {
        "last_started_at": outbox_dispatch_state["last_started_at"],
        "last_finished_at": outbox_dispatch_state["last_finished_at"],
        "last_status": outbox_dispatch_state["last_status"],
        "last_processed": outbox_dispatch_state["last_processed"],
        "last_error": outbox_dispatch_state["last_error"],
    }


def get_scheduler_runtime_state(module: ModuleType) -> dict[str, object]:
    lock_provider = module._lock_provider.provider_name if module._lock_provider is not None else None
    enable = os.getenv("ENABLE_SCHEDULER", "false").lower() == "true"
    lock_acquired = bool(module._lock_provider.lock_acquired) if module._lock_provider is not None else False
    state_details = get_scheduler_role_status(
        scheduler_enabled=enable,
        scheduler_running=module.scheduler.running,
        lock_acquired=lock_acquired,
    )
    return {
        "process_role": "scheduler" if enable else "api",
        "instance_id": module.PROCESS_INSTANCE_ID,
        "process_started_at": module.PROCESS_STARTED_AT.isoformat(),
        "scheduler_enabled": enable,
        "scheduler_running": module.scheduler.running,
        "lock_provider": lock_provider,
        "lock_acquired": lock_acquired,
        **state_details,
    }


def setup_scheduler(module: ModuleType) -> tuple[str, tuple[str, ...]]:
    """Configure scheduled jobs. Job definitions live in scheduler_jobs."""
    from app.core.config import get_settings
    from app.core.scheduler_jobs import (
        register_full_scheduler_jobs,
        register_outbox_only_scheduler_jobs,
        resolve_scheduler_job_profile,
        set_db_sessionmaker_ref,
    )

    settings = get_settings()
    module.scheduler.remove_all_jobs()
    set_db_sessionmaker_ref(module._db_sessionmaker)

    profile = resolve_scheduler_job_profile()
    if profile == "outbox_only":
        registered_job_ids = register_outbox_only_scheduler_jobs()
    else:
        registered_job_ids = register_full_scheduler_jobs(settings)

    module.logger.info(
        "scheduler_configured",
        scheduler_job_profile=profile,
        registered_job_ids=list(registered_job_ids),
        instance_id=module.PROCESS_INSTANCE_ID,
    )
    return profile, registered_job_ids


async def start_scheduler_async(
    module: ModuleType,
    *,
    ensure_outbox_runtime_supported: Callable[..., None],
) -> None:
    """Start the scheduler after acquiring runtime ownership."""
    enable = os.getenv("ENABLE_SCHEDULER", "false").lower()
    if enable != "true":
        module.logger.info("scheduler_disabled", scheduler_enabled=False, instance_id=module.PROCESS_INSTANCE_ID)
        return
    if module._db_sessionmaker is None:
        module.logger.warning(
            "scheduler_not_started",
            reason="db_sessionmaker_not_configured",
            instance_id=module.PROCESS_INSTANCE_ID,
        )
        return
    if module._db_engine is None:
        module.logger.warning(
            "scheduler_not_started",
            reason="db_engine_not_configured",
            instance_id=module.PROCESS_INSTANCE_ID,
        )
        return

    if module.scheduler.running:
        return

    from app.core.scheduler_jobs import resolve_process_worker_count

    ensure_outbox_runtime_supported(
        dialect_name=module._db_engine.dialect.name,
        worker_count=resolve_process_worker_count(),
    )

    provider = module._resolve_lock_provider()
    module._lock_provider = provider
    lock_acquired = await provider.acquire()
    module.logger.info(
        "scheduler_lock_attempt",
        scheduler_enabled=True,
        instance_id=module.PROCESS_INSTANCE_ID,
        lock_provider=provider.provider_name,
        lock_acquired=lock_acquired,
    )
    if not lock_acquired:
        return

    try:
        profile, registered_job_ids = setup_scheduler(module)
        module.scheduler.start()
        await module._mark_runtime_started()
    except Exception:
        if module.scheduler.running:
            try:
                module.scheduler.shutdown(wait=False)
            except Exception:
                module.logger.exception(
                    "scheduler_shutdown_failed_after_start_error",
                    instance_id=module.PROCESS_INSTANCE_ID,
                    lock_provider=provider.provider_name,
                )
        module._runtime_run_id = None
        await module._release_lock_provider(suppress_exceptions=True)
        raise

    module.logger.info(
        "scheduler_started",
        scheduler_enabled=True,
        scheduler_job_profile=profile,
        registered_job_ids=list(registered_job_ids),
        instance_id=module.PROCESS_INSTANCE_ID,
        lock_provider=provider.provider_name,
        lock_acquired=True,
    )


async def stop_scheduler_async(module: ModuleType) -> None:
    """Stop the scheduler and release runtime ownership."""
    try:
        if module.scheduler.running:
            try:
                module.scheduler.shutdown(wait=False)
            except Exception:
                module.logger.exception("scheduler_shutdown_failed", instance_id=module.PROCESS_INSTANCE_ID)

            try:
                await module._mark_runtime_stopped()
            except Exception:
                module.logger.exception("scheduler_runtime_stop_mark_failed", instance_id=module.PROCESS_INSTANCE_ID)
            else:
                module.logger.info("scheduler_stopped", instance_id=module.PROCESS_INSTANCE_ID)
    finally:
        module._runtime_run_id = None
        await module._release_lock_provider(suppress_exceptions=True)
