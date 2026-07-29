# Local fonts

Production typography is self-hosted from this directory so the application does not execute or depend on external font providers.

- `fonts.css` declares the local Inter and Outfit variable font faces.
- `manifest.json` records the upstream package version, asset paths, and SHA-256 checksums.
- `../../../public/fonts/licenses/*-OFL-1.1.txt` contains each font family's
  license and is copied into the production distribution by Vite.
- `files/` contains the WOFF2 assets referenced by the stylesheet and manifest.

When replacing a font asset, update its checksum in `manifest.json` and run the local-font contract test before committing the change.
