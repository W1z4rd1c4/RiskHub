from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

EntityMutationKind = Literal["applied", "approval_queued"]


@dataclass(frozen=True)
class EntityMutationOutcome:
    kind: EntityMutationKind
    response: Any
