---
description: Cut a signed, notarized macOS release and publish it to GitHub Releases
---

Release the desktop app. `scripts/release.sh` does the mechanical part; your job is the
judgment around it.

## 1. Decide the version

Read what has landed since the last tag:

```
git fetch --tags && git log "$(git describe --tags --abbrev=0)"..main --oneline
```

Patch for fixes only, minor when a user-visible feature landed. If the user named a version
in their message, use theirs. State the number and why in one line before running anything.

## 2. Draft the notes

Write them for someone deciding whether to download, not for the git log: what changed for
them, then anything they have to know (a new permission, a migration that resets something,
a switch they may want to flip). Save to a scratch file and pass it with `--notes`. Skip the
flag only for a release with nothing worth narrating — `--generate-notes` then lists commits.

## 3. Run it

```
./scripts/release.sh <version> --notes <file>
```

It refuses to start on a dirty tree, off main, with unpushed commits, on an existing tag, or
without `.env.signing`. Then: lint + unit + cargo tests → bump `tauri.conf.json` and
`Cargo.toml` → signed, notarized, universal build → verify the **app and the dmg** are both
notarized and stapled (a stapled app inside an unnotarized dmg still warns on download) →
commit the bump, tag, push, publish with the dmg attached.

`--dry-run` stops after verification and reverts the bump — use it when you only want to know
the build is clean.

## 4. Check what a downloader gets

The release is only real if the published asset passes Gatekeeper with the quarantine flag a
browser attaches. Download it back and check:

```
curl -sL -o /tmp/dl.dmg "$(gh release view <tag> --json assets -q '.assets[0].url')"
xattr -w com.apple.quarantine "0081;0;Safari;" /tmp/dl.dmg
spctl -a -t open --context context:primary-signature -vv /tmp/dl.dmg
```

`accepted / source=Notarized Developer ID` is the pass. Anything else: say so plainly and do
not tell the user the release is out.

## 5. Tell them what shipped

The tag, the download link, and — if the site's copy describes anything you just changed (the
install steps, a version number, a "not notarized yet" caveat) — say that the site needs a
matching edit, or make it.

## Notes

- Publishing is irreversible: a tag and a released asset are public the moment the script
  reaches step 3's end. Everything before that point is local and safe to abort.
- Notarization needs Apple's servers; a run takes ~5 minutes, most of it waiting.
- The npm side (`packages/mcp`) versions independently — `npm publish` from that directory,
  and it needs the user's own 2FA code.
