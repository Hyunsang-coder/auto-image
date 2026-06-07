#!/usr/bin/env bash
# Build a runnable promo-video input set from the e2e fixtures: an English-only
# import folder (manifest + en screenshots + en captions) plus a fully translated
# CSV to import on camera. Zero external data needed.
# Usage: make-sample.sh <out-dir>   (default /tmp/promo-demo)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-/tmp/promo-demo}"
EN="$OUT/import-en"
mkdir -p "$EN"

# 5 English-only screenshots (alternate the two iPhone fixtures)
for i in 1 2 3 4 5; do
  src=$([ $((i % 2)) -eq 1 ] && echo iphone_home.png || echo iphone_decks.png)
  cp "$ROOT/e2e/fixtures/$src" "$EN/0$i-slide.en.png"
done

cat > "$EN/manifest.json" <<'EOF'
{
  "version": 1,
  "name": "Flashcard PDF",
  "device": "iphone",
  "sourceLocale": "en",
  "targetLocales": ["ko", "ja", "de", "fr", "es", "es-MX", "pt-BR", "it"],
  "slides": [
    { "layout": "text-top", "textBlocks": 2 },
    { "layout": "text-top", "textBlocks": 2 },
    { "layout": "text-top", "textBlocks": 2 },
    { "layout": "text-top", "textBlocks": 2 },
    { "layout": "text-top", "textBlocks": 2 }
  ]
}
EOF

# English-only captions = the starting state shown on camera
cat > "$EN/captions-en.csv" <<'EOF'
slide,slideId,field,en
1,,text:0,Turn any PDF into flashcards
1,,text:1,Study smarter in minutes
2,,text:0,Review in 5 minutes a day
2,,text:1,Auto-scheduled to the forgetting curve
3,,text:0,Shape cards with AI
3,,text:1,Edit, refine, make them yours
4,,text:0,Pick up anywhere
4,,text:1,Syncs across iPhone and iPad
5,,text:0,Build a steady learning habit
5,,text:1,Track study time, streaks, and progress
EOF

# the translated CSV imported mid-video (9 languages)
cat > "$OUT/translated.csv" <<'EOF'
slide,slideId,field,en,ko,ja,de,fr,es,es-MX,pt-BR,it
1,,text:0,Turn any PDF into flashcards,PDF가 플래시카드가 됩니다,PDFがフラッシュカードに,Aus jedem PDF werden Lernkarten,Transformez tout PDF en cartes,Convierte cualquier PDF en tarjetas,Convierte cualquier PDF en tarjetas,Transforme qualquer PDF em flashcards,Trasforma ogni PDF in flashcard
1,,text:1,Study smarter in minutes,몇 분 만에 똑똑하게,数分で賢く学習,In Minuten clever lernen,Révisez malin en quelques minutes,Estudia mejor en minutos,Estudia mejor en minutos,Estude melhor em minutos,Studia meglio in pochi minuti
2,,text:0,Review in 5 minutes a day,하루 5분 복습,1日5分の復習,5 Minuten am Tag,Révisez 5 minutes par jour,Repasa 5 minutos al día,Repasa 5 minutos al día,Revise 5 minutos por dia,Ripassa 5 minuti al giorno
2,,text:1,Auto-scheduled to the forgetting curve,망각 곡선에 맞춘 자동 스케줄,忘却曲線に合わせた自動スケジュール,Automatisch nach der Vergessenskurve,Planifié selon la courbe de l'oubli,Programado según la curva del olvido,Programado según la curva del olvido,Agendado pela curva do esquecimento,Pianificato sulla curva dell'oblio
3,,text:0,Shape cards with AI,AI로 카드 다듬기,AIでカードを作る,Karten mit KI gestalten,Créez vos cartes avec l'IA,Crea tarjetas con IA,Crea tarjetas con IA,Crie cartões com IA,Crea le carte con l'IA
3,,text:1,Edit refine make them yours,수정하고 다듬어 내 것으로,編集して自分仕様に,Bearbeiten und anpassen,Modifiez et personnalisez,Edita y personaliza,Edita y personaliza,Edite e personalize,Modifica e personalizza
4,,text:0,Pick up anywhere,어디서나 이어서,どこでも続きから,Überall weitermachen,Reprenez partout,Continúa donde sea,Continúa donde sea,Continue de qualquer lugar,Riprendi ovunque
4,,text:1,Syncs across iPhone and iPad,iPhone·iPad 자동 동기화,iPhone・iPadで自動同期,Sync über iPhone und iPad,Synchro iPhone et iPad,Sincroniza en iPhone y iPad,Sincroniza en iPhone y iPad,Sincroniza no iPhone e iPad,Sincronizza tra iPhone e iPad
5,,text:0,Build a steady learning habit,꾸준한 학습 습관,学習習慣を作る,Feste Lerngewohnheit,Une habitude d'apprentissage,Crea un hábito de estudio,Crea un hábito de estudio,Crie um hábito de estudo,Crea un'abitudine di studio
5,,text:1,Track study time streaks and progress,학습 시간·연속·진행 추적,学習時間と進捗を記録,Lernzeit und Fortschritt,Suivez temps et progrès,Sigue tiempo y progreso,Sigue tiempo y progreso,Acompanhe tempo e progresso,Monitora tempo e progressi
EOF

echo ":: sample ready"
echo "::   en-only import set : $EN"
echo "::   translated CSV     : $OUT/translated.csv"
