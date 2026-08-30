#!/usr/bin/env bash
# Cut a macOS release: bump → gates → signed+notarized universal build → verify
# → tag → GitHub release. Every step that can silently produce a broken download
# is checked, because the failure mode is a user seeing Gatekeeper block the app.
#
#   ./scripts/release.sh                          # next patch after the shipped version
#   ./scripts/release.sh minor                    # or major — bumps from the current version
#   ./scripts/release.sh 0.2.0                    # or name it outright
#   ./scripts/release.sh --notes notes.md         # hand-written release notes
#   ./scripts/release.sh --dry-run                # build + verify, no tag/push/publish
#
# Signing credentials come from .env.signing (see docs/SIGNING.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUMP=""
NOTES_FILE=""
DRY_RUN=0

# A bare first argument is the version (or the part to bump); flags may come first.
case "${1:-}" in
  -*|"") ;;
  *) BUMP="$1"; shift ;;
esac
while [ $# -gt 0 ]; do
  case "$1" in
    --notes) NOTES_FILE="${2:?--notes needs a file}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

CURRENT="$(sed -nE 's/^  "version": "([0-9]+\.[0-9]+\.[0-9]+)",$/\1/p' src-tauri/tauri.conf.json)"
[ -n "$CURRENT" ] || { echo "could not read the current version from tauri.conf.json" >&2; exit 1; }

# The default is the next patch: the common case is shipping what has landed
# since the last release, and naming the number by hand is how a release ends up
# tagged one version behind what the app reports.
next() {
  IFS=. read -r major minor patch <<EOF
$CURRENT
EOF
  case "$1" in
    major) printf '%s.0.0' "$((major + 1))" ;;
    minor) printf '%s.%s.0' "$major" "$((minor + 1))" ;;
    patch) printf '%s.%s.%s' "$major" "$minor" "$((patch + 1))" ;;
  esac
}

case "$BUMP" in
  "" | patch | minor | major) VERSION="$(next "${BUMP:-patch}")" ;;
  *)
    VERSION="$BUMP"
    printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || {
      echo "usage: ./scripts/release.sh [major|minor|patch|X.Y.Z] [--notes FILE] [--dry-run]" >&2
      exit 2
    }
    ;;
esac

TAG="v$VERSION"
say() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
say "Preflight — $CURRENT → $VERSION"
# ---------------------------------------------------------------------------
[ -f .env.signing ] || { echo ".env.signing missing — see docs/SIGNING.md" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree is dirty — commit or stash first" >&2; exit 1; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || { echo "on $BRANCH, not main" >&2; exit 1; }

git fetch -q origin
[ -z "$(git log origin/main..main --oneline)" ] || { echo "main has unpushed commits — push them first" >&2; exit 1; }

if git rev-parse "$TAG" >/dev/null 2>&1 || gh release view "$TAG" >/dev/null 2>&1; then
  echo "$TAG already exists" >&2
  exit 1
fi
echo "main is clean and pushed; $TAG is free"

# ---------------------------------------------------------------------------
say "Gates"
# ---------------------------------------------------------------------------
npm run lint
npm run test:unit
(cd src-tauri && cargo test --quiet)

# ---------------------------------------------------------------------------
say "Version → $VERSION"
# ---------------------------------------------------------------------------
# The bundle version comes from tauri.conf.json; the crate version is kept in
# step so a `cargo` reader never disagrees with the shipped app.
/usr/bin/sed -i '' -E "s/^  \"version\": \"[0-9.]+\",/  \"version\": \"$VERSION\",/" src-tauri/tauri.conf.json
/usr/bin/sed -i '' -E "s/^version = \"[0-9.]+\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
grep -q "\"version\": \"$VERSION\"" src-tauri/tauri.conf.json || { echo "tauri.conf.json bump failed" >&2; exit 1; }

# ---------------------------------------------------------------------------
say "Build (signed + notarized, universal)"
# ---------------------------------------------------------------------------
./scripts/build-macos-signed.sh --target universal-apple-darwin

APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Screenshot Studio.app"
DMG="src-tauri/target/universal-apple-darwin/release/bundle/dmg/Screenshot Studio_${VERSION}_universal.dmg"
[ -d "$APP" ] || { echo "no .app at $APP" >&2; exit 1; }
[ -f "$DMG" ] || { echo "no .dmg at $DMG" >&2; exit 1; }

# ---------------------------------------------------------------------------
say "Verify"
# ---------------------------------------------------------------------------
# Both halves: a stapled app inside an unnotarized dmg still warns on download.
spctl -a -vv "$APP" 2>&1 | grep -q "source=Notarized Developer ID" || { echo "app is not notarized" >&2; exit 1; }
spctl -a -t open --context context:primary-signature -vv "$DMG" 2>&1 | grep -q "source=Notarized Developer ID" || { echo "dmg is not notarized" >&2; exit 1; }
xcrun stapler validate "$APP" >/dev/null
xcrun stapler validate "$DMG" >/dev/null
ARCHS="$(lipo -archs "$APP/Contents/MacOS/app")"
case "$ARCHS" in *x86_64*arm64*|*arm64*x86_64*) ;; *) echo "not universal: $ARCHS" >&2; exit 1 ;; esac
PLIST_VERSION="$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")"
[ "$PLIST_VERSION" = "$VERSION" ] || { echo "app says $PLIST_VERSION, releasing $VERSION" >&2; exit 1; }
echo "notarized · stapled · $ARCHS · $PLIST_VERSION"

ASSET="$ROOT/dist-release/ScreenshotStudio-${VERSION}-universal.dmg"
mkdir -p "$(dirname "$ASSET")"
cp "$DMG" "$ASSET"

if [ "$DRY_RUN" = "1" ]; then
  say "Dry run — stopping before tag/push/publish"
  echo "artifact: $ASSET"
  git checkout -- src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock 2>/dev/null || true
  exit 0
fi

# ---------------------------------------------------------------------------
say "Tag + publish"
# ---------------------------------------------------------------------------
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -q -m "Release $VERSION"
git push -q origin main

if [ -n "$NOTES_FILE" ]; then
  gh release create "$TAG" --target main --title "Screenshot Studio $VERSION" --notes-file "$NOTES_FILE" "$ASSET"
else
  gh release create "$TAG" --target main --title "Screenshot Studio $VERSION" --generate-notes "$ASSET"
fi

say "Released"
gh release view "$TAG" --json tagName,name,assets -q '"\(.tagName) — \(.assets[0].name) (\(.assets[0].size) bytes)"'
