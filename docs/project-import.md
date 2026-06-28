# 프로젝트 가져오기 — AI 에이전트용 스펙

스튜디오의 **1단계(설정) → 프로젝트 가져오기**는 파일 묶음 하나로 export 전 단계까지 완성된 프로젝트(슬라이드 + 로케일별 스크린샷 + 캡션/번역)를 조립한다. AI 에이전트는 아래 형식으로 폴더에 파일을 준비하고, 사람은 그 파일들을 **한 번에 다중 선택**하면 된다 (ZIP 아님). 에디터가 검수 단계다.

## 파일 구성

| 파일 | 개수 | 역할 |
|---|---|---|
| 매니페스트 `.json` | 1 (필수) | 프로젝트 구조 — 이름·기기·로케일·슬라이드 레이아웃/슬롯 |
| 스크린샷 `.png/.jpg/.webp` | 0+ | `{n}[-설명].{locale}.{ext}` 파일명 규칙으로 슬라이드에 배치 |
| 캡션 `.csv` 또는 `.json` | 0–1 | localize 템플릿 형식 — 헤드라인/서브헤드 텍스트 + 번역 |

파일명은 자유 — 매니페스트와 캡션 JSON은 **내용 모양**으로 구분한다: `version` + `slides` 배열이 있으면 매니페스트, `rows` 배열이 있으면 캡션. CSV와 캡션 JSON이 둘 다 있으면 CSV가 이긴다.

## 매니페스트 스키마 (version 1)

```jsonc
{
  "version": 1,                  // 필수. 1만 지원
  "name": "Dogo",                // 필수. 프로젝트(앱) 이름
  "device": "iphone",            // "iphone" | "ipad" — 기본 iphone
  "deviceModel": "iphone-16-pro",// 해당 타입의 ASC 해상도 — 기본: 타입별 최대 사이즈
  "sourceLocale": "ko",          // 기준 언어 — 기본 ko
  "targetLocales": ["en", "ja"], // 추가 언어 — 기본 []
  "themeBackground": "porcelain",// 프리셋 id 또는 인라인 배경(아래) — 기본: 레퍼런스 그라디언트
  "slides": [                    // 필수, 1~10장. 순서 = 슬라이드 순서
    { "layout": "text-top", "textBlocks": 1 },
    { "layout": "text-bottom", "textBlocks": 2 },
    { "layout": "hero", "deviceFrame": false },
    { "layout": "split", "background": { "type": "solid", "color": "#101015" } },
    { "layout": "text-bottom", "span": { "group": "demo", "role": "leader" } },
    { "layout": "text-top", "span": { "group": "demo", "role": "follower" } }
  ]
}
```

### 필드 상세

| 필드 | 타입 | 기본값 | 비고 |
|---|---|---|---|
| `version` | `1` | — | 필수. 다른 값이면 전체 실패 |
| `name` | string | — | 필수. 공백만이면 실패 |
| `device` | `iphone`\|`ipad` | `iphone` | 프로젝트당 한 타입 |
| `deviceModel` | string | 타입별 최대 | iPhone: `iphone-16-pro`(1320×2868)·`iphone-6-5`(1242×2688), iPad: `ipad-pro-13`(2064×2752)·`ipad-11`(1668×2388) |
| `sourceLocale` | string | `ko` | 지원: `en ko ja de fr es it pt-BR es-MX vi id th` |
| `targetLocales` | string[] | `[]` | 같은 지원 목록. 미지원 코드는 경고 후 제외 |
| `themeBackground` | string \| object | 레퍼런스 그라디언트 | 문자열 = 테마 프리셋 id. 객체 = `{"type":"solid","color":"#…"}` 또는 `{"type":"gradient","gradient":{"direction":145,"stops":[{"color":"#…","position":0},…]}}`. `image` 불가 |
| `slides[].layout` | string | `text-top` | `hero` \| `hero-bleed` \| `text-top` \| `text-bottom` \| `split` |
| `slides[].textBlocks` | 1–4 | `1` | **캡션 슬롯 수.** 텍스트 블록 0 = 헤드라인 |
| `slides[].background` | string \| object | 테마 배경 | 슬라이드별 오버라이드 |
| `slides[].deviceFrame` | boolean \| object | `false` | 기본은 베젤 숨김(스크린샷만 플로팅). `true` = 기기 베젤 표시. 객체형은 `show: true`를 명시해야 베젤이 나오며 아래 [기기 transform](#기기-transform--플로팅-카드--장식-디자인-노브) 적용 |
| `slides[].screenshotStyle` | object | — | 플로팅 카드 룩(베젤 숨김일 때 적용) — 아래 참조 |
| `slides[].ornaments` | array | — | 이모지 장식, 슬라이드당 최대 5개 — 아래 참조 |
| `slides[].externalImages` | array | — | 기기 스크린샷과 독립된 bitmap 이미지, 슬라이드당 최대 3개. 각 항목의 `file`은 같이 선택한 이미지 파일명. 렌더 스타일은 `screenshotStyle`과 같은 `cornerRadiusRatio`/`shadow`/`crop`을 사용 |
| `slides[].texts` | array | — | **블록별 텍스트 스타일/위치 오버라이드**(폰트·색·정렬·박스 등) — 아래 참조 |
| `slides[].highlights` | array | — | **루페(돋보기)** — 스크린샷 특정 영역 확대 카드, 슬라이드당 최대 3개 — 아래 참조 |
| `slides[].badges` | array | — | 배지/필 슬롯. 캡션 파일의 `badge:N` 행으로 텍스트/번역 채움 — 아래 참조 |
| `slides[].span` | object | — | 인접한 두 슬라이드를 2-page span으로 묶음 — 아래 참조 |

### 레이아웃별 배치

| layout | 배치 |
|---|---|
| `text-top` | 텍스트 상단, 기기 그 아래 — 기본. 기기가 하단 모서리 밖으로 블리드되는 레퍼런스 룩 |
| `text-bottom` | 기기 상단, 텍스트 하단(74% 지점). 가져오기가 기기 scale 0.85를 시드해 기본 크기 기기가 텍스트 밴드를 침범하지 않게 한다 |
| `hero` | 텍스트 전용 — 스크린샷 슬롯 없음 |
| `hero-bleed` | 텍스트 좌상단, 큰 기기가 우하단 모서리 밖으로 블리드 |
| `split` | 텍스트 좌측 컬럼(왼쪽 정렬), 기기 우측 절반에 세로 중앙 |

### 기기 transform · 플로팅 카드 · 장식 (디자인 노브)

레이아웃 기본 배치를 벗어나는 디자인은 세 필드로 표현한다. 전부 옵션 —
생략하면 기존 v1과 동일하게 동작한다. 범위 밖 값은 경계값으로 보정 + 경고.

```jsonc
{
  "layout": "text-top",
  "deviceFrame": {           // boolean 대신 객체를 주면 기기 transform까지 제어
    "show": true,            // 기본 false — 베젤을 보이려면 명시해야 함
    "offsetX": 30,           // 에디터 캔버스(440px 기준) px, ±400
    "offsetY": -20,          // ±600
    "scale": 0.9,            // 0.3–2.0. text-bottom은 생략 시 0.85 자동 시드 — 명시하면 명시값이 이김
    "rotation": 8,           // 도(deg), ±180으로 정규화
    "color": "silver"        // "black"(기본) | "silver"
  },
  "screenshotStyle": {       // 베젤 숨김(show:false) 슬라이드의 플로팅 카드 룩
    "cornerRadiusRatio": 0.08, // 0–0.2 (기본 0.06)
    "shadow": true,
    "crop": { "top": 0, "right": 0, "bottom": 0.05, "left": 0 } // 각 변 0–0.5 잘라내기
  },
  "ornaments": [             // 이모지 장식, 최대 5개. 미지원 shape는 경고 후 제외
    { "shape": "sparkles", "x": 0.88, "y": 0.12, "size": 0.10, "rotation": 0, "opacity": 0.85 }
  ],
  "externalImages": [        // bitmap 이미지, 최대 3개. file은 선택 파일명과 일치해야 함
    {
      "file": "1-external-1.png",
      "x": 0.42,
      "y": 0.55,
      "width": 0.28,
      "rotation": -8,
      "opacity": 1,
      "cornerRadiusRatio": 0.06,
      "shadow": true,
      "crop": { "top": 0, "right": 0, "bottom": 0.08, "left": 0 }
    }
  ]
}
```

- `screenshotStyle`은 항상 파싱·저장되지만 **렌더는 베젤 숨김일 때만 반영**된다
  (베젤이 보이면 기기 형태가 모양을 정의). 미리 넣어둬도 무해.
- ornament `shape` 18종: `star sparkles heart flower leaf paw fire party rocket
  bulb bolt check thumbsup trophy gem target bell hundred`. 이모지로 렌더되므로
  `color`는 받아두지만 적용되지 않는다. `x`/`y`/`size`는 캔버스 비율(0–1).
- external image는 `x`/`y`(중심), `width`(캔버스 폭 비율), `rotation`,
  `opacity`, `cornerRadiusRatio`, `shadow`, `crop`을 저장한다. `x`/`y`는
  -0.5~1.5까지 허용해 캔버스 밖 블리드를 만들 수 있고, `width`는
  0.05~1.5로 보정된다. 렌더 스타일은 기기 플로팅 카드와 동일하지만
  외부 이미지에는 `deviceFrame.show` 같은 프레임 토글이 없다.
- `deviceFrame.scale`/`offsetX`/`offsetY` 범위는 에디터의 드래그 클램프와 동일.

추가로 슬라이드별 `textY`(0–1)로 **헤드라인을 절대 위치로 내릴 수 있다** —
레이아웃 기본 텍스트 밴드를 무시하고 캔버스 세로 비율 위치에 고정한다
(크롭한 피처 카드 쪽으로 헤드라인을 붙일 때 유용). `textX`(0–1, 기본 0.5)는
가로 위치. `textY`가 있을 때만 활성화되며 헤드라인(text:0)에만 적용된다 —
서브헤드 등 이후 블록은 레이아웃 기본 위치에서 스택된다.

```jsonc
{ "layout": "text-top", "textY": 0.2 }   // 헤드라인을 캔버스 20% 지점으로
```

### 블록별 텍스트 스타일 (`slides[].texts`)

레이아웃 기본 폰트/색/정렬을 **텍스트 블록 단위로** 덮어쓴다. 배열 인덱스 =
블록 슬롯(0 = 헤드라인, 1+ = 서브헤드). 전부 옵션 — 생략한 필드는 레이아웃
기본값을 유지한다. 빈 슬롯(`{}`)을 넣어 뒷 인덱스 정렬을 맞출 수 있다.

```jsonc
{
  "layout": "text-top",
  "textBlocks": 2,
  "texts": [
    {                          // 블록 0 (헤드라인)
      "fontScale": 1.3,        // 레이아웃 기본 크기 ×배수 (0.3–4). 여백 채우기용
      "fontSize": 52,          // 또는 절대 에디터 px(8–200). 있으면 fontScale보다 우선
      "fitToBox": true,        // 긴 문구는 박스 폭에 맞춰 자동 축소. fontSize/fontScale은 최대 크기 역할
      "color": "#FFFFFF",
      "align": "left",         // left | center | right
      "weight": 800,           // 100–900
      "pos": { "x": 0.2, "y": 0.18 }, // 절대 위치(0–1). textX/textY를 모든 블록으로 일반화 — 있으면 헤드라인 textY보다 우선
      "boxWidth": 0.7,         // 줄바꿈 폭(캔버스 너비 비율, 0.1–2)
      "box": { "fill": "#000000", "opacity": 0.5, "paddingX": 16, "paddingY": 10, "borderRadius": 12 }, // 캡션 뒤 필 박스. fill만 필수
      "outline": { "color": "#000000", "width": 2 },                       // 글리프 외곽선
      "shadow": { "color": "#000000", "opacity": 0.4, "offsetX": 0, "offsetY": 2, "blur": 6 } // 드롭 섀도
    },
    {}                         // 블록 1 (서브헤드) — 오버라이드 없음, 레이아웃 기본 유지
  ]
}
```

- 모든 px 값(`fontSize`, `box`의 padding/radius, `outline.width`, `shadow` offset/blur)은
  **에디터 캔버스 440px 기준** — export 시 해상도에 맞춰 자동 스케일된다.
- `fontSize`와 `fontScale`을 둘 다 주면 `fontSize`(절대값)가 이긴다.
- `fitToBox: true`는 긴 번역/카피를 박스 폭에 맞게 축소한다. 짧은 문구는 지정한 최대 크기를 유지한다.
- `box`/`outline`/`shadow`는 `fill`/`color`(문자열)만 필수, 나머지 수치는 기본값으로
  채워진다(`{ "box": { "fill": "#000" } }`만으로도 동작). 범위 밖 값은 경계값 보정.
- `texts[0].pos`는 헤드라인의 `textY`/`textX` 단축 표기를 덮어쓴다(둘 다 있으면 `pos`가 이김).

### 배지 (`slides[].badges`)

배지는 manifest가 슬롯을 선언해야 생성된다. 이후 캡션 CSV/JSON의 `badge:0`,
`badge:1` 행이 base/translation 텍스트를 채운다. 선언하지 않은 배지 행은 기존처럼
건너뛴다. 슬라이드당 최대 5개.

```jsonc
{
  "badges": [
    {
      "text": "New",          // 옵션. 캡션 파일이 있으면 sourceLocale 값으로 덮어씀
      "left": 0.5,            // 중심 X, 캔버스 비율 0–1. 기본 0.5
      "top": 0.06,            // top edge, 캔버스 비율 0–1. 기본 0.03
      "style": {
        "backgroundColor": "#111111",
        "textColor": "#FFFFFF",
        "fontSize": 30,
        "fontWeight": 800,
        "paddingX": 14,
        "paddingY": 7,
        "borderRadius": 99
      }
    }
  ]
}
```

### 2-page span (`slides[].span`)

두 인접 슬라이드가 같은 `group`을 공유하고, 첫 장이 `leader`, 바로 다음 장이
`follower`일 때만 span으로 묶인다. leader가 배경·기기·스크린샷·장식·하이라이트·배지를
소유하고, 텍스트는 각 슬라이드가 자기 페이지의 텍스트를 소유한다. export는 2배 폭
캔버스를 한 번 렌더링한 뒤 왼쪽/오른쪽 PNG로 잘라 pixel-perfect하게 맞춘다.

```jsonc
{
  "slides": [
    {
      "layout": "text-bottom",
      "deviceFrame": { "show": true, "scale": 0.55, "rotation": 24, "offsetX": 20 },
      "span": { "group": "feature-a", "role": "leader" }
    },
    {
      "layout": "text-top",
      "span": { "group": "feature-a", "role": "follower" }
    }
  ]
}
```

유효하지 않은 span(세 장 이상, leader/follower 누락, 인접하지 않음, 순서 반대)은
경고 후 일반 단일 슬라이드로 가져온다.

### 루페 / 돋보기 (`slides[].highlights`)

스크린샷의 **특정 영역만 확대한 카드**를 그 영역 위에 띄운다. 크롭 대신 핵심
UI(예: A/B 컨트롤, 녹음 버튼)를 키워 강조할 때 강력하다. 슬라이드당 최대 3개.
스크린샷이 없는 슬라이드(`hero` 등)에서는 무시된다.

```jsonc
{
  "layout": "text-top",
  "deviceFrame": { "show": false },
  "highlights": [
    {
      "sourceRegion": { "x": 0.1, "y": 0.62, "w": 0.5, "h": 0.12 }, // 확대할 영역(스크린샷 비율 0–1)
      "popup": {
        "x": 0.62,        // 카드 중심 X(캔버스 비율 0–1). 생략하면 sourceRegion 중심
        "y": 0.34,        // 카드 중심 Y(캔버스 비율 0–1)
        "width": 0.78,     // 카드 너비(캔버스 너비 비율, 0.1–1.5). 높이는 영역 종횡비로 자동
        "rotation": -6      // 카드 기울기(도, 옵션)
      }
    }
  ]
}
```

- `sourceRegion`은 스크린샷 가시 영역 기준 정규화(0–1). `popup.x/y`를 주면 확대
  카드 위치를 sourceRegion과 독립적으로 잡을 수 있다. 생략하면 legacy 동작처럼
  sourceRegion의 화면 위치에 중앙 정렬된다.
- 모든 필드는 옵션 — 빠지면 makeHighlight 기본값(중앙 밴드, width 0.78)으로 채워진다.
  범위 밖 값은 경계값 보정. `popup.width`는 영역보다 크게 잡아야 확대 효과가 난다.
- 기기 베젤이 보이든 플로팅이든 동작하며, `deviceFrame.rotation`이 있으면 루페도 함께 기운다.

> **핵심 규칙 — 슬롯이 먼저다.** 캡션 파일의 `text:N` 행은 매니페스트가 그 슬롯을 선언한 경우에만 채워진다. `textBlocks: 1`인 슬라이드에 `text:1`(서브헤드) 행을 보내면 조용히 건너뛴다(경고 카운트에만 잡힘). 서브헤드가 있는 슬라이드는 반드시 `textBlocks: 2`를 선언할 것.
>
> **배지도 슬롯이 먼저다.** `slides[].badges`가 만든 슬롯만 `badge:N` 행으로 채워진다.

복구 가능한 문제(미지원 locale/layout/model, 11장 초과, image 배경)는 기본값으로 대체되고 가져오기 결과 모달에 경고로 표시된다. 잘못된 JSON·버전·이름/슬라이드 누락만 전체 실패.

## 스크린샷 파일명 규칙

`{슬라이드번호}[-설명].{locale}.{확장자}` — **모든 파일에 언어 접미사 필수.**

- `sourceLocale`과 같은 언어 = 그 슬라이드의 **베이스** 스크린샷, 나머지 = 언어별 추가본(override)
- 슬라이드 번호는 1-based, 선행 숫자만 읽으므로 설명 접미사 허용: `01-home.ko.png`, `02-add-pdf.en.png`
- 같은 배치에서 베이스가 먼저 적용되므로 베이스+override를 함께 보내도 된다. **베이스 없는 슬라이드의 override는 건너뛴다**
- `hero` 레이아웃은 텍스트 전용 — 스크린샷을 보내면 경고 후 무시
- 화면비로 기기 타입을 자동 감지한다. 시뮬레이터 원본 해상도 그대로 내보내면 됨 (iPhone 세로 ≈9:19.5, iPad ≈3:4)

## 외부 이미지 파일명 규칙

외부 이미지는 locale suffix를 쓰지 않는다. manifest의
`slides[].externalImages[].file`과 선택 파일명이 정확히 일치해야 한다.
권장 파일명은 `{슬라이드번호}-external-{순번}.{확장자}`다.

예:
- manifest: `{ "file": "1-external-1.png", "x": 0.42, "y": 0.55, "width": 0.28, "shadow": true }`
- 선택 파일: `1-external-1.png`

`headless:export --export-manifest`는 `image-plan.json`에 screenshot 파일과
external image 파일명을 분리해서 기록한다.

## 캡션 파일 (localize 템플릿 형식)

`/screenshot-copy` 스킬이 생성하는 `screenshot-copy.csv` 형식 그대로:

```csv
slide,slideId,field,ko,en,ja
1,,text:0,산책을 기록하세요,Track every walk,散歩を記録
2,,text:0,건강 리포트,Health reports,健康レポート
2,,text:1,매일 자동 정리,Summarized daily,毎日自動でまとめ
```

- `slideId`는 **비워둘 것** — 새 프로젝트의 슬라이드 id는 가져오기 시점에 생성되므로 1-based `slide` 번호로 매칭된다
- `field`: `text:0`(헤드라인), `text:1`(서브), `badge:0`(첫 번째 배지)
- 언어 열은 자유 구성. `sourceLocale` 열 = 슬라이드 기본 텍스트, 나머지 = 번역. 매니페스트의 `targetLocales`에 없는 언어 열이 와도 자동 추가된다
- 빈 셀은 건너뜀. JSON 형식도 동일 의미: `{"rows":[{"slide":1,"field":"text:0","texts":{"ko":"…","en":"…"}}]}`

## 완전한 예시 폴더

```
launch-screenshots/
├── manifest.json          # 위 스키마, slides 4장
├── screenshot-copy.csv    # 슬라이드×언어 캡션
├── 01-walk.ko.png         # 슬라이드 1 베이스 (ko = sourceLocale)
├── 01-walk.en.png         # 슬라이드 1 en 추가본
├── 02-report.ko.png
└── 04-share.ko.png        # 슬라이드 3은 hero라 스크린샷 없음
```

사람의 손: 스튜디오 1단계에서 "프로젝트 가져오기 → 파일 선택"으로 위 파일 전부 선택 → 요약 모달 확인 → "에디터에서 검수".

## 헤들리스 렌더 (사람 손 없이 PNG까지)

위 폴더를 사람 손 없이 곧장 최종 PNG로 바꾸는 하니스:

```bash
npm run headless:export -- <input-dir> <out-dir>             # {locale}/{device}/NN.png
npm run headless:export -- <input-dir> <out-dir> --fastlane  # deliver 레이아웃 + Appfile/Deliverfile/upload.sh
npm run headless:export -- <input-dir> <out-dir> --report    # PNG + layout-report.json + layout-summary.json
npm run headless:export -- <input-dir> <out-dir> --fail-on-layout-issues
npm run headless:export -- <input-dir> <out-dir> --bundle    # 렌더 대신 편집 가능한 <name>.studio.zip 저장
```

- `<input-dir>` = 위 예시 폴더 그대로 (manifest + 캡션 CSV/JSON + 스크린샷, 플랫).
- dev 서버가 없으면 직접 띄우고 끝나면 정리한다 (떠 있으면 재사용). 다른 포트는 `BASE_URL` env로.
- 임포트 요약·경고, 슬라이드별 렌더 실패가 stdout/stderr로 나온다. 실패가 있으면 exit 1 (부분 성공 시 PNG는 그대로 남음).
- `--report`를 주면 각 slide/locale 렌더 직후 같은 Fabric canvas에서 layout geometry를
  수집해 `<out-dir>/layout-report.json`과 `<out-dir>/layout-summary.json`에 저장하고,
  CLI에 issue 요약을 함께 출력한다.
- `--fail-on-layout-issues`는 `--report`를 자동으로 켜며, 렌더가 성공해도 layout issue가
  1개 이상이면 exit 1로 끝난다. CI/에이전트 루프에서 "레이아웃 경고 없음"을 게이트로
  걸 때 사용한다.
- `--bundle`은 렌더를 건너뛰고 편집 가능한 프로젝트 번들(`<out-dir>/<name>.studio.zip`)을
  저장한다. PNG가 아니라 에디터에서 "프로젝트 파일 열기"로 다시 열어 손볼 산출물이
  필요할 때 쓴다. import 포맷과 달리 GUI 편집(하이라이트·배지·장식·로케일별 스크린샷)이
  무손실로 왕복된다.
- 에이전트 루프: manifest/캡션 수정 → 재실행 → `<out-dir>` PNG와
  `layout-summary.json` 확인 → 수렴할 때까지 반복.

### Layout 자동 수정 루프

`layout-summary.json`의 `suggestedFix.edits[]`는 바로 manifest에 반영할 수 있다.
기본은 dry-run이라 파일을 쓰지 않고, 어떤 JSON Pointer를 어떤 값으로 바꿀지만 출력한다.

한 명령으로 렌더 → 수정 제안/적용 → 재렌더를 반복하려면:

```bash
npm run layout:loop -- <input-dir> <out-dir>
npm run layout:loop -- <input-dir> <out-dir> --write --max-runs 3
```

- `--write`가 없으면 한 번 렌더하고 `layout:fix`와 같은 dry-run 적용 요약을 출력한 뒤
  멈춘다. manifest는 바꾸지 않는다.
- `--write`가 있으면 issue가 0이 되거나 `--max-runs`에 닿을 때까지 manifest를 쓰고
  다시 렌더한다. `--max-runs`는 최대 렌더 횟수이므로 기본값 3은 "초기 렌더 + 수정 후
  최대 2회 재검증"이다.
- manifest 파일명이 `manifest.json`이 아니어도 input 폴더에서 manifest 모양
  (`version` + `slides`)의 JSON을 찾는다. 후보가 여러 개면 이름 정렬상 첫 번째를 쓴다
  (`headless:export`가 같은 정렬 순서로 파일을 넘기고, 앱 import도 첫 manifest를 고르므로
  loop가 고치는 manifest와 앱이 렌더하는 manifest가 일치한다). 다른 걸 쓰려면
  `--manifest <path>`.
- loop는 내부에서 `headless:export --report`를 사용하고, `layout-summary.json`의 issue
  count를 직접 판정한다. issue가 남았는데 `--write`가 없거나 최대 렌더 횟수에 닿으면
  exit 1이다.

개별 단계로 직접 실행하려면:

```bash
npm run layout:fix -- <out-dir>/layout-summary.json <input-dir>/manifest.json
npm run layout:fix -- <out-dir>/layout-summary.json <input-dir>/manifest.json --write
```

권장 루프:

```bash
npm run headless:export -- <input-dir> <out-dir> --report
npm run layout:fix -- <out-dir>/layout-summary.json <input-dir>/manifest.json
npm run layout:fix -- <out-dir>/layout-summary.json <input-dir>/manifest.json --write
npm run headless:export -- <input-dir> <out-dir> --report --fail-on-layout-issues
```

- 첫 번째 `layout:fix`는 사람이 확인하는 적용 요약이다. 예: `old -> new`, issue code,
  slide/locale, `manifest.json#/slides/...` 경로를 출력한다.
- `--write`를 줄 때만 `<input-dir>/manifest.json`을 2-space JSON으로 다시 쓴다.
- 같은 run에서 같은 `code + manifestPath`가 여러 locale에 반복되면 한 번만 적용한다. 같은
  레이아웃 문제가 언어별로 중복 보고되어도 한 번의 보수적 수정만 들어가게 하기 위해서다.
- 없는 `texts[]`/`deviceFrame`/`screenshotStyle` object는 필요한 최소 override로 만든다.
  기존 `badges[]`/`highlights[]` 항목이 없거나 경로가 manifest 밖이면 건너뛰고 warning을 낸다.

자동 수정 전략은 한 번에 크게 움직이지 않는다. 수렴할 때까지 export → fix → export를
반복하는 전제를 둔다.

| issue code | 자동 수정 |
|---|---|
| `text-overlap` | text를 `metrics.targetX/targetY`(report가 충돌 geometry로 계산한 목표 위치)로 옮기고 `fitToBox`를 켠다. 옮길 공간이 없어 `metrics.shrink`가 붙은 경우에만 `fontSize`/`fontScale`도 10% 줄인다. (geometry가 없는 옛 summary는 폰트만 줄이던 과거 동작으로 폴백) |
| `safe-margin-overflow` | text는 `metrics.targetX/targetY`(실제 렌더 위치를 안전 영역 안으로 당긴 값)로 옮긴다 — pos가 없는 템플릿 정렬 텍스트도 좌표를 날조하지 않는다. 안전 영역보다 넓어 `metrics.narrowBox`가 붙으면 `boxWidth`도 줄인다. badge/popup은 `metrics.sides` 방향으로 소폭 이동(popup은 `width`도 10% 축소) |
| `badge-seam-overlap` | badge `left`를 seam 반대쪽이 아니라 같은 페이지 안쪽으로 이동한다 |
| `highlight-popup-overflow` | popup `x/y`를 화면 안쪽으로 이동하고 `width`를 10% 줄인다 |
| `highlight-popup-source-overlap` | popup을 `sourceRegion` 중심에서 멀어지는 방향으로 이동하고 `width`를 10% 줄인다 |

### Layout report (`--report`)

`--report`는 PNG를 만드는 실제 export 렌더 경로를 그대로 사용한다. 렌더가 끝난 직후
canvas 객체의 bounding box를 읽기 때문에, report 좌표는 사람이 보는 최종 PNG와 같은
레이아웃을 기준으로 한다. 2-page span은 2배 폭 canvas에서 한 번 렌더한 뒤 leader/follower
각 페이지 기준으로 report를 나눈다.

저장 위치:

```text
<out-dir>/layout-report.json
<out-dir>/layout-summary.json
```

CLI 요약 예:

```text
:: layout report: 2 renders, 4 issues (text-overlap=2, safe-margin-overflow=2)
:: layout report saved → /path/to/output/layout-report.json
:: layout summary saved → /path/to/output/layout-summary.json
```

최상위 구조:

```jsonc
{
  "version": 1,
  "generatedAt": "2026-06-19T02:00:00.000Z",
  "project": {
    "id": "project-id",
    "name": "My App",
    "sourceLocale": "ko",
    "targetLocales": ["en", "ja"]
  },
  "summary": {
    "renderCount": 6,
    "issueCount": 2,
    "affectedRenderCount": 1,
    "byCode": { "text-overlap": 1, "safe-margin-overflow": 1 }
  },
  "renders": []
}
```

`renders[]`는 slide/locale 하나의 결과다. 주요 필드:

| 필드 | 의미 |
|---|---|
| `slideNo`, `slideId`, `locale` | 어떤 슬라이드/언어 렌더인지 |
| `template`, `device` | 사용한 레이아웃과 기기 타입 |
| `canvas` | 측정이 일어난 Fabric canvas 크기. span leader/follower는 2배 폭 canvas |
| `output` | 최종 PNG 한 장의 크기 |
| `page` | span canvas에서 이 PNG가 잘려 나온 영역. 단일 슬라이드는 `{x:0,y:0}` |
| `safeMargin`, `safeArea` | validator가 쓰는 안전 여백과 그 안쪽 영역 |
| `span` | span 렌더일 때 `groupId`, `role`, `seamX` |
| `boxes` | 레이어별 bounding box 묶음 |
| `issues` | validator 경고 목록. 각 issue는 `manifestPaths`와 `suggestedFix`를 포함 |

`boxes`는 다음 레이어를 분리해 기록한다.

```jsonc
{
  "boxes": {
    "text": [],
    "device": [],
    "screenshot": [],
    "highlightSource": [],
    "highlightPopup": [],
    "badge": []
  }
}
```

각 box는 세 좌표계를 가진다.

| 필드 | 의미 |
|---|---|
| `manifestPath` | 이 box를 수정할 때 우선 열어야 하는 manifest JSON Pointer. 예: `manifest.json#/slides/0/texts/0` |
| `canvasBox` | 원본 Fabric canvas 좌표. span seam 판단은 이 좌표를 사용 |
| `outputBox` | 최종 PNG 좌표로 변환한 전체 box. 화면 밖으로 나간 부분도 포함 |
| `visibleBox` | 최종 PNG 안에 실제로 보이는 부분 |

box 식별 필드는 레이어별로 붙는다: text는 `textIndex`/`owner`, badge는 `badgeId`,
highlight는 `highlightId`를 가진다. AI agent는 이 id와 slide/locale을 보고 manifest의
`texts[].pos`, `texts[].boxWidth`, `badges[].left/top`, `highlights[].popup.x/y/width`,
`deviceFrame.offsetX/offsetY/scale` 등을 조정한다.

issue는 다음 agent-facing 필드를 가진다.

| 필드 | 의미 |
|---|---|
| `manifestPaths` | issue에 직접 관련된 수정 대상 경로들. box의 `manifestPath`에서 중복 제거 |
| `suggestedFix.summary` | 사람이 읽는 수정 방향 |
| `suggestedFix.edits[]` | 수정 후보. 각 항목은 `manifestPath`, 후보 `fields`, 짧은 `hint`를 가진다 |
| `metrics` | 수치 컨텍스트. text 이슈는 `posX/posY`(현재 정규화 위치, pos 의미 = centerX/width·top/height)와 `targetX/targetY`(report가 실제 geometry로 계산한 이동 목표)를 담고, 필요 시 `shrink`(이동만으로 안 되니 폰트도 축소)·`narrowBox`(안전 영역보다 넓어 wrap 폭도 축소) 플래그가 붙는다 |

예:

```jsonc
{
  "code": "highlight-popup-overflow",
  "objects": ["highlight-popup:abc"],
  "manifestPaths": ["manifest.json#/slides/1/highlights/0/popup"],
  "suggestedFix": {
    "summary": "Move the highlight popup inside the output bounds or shrink popup.width.",
    "edits": [
      {
        "manifestPath": "manifest.json#/slides/1/highlights/0/popup",
        "fields": ["x", "y", "width"],
        "hint": "Move the highlight popup inside the page or shrink its width."
      }
    ]
  }
}
```

2-page span에서는 공유 레이어(device/screenshot/highlight/badge)가 follower PNG에 보여도
수정 경로는 leader slide를 가리킨다. follower의 텍스트는 follower slide의
`texts[]`를 가리킨다.

`layout-summary.json`은 agent가 먼저 읽기 좋은 평탄화 파일이다. 최상위 `summary`는
`layout-report.json`과 같고, `issues[]`는 `renders[].issues[]`를 slide/locale 메타데이터와
함께 한 배열로 펼친다. PNG 좌표와 전체 box가 필요할 때만 `layout-report.json`을 읽으면 된다.

감지하는 issue code:

| code | 의미 | 일반적인 수정 방향 |
|---|---|---|
| `text-overlap` | text가 device/screenshot/highlight-popup/badge와 과도하게 겹침 | text 위치/폭/fontSize 조정, device 또는 popup 이동 |
| `badge-seam-overlap` | badge가 2-page span seam을 가로지름 | badge `left`를 한쪽 페이지 안으로 이동 |
| `safe-margin-overflow` | text/highlight-popup/badge가 안전 여백 밖으로 나감 | 해당 요소를 안쪽으로 이동하거나 크기 축소 |
| `highlight-popup-source-overlap` | highlight popup이 자기 source 영역을 너무 덮음 | popup `x/y` 이동 또는 `width` 축소 |
| `highlight-popup-overflow` | highlight popup이 최종 PNG 밖으로 나감 | popup `x/y` 이동 또는 `width` 축소 |

기본 `--report`는 경고용이다. issue가 있어도 PNG export 자체는 계속 진행하고, 렌더 실패가
아닌 레이아웃 문제는 exit code를 실패로 만들지 않는다. 실패가 필요하면
`--fail-on-layout-issues`를 사용한다.

## 구현 참조

- 매니페스트 파싱/빌드: `src/lib/projectImport.ts` (`parseManifest` → `buildProjectFromManifest`)
- 파이프라인: `src/lib/projectImportRun.ts` (`runProjectImport` — 라우팅 → 스켈레톤 → 이미지 → 캡션, 미커밋 Project 반환)
- 스크린샷 규칙: `src/lib/imageImport.ts` / `src/lib/bulkImageImport.ts`
- 캡션 형식: `src/lib/localeIO.ts` / `src/lib/localePatch.ts` (`applyCaptionRows`)
- layout report/validator: `src/lib/layoutReport.ts`
