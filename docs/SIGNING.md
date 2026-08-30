# macOS code signing & notarization

The desktop app (`src-tauri/`) must be **code-signed** to run without Gatekeeper
warnings, and **notarized** to run on Macs other than the build machine.

> Signing also fixes a local-dev annoyance: an *unsigned* build gets a fresh
> identity on every rebuild, so macOS re-prompts for Keychain access (where the
> API keys live). Signing with **any stable identity** stops that.

All secrets live in the environment, never in the repo. The build script reads a
gitignored `.env.signing` at the repo root (matched by `.env.*` in `.gitignore`).

## 1. Prerequisites

- An Apple Developer account ($99/yr).
- A **Developer ID Application** certificate installed in your login Keychain
  (Xcode → Settings → Accounts → Manage Certificates → ＋ → *Developer ID
  Application*, or download from the Developer portal).

Find the identity string:

```bash
security find-identity -v -p codesigning
# → "Developer ID Application: Your Name (TEAMID)"
```

## 2. Notarization credentials — pick ONE

**A) App Store Connect API key (recommended — no 2FA prompts):**
App Store Connect → *Users and Access* → *Integrations* → generate a key with
*Developer* access. Download the `.p8` once.

```sh
APPLE_API_ISSUER="<Issuer ID above the keys table>"
APPLE_API_KEY="<Key ID column>"
APPLE_API_KEY_PATH="/absolute/path/to/AuthKey_XXXX.p8"
```

**B) Apple ID + app-specific password:**
Create an [app-specific password](https://support.apple.com/en-ca/HT204397).

```sh
APPLE_ID="you@example.com"
APPLE_PASSWORD="abcd-efgh-ijkl-mnop"   # app-specific password
APPLE_TEAM_ID="TEAMID"
```

## 3. Put it together

Create `.env.signing` at the repo root (gitignored):

```sh
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
# then one notarization block from step 2, e.g.:
APPLE_API_ISSUER="..."
APPLE_API_KEY="..."
APPLE_API_KEY_PATH="/Users/you/keys/AuthKey_XXXX.p8"
```

Build (extra args go to `tauri build` — releases ship universal so Intel Macs
can run them):

```bash
./scripts/build-macos-signed.sh --target universal-apple-darwin
```

Tauri signs the `.app` with `APPLE_SIGNING_IDENTITY` (hardened runtime is applied
automatically) and, when notarization credentials are present, submits it to
Apple and staples the ticket. It then signs the `.dmg` but does **not** notarize
it — and the dmg is what people download, so Gatekeeper judges it as
"Unnotarized Developer ID" and blocks the disk image even though the app inside
is clean. The script submits and staples the dmg itself for that reason.
Output: `src-tauri/target/universal-apple-darwin/release/bundle/{macos,dmg}/`.

Verify (both halves — a stapled app inside an unnotarized dmg still warns):

```bash
spctl -a -vvv "src-tauri/target/universal-apple-darwin/release/bundle/macos/Screenshot Studio.app"
spctl -a -t open --context context:primary-signature -vvv "src-tauri/target/universal-apple-darwin/release/bundle/dmg/Screenshot Studio_0.1.1_universal.dmg"
# both → accepted, source=Notarized Developer ID
```

## Notes

- **Local dev only** (no distribution): sign with any installed identity (even an
  *Apple Development* cert) to stop the Keychain re-prompts — set
  `APPLE_SIGNING_IDENTITY` and skip the notarization vars.
- **DMG bundling** (`bundle_dmg.sh` drives Finder via osascript) has run fine
  from a non-interactive shell in recent builds; `--bundles app` skips it if a
  particular environment does hang.
- **App Store** distribution is a different path (a `.pkg`, App Sandbox
  entitlements, an *Apple Distribution* cert) and is not covered here.
- If notarization rejects the app for a missing entitlement, add an
  `Entitlements.plist` and point `bundle.macOS.entitlements` at it in
  `tauri.conf.json`. The current WKWebView build needs none.
