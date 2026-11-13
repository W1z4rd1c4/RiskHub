"""Remove unused SQLite from the PostgreSQL-only production image lanes."""

from __future__ import annotations

import shutil
import subprocess
import sysconfig
from pathlib import Path


def main() -> None:
    # Preserve every other shared-library requirement of the official Python
    # image before removing its original virtual dependency package.
    output = subprocess.check_output(
        ["apk", "info", "--depends", ".python-rundeps"], text=True
    )
    dependencies = [line.strip() for line in output.splitlines() if line.startswith("so:")]
    sqlite = [item for item in dependencies if item.startswith("so:libsqlite3.so.")]
    if len(sqlite) != 1 or len(dependencies) < 2:
        raise RuntimeError("Review the official Python runtime dependencies before stripping SQLite")
    retained = [item for item in dependencies if item not in sqlite]
    stdlib = Path(sysconfig.get_path("stdlib"))
    module = stdlib / "sqlite3"
    extensions = list((stdlib / "lib-dynload").glob("_sqlite3.*.so"))
    if not module.is_dir() or len(extensions) != 1:
        raise RuntimeError("Review the Python SQLite module layout before removal")
    subprocess.run(
        ["apk", "add", "--no-cache", "--virtual", ".riskhub-python-rundeps", *retained],
        check=True,
    )
    shutil.rmtree(module)
    extensions[0].unlink()
    subprocess.run(["apk", "del", "--no-network", ".python-rundeps"], check=True)
    if subprocess.run(
        ["apk", "info", "--exists", "sqlite-libs"], capture_output=True
    ).returncode == 0:
        raise RuntimeError("SQLite is still required by another installed package")


if __name__ == "__main__":
    main()
