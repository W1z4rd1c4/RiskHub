# Production Python dependency locks

Each platform directory contains generated, fully hashed runtime, database-task
and pip bootstrap inputs plus their provenance manifest. The production Alpine
amd64 Docker build consumes `cpython313-alpine324-x86_64/`.

See the [native lock workflow and activation contract](../../scripts/tools/RUNTIME_DEPENDENCY_LOCK.md)
for the exact target, generation evidence and required verification. Other
platforms require independent native resolution and install evidence.
