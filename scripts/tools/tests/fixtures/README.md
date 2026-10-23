# Resolver trust fixtures

These public CA certificates were extracted from pip 26.2.1's vendored certifi
bundle. They contain no private keys or secrets and are used only as test inputs.

- `pip-compromised-emsign-g3.pem` is emSign ECC Root CA - G3, the compromised
  trust anchor removed by certifi 2026.10.19 and pip 26.2.2. The trust guard must
  reject a vendor bundle containing it.
- `pip-unaffected-root.pem` is COMODO ECC Certification Authority, an unaffected
  control that the guard must accept.

The regression test loads each fixture through Python's real SSL certificate
store parser, independently of the application's certifi installation.
