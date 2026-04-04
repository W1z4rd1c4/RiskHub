# Releasing RiskHub

> **Last Updated**: 2026-04-05
> **Audience**: Maintainers, operators

This runbook documents the tagged release flow for RiskHub.

## Release Model

- Tags are the release source of truth.
- Expected tag format: `v<semver>` (example: `v1.2.3`).
- The GitHub Actions release workflow builds:
  - GHCR images for backend, backend-db, frontend, and redis
  - `riskhub-linux-<version>.tar.gz`
- Release publication is blocked unless parity is `GO`.

## Required Inputs Before Tagging

- `CHANGELOG.md` contains a top-level section matching the exact release tag.
  - Example: `## v1.2.3`
- Release notes in that section are ready to publish as the GitHub Release body.
- The release candidate has passed:
  - release parity
  - smoke verification for the intended deployment target
  - any schema-sensitive Postgres verification needed for the release

## Release Workflow

1. Update `CHANGELOG.md`
   - Move completed work from `Unreleased` into a new section matching the target tag.
2. Create and push the tag
   - Example: `git tag v1.2.3 && git push origin v1.2.3`
3. GitHub Actions `release.yml` runs
   - validates parity
   - builds and pushes versioned GHCR images
   - builds and verifies the linux bundle
   - publishes the GitHub Release using the matching changelog section
4. Operators consume release assets
   - Docker: image refs derived from the tag
   - Linux: `riskhub-linux-<version>.tar.gz`

## Failure Conditions

- No matching changelog section for the tag
- Release parity decision is not `GO`
- Linux bundle verification fails
- GHCR image build or push fails

## Operator Notes

- `docs/deployment/README.md` is the deployment entrypoint.
- `docs/deployment/production.md` remains the install/upgrade runbook.
- Linux operators should retain the generated bundle and deployment metadata for rollback and audit context.
