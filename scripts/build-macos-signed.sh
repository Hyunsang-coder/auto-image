#!/usr/bin/env bash
# Signed + notarized macOS build. Secrets come from the environment — never the
# repo. Put them in a gitignored `.env.signing` at the repo root (see
# docs/SIGNING.md) or export them yourself before running.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.signing"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

# Signing identity is required (Tauri also reads it from tauri.conf.json, but we
# keep it in the env so no identity string lands in the repo).
: "${APPLE_SIGNING_IDENTITY:?set APPLE_SIGNING_IDENTITY, e.g. 'Developer ID Application: Your Name (TEAMID)' — see docs/SIGNING.md}"
echo "Signing identity: $APPLE_SIGNING_IDENTITY"

# Notarization is optional but recommended; pick ONE credential method.
if [ -n "${APPLE_API_KEY:-}" ]; then
  : "${APPLE_API_ISSUER:?APPLE_API_KEY is set but APPLE_API_ISSUER is missing}"
  : "${APPLE_API_KEY_PATH:?APPLE_API_KEY is set but APPLE_API_KEY_PATH is missing}"
  echo "Notarizing via App Store Connect API key ($APPLE_API_KEY)."
elif [ -n "${APPLE_ID:-}" ]; then
  : "${APPLE_PASSWORD:?APPLE_ID is set but APPLE_PASSWORD is missing}"
  : "${APPLE_TEAM_ID:?APPLE_ID is set but APPLE_TEAM_ID is missing}"
  echo "Notarizing via Apple ID ($APPLE_ID)."
else
  echo "WARNING: no notarization credentials — the build is signed but NOT notarized." >&2
  echo "         Gatekeeper will still block it on other Macs." >&2
fi

cd "$ROOT"
# Extra args pass through, e.g. --target universal-apple-darwin for a build
# that also runs on Intel Macs.
npx tauri build --bundles app,dmg "$@"

# Tauri notarizes and staples the .app but only *signs* the .dmg — and the dmg
# is what people download, so Gatekeeper judges it as "Unnotarized Developer ID"
# and blocks the disk image even though the app inside is clean. Submit it too.
DMG="$(ls -t "$ROOT"/src-tauri/target/*/release/bundle/dmg/*.dmg \
                "$ROOT"/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
if [ -z "$DMG" ]; then
  echo "no dmg found to notarize" >&2
  exit 1
fi

if [ -n "${APPLE_API_KEY:-}" ]; then
  xcrun notarytool submit "$DMG" \
    --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
elif [ -n "${APPLE_ID:-}" ]; then
  xcrun notarytool submit "$DMG" \
    --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
else
  echo "dmg left unnotarized — no credentials" >&2
  exit 0
fi

# Staples the ticket into the dmg so a first launch works offline too.
xcrun stapler staple "$DMG"
spctl -a -t open --context context:primary-signature -v "$DMG"
