---
description: Run full test suite and verify feature readiness before commit
---

<objective>
Ensure the current changes pass all automated tests and meet the quality standards of the Platform Team project.
</objective>

<process>
1. **Frontend Unit Tests**: Run `npm run test:unit`. If it fails, fix the code or the test.
2. **Backend Tests**: Run `go test ./...` (if Go is installed).
3. **E2E Tests**: Run `npx playwright test` for impacted flows.
4. **Code Quality**: Run `npm run lint`.
5. **Report**: Summarize the test results.
</process>

<success_criteria>
- All tests pass (Unit, Backend, E2E).
- No new lint errors introduced.
- Coverage remains stable or improves.
</success_criteria>
