# RiskHub

RiskHub is a risk management platform with a Docker-first onboarding path and separate local contributor and production workflows.

## Quick Start

Recommended for most people:

```bash
./scripts/compose.sh up
```

Open `http://localhost/login`.

## Local Development

For active backend/frontend iteration:

```bash
./scripts/dev.sh
```

Docker is required for the recommended path. Local contributor mode requires the local toolchain described in [docs/development/README.md](./docs/development/README.md).

## Production

Production and operator lifecycle:

```bash
./scripts/deploy.sh
```

## More Documentation

- [Development startup guide](./docs/development/README.md)
- [Full documentation index](./docs/README.md)
