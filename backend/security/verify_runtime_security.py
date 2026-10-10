"""Fail-closed image-build checks for the official Python/Alpine security fixes."""

import ctypes
import io
import ssl
import sys
import tarfile
import tempfile
import zlib
from pathlib import Path


def verify_python_release() -> None:
    # 3.13.16 includes CVE-2026-82049, CVE-2026-19445 and CVE-2026-19553.
    if sys.version_info[:2] != (3, 13) or sys.version_info[:3] < (3, 13, 16):
        raise RuntimeError("The container requires the fixed Python 3.13.16+ release")


def verify_zlib_linkage() -> None:
    # The Dockerfile requires the fixed Alpine package (zlib>=1.3.2-r1).
    # Alpine backports the fix without changing zlibVersion() from 1.3.2.
    # Check both link paths so an obsolete source overlay cannot shadow it.
    library = ctypes.CDLL("libz.so.1")
    library.zlibVersion.restype = ctypes.c_char_p
    assert library.zlibVersion().decode("ascii") == zlib.ZLIB_RUNTIME_VERSION
    assert tuple(map(int, zlib.ZLIB_RUNTIME_VERSION.split("."))) >= (1, 3, 2)
    payload = b"RiskHub runtime security"
    assert zlib.decompress(zlib.compress(payload)) == payload


def verify_ssl_hostname_validation() -> None:
    # CVE-2026-19553: wrap_bio must not silently skip required hostname checks.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    assert context.check_hostname
    for hostname in (None, ""):
        try:
            context.wrap_bio(ssl.MemoryBIO(), ssl.MemoryBIO(), server_hostname=hostname)
        except ValueError as error:
            assert "check_hostname requires server_hostname" in str(error)
        else:
            raise AssertionError("wrap_bio accepted a missing verification hostname")
    context.wrap_bio(ssl.MemoryBIO(), ssl.MemoryBIO(), server_hostname="riskhub.invalid")


def verify_ssl_sni_context_release() -> None:
    # CVE-2026-19445: changing context and raising in the SNI callback must not
    # access the now-unreferenced dispatch context. No certificate or network is
    # needed: this handshake intentionally stops in the callback, before auth.
    leaf_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    callback_errors = []

    def sni_callback(connection, server_name, context):
        assert server_name == "riskhub.invalid"
        connection.context = leaf_context
        del context
        raise LookupError("intentional SNI regression failure")

    def make_server():
        dispatch_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        dispatch_context.sni_callback = sni_callback
        incoming, outgoing = ssl.MemoryBIO(), ssl.MemoryBIO()
        server = dispatch_context.wrap_bio(incoming, outgoing, server_side=True)
        return server, incoming

    server, server_incoming = make_server()
    client_outgoing = ssl.MemoryBIO()
    client = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT).wrap_bio(
        ssl.MemoryBIO(), client_outgoing, server_hostname="riskhub.invalid"
    )
    try:
        client.do_handshake()
    except ssl.SSLWantReadError:
        pass
    server_incoming.write(client_outgoing.read())
    previous_hook = sys.unraisablehook
    try:
        sys.unraisablehook = lambda event: callback_errors.append(event.exc_value)
        try:
            server.do_handshake()
        except ssl.SSLError:
            pass
        else:
            raise AssertionError("The intentional SNI callback failure was ignored")
    finally:
        sys.unraisablehook = previous_hook
    assert len(callback_errors) == 1
    assert isinstance(callback_errors[0], LookupError)
    assert str(callback_errors[0]) == "intentional SNI regression failure"
    assert server.context is leaf_context


def verify_tarfile_filters() -> None:
    # CVE-2026-82049: hard links to symlinks must not disclose outside contents.
    for extraction_filter in ("data", "tar"):
        with tempfile.TemporaryDirectory() as root:
            destination = Path(root) / "extract"
            destination.mkdir()
            outside = Path(root) / "escape"
            outside.write_text("outside content must stay private")
            archive_bytes = io.BytesIO()
            with tarfile.open(fileobj=archive_bytes, mode="w") as archive:
                regular = tarfile.TarInfo("a/escape")
                regular.size = 5
                archive.addfile(regular, io.BytesIO(b"decoy"))
                symbolic = tarfile.TarInfo("a/b/s")
                symbolic.type, symbolic.linkname = tarfile.SYMTYPE, "../escape"
                archive.addfile(symbolic)
                hard = tarfile.TarInfo("s")
                hard.type, hard.linkname = tarfile.LNKTYPE, "a/b/s"
                archive.addfile(hard)
            archive_bytes.seek(0)
            with tarfile.open(fileobj=archive_bytes) as archive:
                archive.extractall(destination, filter=extraction_filter)
            assert not (destination / "s").is_symlink()
            assert (destination / "s").read_text() == "decoy"
            assert outside.read_text() == "outside content must stay private"


if __name__ == "__main__":
    verify_python_release()
    verify_zlib_linkage()
    verify_ssl_hostname_validation()
    verify_ssl_sni_context_release()
    verify_tarfile_filters()
    print("Verified fixed Python, zlib linkage, TLS regressions and tarfile filters")
