# Tool regression tests

## Purpose

`test_runtime_dependency_lock.py` checks the runtime/DB-task lock generator's
validation, dependency-graph, provenance, activation and Dockerfile-rendering
contracts with synthetic offline fixtures.

## Run

From the repository root:

```sh
python3 -m unittest discover -s scripts/tools/tests -p test_runtime_dependency_lock.py -v
```

The real-pip hash check creates a temporary virtual environment using the
interpreter's bundled `venv`/`ensurepip`, then runs isolated pip dry runs against
a local synthetic wheel. It verifies the already-installed dependency bypass,
wrong-hash rejection with forced artifact consumption, and correct-hash
acceptance. It requires `venv` and `ensurepip` support; it does not access the
network or change global packages. Other cases use synthetic metadata and mocks.

## Scope

These checks do not resolve production dependencies, build images, establish
native Alpine compatibility, or activate a lock. Native resolution, repeated
clean installs, image checks and reviewed production cutover remain the CI and
review steps documented in [Runtime dependency locks](../RUNTIME_DEPENDENCY_LOCK.md).
