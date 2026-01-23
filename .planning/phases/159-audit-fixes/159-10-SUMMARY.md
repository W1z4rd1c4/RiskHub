---
phase: 159-audit-fixes
plan: 10
completed: 2026-01-23
---

# Summary: Test Infrastructure Documentation

## Changes

1. **pytest.ini** - Added custom markers:
   - `postgres`: Tests requiring PostgreSQL database
   - `slow`: Slow-running tests

2. **tests/README.md** - Created comprehensive documentation:
   - SQLite vs PostgreSQL limitations
   - Running tests commands
   - Available fixtures
   - Guidelines for adding tests

## Commit

`42f7df9` - fix(159-10): add test infrastructure docs and pytest markers
