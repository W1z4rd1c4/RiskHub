"""Apply the upstream CPython 3.13 fix for CVE-2026-82049 to the pinned base.

Source: python/cpython@b8f23e307097552eaea2604383a12ab280520d0d.
Fail closed if the base or patch context changes; retire with the fixed base release.
"""

import sys
import tarfile
from pathlib import Path

if sys.version_info[:3] != (3, 13, 15):
    raise SystemExit("Re-evaluate the tarfile backport for the new Python release")
path = Path(tarfile.__file__)
source = path.read_text()
old = "os.link(tarinfo._link_target, targetpath)"
new = "os.link(os.path.realpath(tarinfo._link_target), targetpath)"
if source.count(old) != 1 or new in source:
    raise SystemExit("Unexpected tarfile patch context")
path.write_text(source.replace(old, new))
