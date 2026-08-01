# tests/frontend/contracts

Machine-readable frontend test contracts shared by validators, unit tests, and
Playwright. `dialog-surfaces.json` is the canonical two-level dialog descriptor;
update it only with matching production and executable test coverage.
`dora-e2e-requirements.json` maps the versioned DORA behavior requirements to
their required Playwright `ci` evidence without pinning the suite's total count.
