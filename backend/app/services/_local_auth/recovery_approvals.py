"""Versioned Ed25519 approval envelopes for offline native recovery only."""

from __future__ import annotations

import base64
import json
from typing import Annotated, Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.datetime_utils import utc_now
from app.core.native_identity_files import NativeSecurityFileError, load_approver_material

from .common import invalid_proof
from .keys import unavailable


class RecoveryEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1] = 1
    installation_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    target_user_id: Annotated[int, Field(gt=0)]
    expected_token_version: Annotated[int, Field(ge=0)]
    operation: Literal["factor_recovery", "credential_and_factor_recovery", "verified_address_recovery"]
    nonce: str = Field(pattern=r"^[0-9a-f]{32}$")
    issued_at: int
    expires_at: int
    incident_reference: str = Field(min_length=1, max_length=255)
    verification_method: str = Field(min_length=1, max_length=255)
    reason: str = Field(min_length=1, max_length=2000)
    new_email: EmailStr | None = None


def canonical_envelope(envelope: RecoveryEnvelope) -> bytes:
    return json.dumps(
        envelope.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode()


def validate_envelope(envelope: RecoveryEnvelope) -> None:
    now = int(utc_now().timestamp())
    if (
        envelope.issued_at > now
        or envelope.expires_at <= now
        or not 0 < envelope.expires_at - envelope.issued_at <= 900
        or ((envelope.operation == "verified_address_recovery") != (envelope.new_email is not None))
    ):
        raise invalid_proof()


def load_recovery_approvers(trust_file: str | None) -> dict[str, Ed25519PublicKey]:
    try:
        return {
            key_id: Ed25519PublicKey.from_public_bytes(raw)
            for key_id, raw in load_approver_material(trust_file).items()
        }
    except NativeSecurityFileError:
        raise unavailable() from None
    except ValueError:
        raise invalid_proof() from None


def verify_approvals(envelope: RecoveryEnvelope, signatures: list[dict], trust_file: str | None) -> list[str]:
    validate_envelope(envelope)
    try:
        keys = load_recovery_approvers(trust_file)
        if len(signatures) != 2:
            raise ValueError("Exactly two approvals required")
        approved = []
        for signature in signatures:
            signer = signature["signer_id"]
            if signer in approved:
                raise ValueError("Repeated approver")
            keys[signer].verify(base64.b64decode(signature["signature"], validate=True), canonical_envelope(envelope))
            approved.append(signer)
        return sorted(approved)
    except (KeyError, ValueError, TypeError, InvalidSignature):
        raise invalid_proof() from None
