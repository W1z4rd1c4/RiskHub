"""Executable image-build proof for the two temporary upstream security backports."""

import ctypes
import io
import tarfile
import tempfile
import zlib
from pathlib import Path

# Load both CPython's link dependency and the normal system soname. Both must
# resolve the fixed upstream library, so an obsolete copy cannot shadow it.
assert zlib.ZLIB_RUNTIME_VERSION == "1.3.2.1-motley", zlib.ZLIB_RUNTIME_VERSION
library = ctypes.CDLL("libz.so.1")
library.zlibVersion.restype = ctypes.c_char_p
assert library.zlibVersion() == b"1.3.2.1-motley"
assert zlib.decompress(zlib.compress(b"RiskHub security backport")) == b"RiskHub security backport"

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
print("Verified fixed zlib and both tarfile extraction filters")
