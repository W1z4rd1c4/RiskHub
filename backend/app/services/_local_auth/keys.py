"""Versioned, secret-file-only native key material and authenticated encryption."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.exceptions import ServiceFailure
from app.core.native_identity_files import load_keyring_material, read_native_secret


def unavailable() -> ServiceFailure:
    return ServiceFailure(
        "Local authentication security state is unavailable", code="LOCAL_SECURITY_UNAVAILABLE", status_code=503
    )


def read_secret_file(path: str | None, *, max_bytes: int = 65536) -> bytes:
    try:
        return read_native_secret(path, max_bytes=max_bytes)
    except ValueError:
        raise unavailable() from None


def _aad(purpose: str, context: list[str]) -> bytes:
    return json.dumps(["riskhub-local-v1", purpose, *context], separators=(",", ":")).encode()


@dataclass(frozen=True)
class KeyPurpose:
    active: str
    keys: dict[str, bytes] = field(repr=False)


@dataclass(frozen=True)
class LocalKeyring:
    purposes: dict[str, KeyPurpose] = field(repr=False)

    @classmethod
    def load(cls, path: str | None) -> "LocalKeyring":
        try:
            return cls(
                {purpose: KeyPurpose(active, keys) for purpose, (active, keys) in load_keyring_material(path).items()}
            )
        except ValueError:
            raise unavailable() from None

    def encrypt(self, purpose: str, plaintext: str, context: list[str]) -> tuple[str, str]:
        entry = self.purposes[purpose]
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(entry.keys[entry.active]).encrypt(
            nonce, plaintext.encode(), _aad(purpose, [entry.active, *context])
        )
        return entry.active, base64.b64encode(nonce + ciphertext).decode()

    def decrypt(self, purpose: str, key_id: str, ciphertext: str, context: list[str]) -> str:
        try:
            raw = base64.b64decode(ciphertext, validate=True)
            return (
                AESGCM(self.purposes[purpose].keys[key_id])
                .decrypt(raw[:12], raw[12:], _aad(purpose, [key_id, *context]))
                .decode()
            )
        except (KeyError, ValueError, InvalidTag):
            raise unavailable() from None

    def commitment(self, value: str, *, context: list[str], key_id: str | None = None) -> tuple[str, str]:
        entry = self.purposes["action"]
        selected = key_id or entry.active
        try:
            key = entry.keys[selected]
        except KeyError:
            raise unavailable() from None
        digest = hmac.new(key, _aad("action", [*context, value]), hashlib.sha256).hexdigest()
        return selected, digest
