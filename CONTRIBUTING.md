# Contributing to RiskHub

RiskHub accepts contributions that improve correctness, usability, documentation quality, and operational trustworthiness.

## Before You Start

- Read [README.md](./README.md) for the repo front door.
- Use the supported local startup flow in [docs/development/README.md](./docs/development/README.md).
- Use the testing matrix in [docs/TESTING.md](./docs/TESTING.md) to pick the smallest meaningful verification for your change.
- If your change affects security reporting or disclosure handling, read [SECURITY.md](./SECURITY.md) first.

## Good First Contributions

- documentation clarifications and broken-link fixes
- README or onboarding improvements
- targeted bug fixes with regression coverage
- test hardening for documented workflows
- developer-experience improvements that preserve the supported startup paths

## Contribution Workflow

1. Open an issue if the change is large, ambiguous, or user-facing.
2. Keep pull requests scoped to one coherent change.
3. Explain the problem, the fix, and the verification you ran.
4. Link the relevant issue, docs section, or behavior reference where possible.
5. Update nearby docs when behavior, commands, or contributor expectations change.

## Development Expectations

- Use `./scripts/compose.sh up` for the Docker onboarding flow.
- Use `./scripts/dev.sh` for active local backend/frontend iteration.
- Treat [docs/development/README.md](./docs/development/README.md) as the canonical source for startup behavior and caveats.
- Treat [docs/BUSINESS_LOGIC.md](./docs/BUSINESS_LOGIC.md) as the canonical source for workflow, RBAC, and approval behavior.

## Verification Expectations

Run the smallest relevant checks from [docs/TESTING.md](./docs/TESTING.md). Common examples:

```bash
make -f scripts/Makefile test
cd frontend && npm run test:run
cd frontend && npx tsc --noEmit
make -f scripts/Makefile test-e2e
```

Documentation and contributor-surface changes should also keep links and docs contracts healthy.

## Pull Request Quality Bar

- keep diffs focused
- avoid unrelated churn
- explain user-facing behavior changes
- mention risks or known follow-up work
- include verification notes in the PR description

## Community Standards

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
