#!/usr/bin/env bash
# Build a realistic agent-prepared import folder from the e2e fixtures.
# Usage: make-sample.sh <out-dir>   (default /tmp/verify-import)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-/tmp/verify-import}"
mkdir -p "$OUT/folder" "$OUT/shots"

cp "$ROOT/e2e/fixtures/iphone_home.png"  "$OUT/folder/01-home.ko.png"
cp "$ROOT/e2e/fixtures/iphone_decks.png" "$OUT/folder/01-home.en.png"
cp "$ROOT/e2e/fixtures/iphone_decks.png" "$OUT/folder/02-decks.ko.png"
cp "$ROOT/e2e/fixtures/iphone_home.png"  "$OUT/folder/04-review.ko.png"
echo "this is not an import file" > "$OUT/readme.txt"

cat > "$OUT/folder/manifest.json" <<'EOF'
{
  "version": 1,
  "name": "Flashcard PDF",
  "device": "iphone",
  "deviceModel": "iphone-16-pro",
  "sourceLocale": "ko",
  "targetLocales": ["en", "ja"],
  "themeBackground": "porcelain",
  "slides": [
    { "layout": "text-top", "textBlocks": 1 },
    { "layout": "text-bottom", "textBlocks": 2 },
    { "layout": "hero", "deviceFrame": false },
    { "layout": "split", "textBlocks": 2 }
  ]
}
EOF

cat > "$OUT/folder/screenshot-copy.csv" <<'EOF'
slide,slideId,field,ko,en,ja
1,,text:0,PDF가 플래시카드가 됩니다,Turn any PDF into flashcards,PDFがフラッシュカードに
2,,text:0,하루 5분 복습,Review in 5 minutes a day,1日5分の復習
2,,text:1,망각 곡선에 맞춘 자동 스케줄,Auto-scheduled to the forgetting curve,忘却曲線に合わせた自動スケジュール
3,,text:0,시험 전날 벼락치기는 그만,No more last-minute cramming,一夜漬けはもう終わり
4,,text:0,어디서나 이어서,Pick up anywhere,どこでも続きから
4,,text:1,iPhone·iPad 자동 동기화,Syncs across iPhone and iPad,iPhone・iPad間で自動同期
EOF

echo "sample ready: $OUT/folder"
