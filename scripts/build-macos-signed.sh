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
npx tauri build --bundles app,dmg
