"""Real verified-TLS SMTP delivery and durable retry/purge behavior."""

from __future__ import annotations

import asyncio
import ssl
from datetime import timedelta

import pytest
import pytest_asyncio
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from sqlalchemy import select

from app.core.datetime_utils import utc_now
from app.models import LocalAuthDelivery, OutboxEvent
from app.services._local_auth.delivery import (
    deliver_mail,
    purge_expired_delivery_secrets,
)
from app.services._local_auth.keys import LocalKeyring
from app.services.outbox.errors import RetryableOutboxError
from app.services.outbox.payloads import LocalAuthDeliveryPayload
from app.services.outbox.registry import OUTBOX_EVENT_HANDLERS
from tests.backend.pytest.test_local_identity import create_invitation, latest_mail


@pytest_asyncio.fixture
async def tls_mail_server(tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(utc_now() - timedelta(minutes=1))
        .not_valid_after(utc_now() + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False
        )
        .sign(key, hashes.SHA256())
    )
    cert_file, key_file = tmp_path / "smtp-ca.pem", tmp_path / "smtp-key.pem"
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_file.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    key_file.chmod(0o600)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_file, key_file)
    messages, connections = [], set()

    async def smtp(reader, writer):
        task = asyncio.current_task()
        connections.add(task)
        try:
            writer.write(b"220 localhost controlled SMTP\r\n")
            await writer.drain()
            while line := await reader.readline():
                verb = line.split(b" ", 1)[0].strip().upper()
                if verb in {b"EHLO", b"HELO"}:
                    writer.write(b"250 localhost\r\n")
                elif verb == b"DATA":
                    writer.write(b"354 End data with dot\r\n")
                    await writer.drain()
                    chunks = []
                    while (chunk := await reader.readline()) and chunk != b".\r\n":
                        chunks.append(chunk)
                    messages.append(b"".join(chunks).decode())
                    writer.write(b"250 Accepted\r\n")
                elif verb == b"QUIT":
                    writer.write(b"221 Bye\r\n")
                    await writer.drain()
                    break
                else:
                    writer.write(b"250 OK\r\n")
                await writer.drain()
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except ConnectionError:
                pass
            connections.discard(task)

    server = await asyncio.start_server(smtp, host="127.0.0.1", port=0, ssl=context)
    yield server.sockets[0].getsockname()[1], str(cert_file), messages
    server.close()
    await server.wait_closed()
    if connections:
        await asyncio.gather(*connections)


@pytest.mark.asyncio
async def test_actual_tls_smtp_registered_handler_and_post_send_secret_removal(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    tls_mail_server,
    monkeypatch,
):
    port, ca_file, messages = tls_mail_server
    settings = native_context.model_copy(
        update={
            "local_smtp_port": port,
            "local_smtp_ca_file": ca_file,
            "local_smtp_security": "tls",
        }
    )
    user_id = await create_invitation(
        client_factory, settings, db_session, test_user, test_user_employee.role_id
    )
    row, mail = await latest_mail(
        db_session, settings, user_id=user_id, kind="invitation"
    )
    delivery_id = row.id
    events = (await db_session.execute(select(OutboxEvent))).scalars().all()
    event = next(event for event in events if event.event_type == "local_auth.deliver")
    assert event.payload == {"delivery_id": delivery_id}
    assert mail["credential"] not in str(event.payload)
    assert messages == []  # account commit only enqueues, never sends
    from app.services._local_auth import delivery

    monkeypatch.setattr(delivery, "get_settings", lambda: settings)
    await OUTBOX_EVENT_HANDLERS["local_auth.deliver"](
        db_session, LocalAuthDeliveryPayload(delivery_id=delivery_id)
    )
    await db_session.commit()
    assert len(messages) == 1
    from email import policy
    from email.parser import Parser

    assert (
        mail["credential"]
        in Parser(policy=policy.default).parsestr(messages[0]).get_content()
    )
    row = await db_session.get(LocalAuthDelivery, delivery_id, populate_existing=True)
    assert row.ciphertext is None and row.status == "sent"
    await deliver_mail(db_session, delivery_id, settings=settings)
    assert len(messages) == 1


@pytest.mark.asyncio
async def test_untrusted_smtp_certificate_retries_same_grant_then_expiry_purges(
    native_context,
    client_factory,
    db_session,
    test_user,
    test_user_employee,
    tls_mail_server,
):
    port, _, messages = tls_mail_server
    settings = native_context.model_copy(
        update={"local_smtp_port": port, "local_smtp_security": "tls"}
    )
    user_id = await create_invitation(
        client_factory, settings, db_session, test_user, test_user_employee.role_id
    )
    row, mail = await latest_mail(
        db_session, settings, user_id=user_id, kind="invitation"
    )
    delivery_id, ciphertext = row.id, row.ciphertext
    with pytest.raises(
        RetryableOutboxError, match="Local identity delivery unavailable"
    ):
        await deliver_mail(db_session, delivery_id, settings=settings)
    row = await db_session.get(LocalAuthDelivery, delivery_id, populate_existing=True)
    assert row.ciphertext == ciphertext and messages == []
    row.expires_at = utc_now() - timedelta(seconds=1)
    await db_session.commit()
    await purge_expired_delivery_secrets(db_session)
    await db_session.commit()
    row = await db_session.get(LocalAuthDelivery, delivery_id, populate_existing=True)
    assert row.ciphertext is None and row.status == "expired"


def test_key_material_is_permission_guarded_and_context_bound(tmp_path):
    import base64
    import json
    import secrets

    from app.core.exceptions import ServiceFailure

    path = tmp_path / "keys.json"
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "purposes": {
                    name: {
                        "active": "one",
                        "keys": {
                            "one": base64.b64encode(secrets.token_bytes(32)).decode()
                        },
                    }
                    for name in ("delivery", "totp", "action")
                },
            }
        )
    )
    path.chmod(0o644)
    with pytest.raises(ServiceFailure):
        LocalKeyring.load(str(path))
    path.chmod(0o600)
    keys = LocalKeyring.load(str(path))
    key_id, cipher = keys.encrypt("totp", "test-only-seed", ["installation", "user-a"])
    assert (
        keys.decrypt("totp", key_id, cipher, ["installation", "user-a"])
        == "test-only-seed"
    )
    with pytest.raises(ServiceFailure):
        keys.decrypt("totp", key_id, cipher, ["installation", "user-b"])
    with pytest.raises(ServiceFailure):
        keys.decrypt("delivery", key_id, cipher, ["installation", "user-a"])


@pytest.mark.asyncio
async def test_committed_invitation_tls_retry_sends_identical_artifact_once(
    native_context, client_factory, db_session, test_user, test_user_employee, tls_mail_server, monkeypatch
):
    from email import policy
    from email.parser import Parser

    from app.models import LocalAuthGrant, User
    from app.services._local_auth import delivery

    port, ca_file, messages = tls_mail_server
    bad = native_context.model_copy(update={"local_smtp_port": port, "local_smtp_security": "tls"})
    uid = await create_invitation(client_factory, bad, db_session, test_user, test_user_employee.role_id)
    row, mail = await latest_mail(db_session, bad, user_id=uid, kind="invitation")
    artifact, cipher, delivery_id = mail["credential"], row.ciphertext, row.id
    user_ids = (await db_session.execute(select(User.id).order_by(User.id))).scalars().all()
    monkeypatch.setattr(delivery, "get_settings", lambda: bad)
    with pytest.raises(RetryableOutboxError):
        await OUTBOX_EVENT_HANDLERS["local_auth.deliver"](db_session, LocalAuthDeliveryPayload(delivery_id=delivery_id))
    await db_session.refresh(row)
    assert row.ciphertext == cipher and not messages
    assert (await db_session.get(User, uid)).local_enrollment_state == "invited"
    good = bad.model_copy(update={"local_smtp_ca_file": ca_file})
    monkeypatch.setattr(delivery, "get_settings", lambda: good)
    _, retry_mail = await latest_mail(db_session, good, user_id=uid, kind="invitation")
    assert retry_mail["credential"] == artifact
    await OUTBOX_EVENT_HANDLERS["local_auth.deliver"](db_session, LocalAuthDeliveryPayload(delivery_id=delivery_id))
    await db_session.commit()
    assert len(messages) == 1 and artifact in Parser(policy=policy.default).parsestr(messages[0]).get_content()
    await db_session.refresh(row)
    assert row.status == "sent" and row.ciphertext is None
    grant = await db_session.get(LocalAuthGrant, artifact.split(".")[0], populate_existing=True)
    assert grant.consumed_at is None and grant.revoked_at is None
    assert (await db_session.execute(select(User.id).order_by(User.id))).scalars().all() == user_ids
    await OUTBOX_EVENT_HANDLERS["local_auth.deliver"](db_session, LocalAuthDeliveryPayload(delivery_id=delivery_id))
    assert len(messages) == 1


@pytest.mark.asyncio
async def test_revoked_invitation_delivery_never_calls_sender(
    native_context, client_factory, db_session, test_user, test_user_employee, monkeypatch
):
    from unittest.mock import Mock

    from app.models import LocalAuthGrant
    from app.services._local_auth import delivery

    uid = await create_invitation(client_factory, native_context, db_session, test_user, test_user_employee.role_id)
    row, mail = await latest_mail(db_session, native_context, user_id=uid, kind="invitation")
    grant = await db_session.get(LocalAuthGrant, mail["credential"].split(".")[0])
    grant.revoked_at = utc_now()
    await db_session.commit()
    sender = Mock(side_effect=AssertionError("Obsolete artifact must never be sent"))
    monkeypatch.setattr(delivery, "send_smtp", sender)
    monkeypatch.setattr(delivery, "get_settings", lambda: native_context)
    await OUTBOX_EVENT_HANDLERS["local_auth.deliver"](db_session, LocalAuthDeliveryPayload(delivery_id=row.id))
    await db_session.commit()
    sender.assert_not_called()
    await db_session.refresh(row)
    assert row.status == "cancelled" and row.ciphertext is None


@pytest.mark.asyncio
async def test_dispatcher_failed_projection_redaction_and_offline_tls_retry(
    native_context, client_factory, db_session, async_engine, test_user,
    test_user_employee, tls_mail_server, monkeypatch, caplog,
):
    """Real dispatcher transactions; egress allows only test SMTP and the test DB."""
    import json
    import socket
    from email import policy
    from email.parser import Parser
    from pathlib import Path

    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.models import ActivityLog, LocalAuthGrant, User
    from app.services._local_auth import delivery
    from app.services.outbox.dispatcher import dispatch_pending_outbox_events

    port, ca_file, messages = tls_mail_server
    caplog.set_level("INFO")
    original_resolve, original_connect = socket.getaddrinfo, socket.socket.connect
    allowed_dns = {("localhost", port), ("127.0.0.1", port), ("::1", port)}
    allowed_addresses = {("127.0.0.1", port), ("::1", port)}
    if async_engine.url.get_backend_name() == "postgresql":
        db_host, db_port = async_engine.url.host or "localhost", async_engine.url.port or 5432
        allowed_dns.add((db_host, db_port))
        allowed_addresses.update(
            (address[4][0], db_port) for address in original_resolve(db_host, db_port, type=socket.SOCK_STREAM)
        )
    blocked = []

    def resolve(host, service, *args, **kwargs):
        if (host, service) not in allowed_dns:
            blocked.append(host)
            raise OSError("Test denies non-loopback egress")
        return original_resolve(host, service, *args, **kwargs)

    def connect(sock, address):
        if not isinstance(address, tuple) or address[:2] not in allowed_addresses:
            blocked.append(str(address))
            raise OSError("Test denies egress outside SMTP and test DB")
        return original_connect(sock, address)

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    monkeypatch.setattr(socket.socket, "connect", connect)
    with pytest.raises(OSError, match="Test denies"):
        socket.getaddrinfo("login.microsoftonline.com", 443)
    blocked.clear()
    bad = native_context.model_copy(update={"local_smtp_port": port, "local_smtp_security": "tls"})
    uid = await create_invitation(client_factory, bad, db_session, test_user, test_user_employee.role_id)
    row, mail = await latest_mail(db_session, bad, user_id=uid, kind="invitation")
    artifact, cipher, did = mail["credential"], row.ciphertext, row.id
    ids = (await db_session.execute(select(User.id).order_by(User.id))).scalars().all()
    initial = (await db_session.execute(select(OutboxEvent).where(
        OutboxEvent.idempotency_key == f"local-auth-mail:{did}"
    ))).scalar_one()
    assert initial.status == "pending" and initial.attempt_count == 0 and initial.last_error is None
    hashes = (await db_session.execute(select(User.hashed_password))).scalars().all()
    keyring = json.loads(Path(bad.local_auth_keyring_file).read_text())
    raw_keys = [key for purpose in keyring["purposes"].values() for key in purpose["keys"].values()]
    await db_session.commit()
    sessions = async_sessionmaker(async_engine, expire_on_commit=False)
    monkeypatch.setattr(delivery, "get_settings", lambda: bad)
    assert await dispatch_pending_outbox_events(sessions) == 0
    async with sessions() as observer:
        event = (await observer.execute(select(OutboxEvent).where(
            OutboxEvent.idempotency_key == f"local-auth-mail:{did}"
        ))).scalar_one()
        assert event.status == "pending" and event.attempt_count == 1
        assert event.last_error == "Local identity delivery unavailable"
        assert event.payload == {"delivery_id": did}
        envelope = await observer.get(LocalAuthDelivery, did)
        assert envelope.ciphertext == cipher and envelope.sent_at is None
        assert (await observer.get(User, uid)).hashed_password is None
        event.available_at = utc_now() - timedelta(seconds=1)
        await observer.commit()
    await db_session.refresh(test_user)
    await db_session.refresh(initial)  # request fixture identity map predates dispatcher transaction
    async with client_factory(current_user=test_user, settings=bad) as client:
        failed = await client.get(f"/api/v1/users/{uid}/local-auth/status")
        assert failed.status_code == 200, failed.text
        assert failed.json()["delivery_status"] == "failed"
    good = bad.model_copy(update={"local_smtp_ca_file": ca_file})
    monkeypatch.setattr(delivery, "get_settings", lambda: good)
    assert await dispatch_pending_outbox_events(sessions) == 1
    assert len(messages) == 1
    assert artifact in Parser(policy=policy.default).parsestr(messages[0]).get_content()
    async with sessions() as observer:
        event = (await observer.execute(select(OutboxEvent).where(
            OutboxEvent.idempotency_key == f"local-auth-mail:{did}"
        ))).scalar_one()
        assert event.status == "succeeded" and event.attempt_count == 2
        envelope = await observer.get(LocalAuthDelivery, did)
        assert envelope.status == "sent" and envelope.ciphertext is None
        grant = await observer.get(LocalAuthGrant, artifact.split(".")[0])
        assert grant.consumed_at is None and grant.revoked_at is None
        assert (await observer.execute(select(User.id).order_by(User.id))).scalars().all() == ids
        audits = (await observer.execute(select(ActivityLog))).scalars().all()
        audit_text = repr([(a.description, a.changes) for a in audits])
    await db_session.refresh(row)  # client_factory reuses this session across requests
    async with client_factory(current_user=test_user, settings=good) as client:
        sent = await client.get(f"/api/v1/users/{uid}/local-auth/status")
        assert sent.status_code == 200 and sent.json()["delivery_status"] == "sent"
    assert "outbox_event_failed" in caplog.text
    for secret in (artifact, artifact.split(".")[1], cipher, *raw_keys, *(h for h in hashes if h)):
        assert secret not in caplog.text + audit_text + failed.text + sent.text + repr(event.payload)
    assert await dispatch_pending_outbox_events(sessions) == 0
    assert len(messages) == 1 and blocked == []
