# scripts/deploy/templates

## Purpose

Template inputs rendered by the deploy CLI when preparing supported deployment targets.

## Contents

- `linux/`
- `riskhub.env.example`
- `secrets/`

## Notes

Operators copy `riskhub.env.example` into `/etc/riskhub/riskhub.env`, use `secrets/README.md` plus the `*.example` files to populate `/etc/riskhub/secrets/`, and leave the Linux templates for deploy-time rendering only.
