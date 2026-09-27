"""Conservative commitment to restored relationships that can confer resource access."""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

from .files import canonical_json

# These records describe authentication, audit or notifications rather than business
# ownership. Their cutover/revocation is handled separately. Every column of
# business tables referencing any entity is committed, including indirect ownership
# links and policy-bearing fields. A changed business graph requires explicit review.
SEPARATE_SECURITY_TABLES = frozenset({"users", "refresh_tokens", "activity_logs", "notifications"})


async def ownership_digest(db: AsyncSession) -> str:
    digest = hashlib.sha256()
    for table in sorted(Base.metadata.tables.values(), key=lambda value: value.name):
        if table.name in SEPARATE_SECURITY_TABLES or table.name.startswith(
            ("local_auth_", "local_bootstrap_", "identity_")
        ):
            continue
        if not any(column.foreign_keys for column in table.columns):
            continue
        primary = list(table.primary_key.columns)
        columns = list(table.columns)
        digest.update(canonical_json({"table": table.name, "columns": [column.name for column in columns]}))
        result = await db.stream(select(*columns).order_by(*primary))
        async for row in result:
            digest.update(canonical_json({"values": [str(value) if value is not None else None for value in row]}))
    return digest.hexdigest()
