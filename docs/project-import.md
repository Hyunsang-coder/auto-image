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
    { "layout": "split", "background": { "type": "solid", "color": "#101015" } }
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
| `sourceLocale` | string | `ko` | 지원: `en ko ja de fr es it pt-BR es-MX` |
| `targetLocales` | string[] | `[]` | 같은 지원 목록. 미지원 코드는 경고 후 제외 |
| `themeBackground` | string \| object | 레퍼런스 그라디언트 | 문자열 = 테마 프리셋 id. 객체 = `{"type":"solid","color":"#…"}` 또는 `{"type":"gradient","gradient":{"direction":145,"stops":[{"color":"#…","position":0},…]}}`. `image` 불가 |
| `slides[].layout` | string | `text-top` | `hero` \| `hero-bleed` \| `text-top` \| `text-bottom` \| `split` |
| `slides[].textBlocks` | 1–4 | `1` | **캡션 슬롯 수.** 텍스트 블록 0 = 헤드라인 |
| `slides[].background` | string \| object | 테마 배경 | 슬라이드별 오버라이드 |
| `slides[].deviceFrame` | boolean \| object | `true` | `false` = 기기 베젤 숨김(스크린샷만 플로팅). 객체형은 아래 [기기 transform](#기기-transform--플로팅-카드--장식-디자인-노브) |
| `slides[].screenshotStyle` | object | — | 플로팅 카드 룩(베젤 숨김일 때 적용) — 아래 참조 |
| `slides[].ornaments` | array | — | 이모지 장식, 슬라이드당 최대 5개 — 아래 참조 |
| `slides[].texts` | array | — | **블록별 텍스트 스타일/위치 오버라이드**(폰트·색·정렬·박스 등) — 아래 참조 |

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
    "show": true,            // 기본 true
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
  ]
}
```

- `screenshotStyle`은 항상 파싱·저장되지만 **렌더는 베젤 숨김일 때만 반영**된다
  (베젤이 보이면 기기 형태가 모양을 정의). 미리 넣어둬도 무해.
- ornament `shape` 18종: `star sparkles heart flower leaf paw fire party rocket
  bulb bolt check thumbsup trophy gem target bell hundred`. 이모지로 렌더되므로
  `color`는 받아두지만 적용되지 않는다. `x`/`y`/`size`는 캔버스 비율(0–1).
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
- `box`/`outline`/`shadow`는 `fill`/`color`(문자열)만 필수, 나머지 수치는 기본값으로
  채워진다(`{ "box": { "fill": "#000" } }`만으로도 동작). 범위 밖 값은 경계값 보정.
- `texts[0].pos`는 헤드라인의 `textY`/`textX` 단축 표기를 덮어쓴다(둘 다 있으면 `pos`가 이김).

> **핵심 규칙 — 슬롯이 먼저다.** 캡션 파일의 `text:N` 행은 매니페스트가 그 슬롯을 선언한 경우에만 채워진다. `textBlocks: 1`인 슬라이드에 `text:1`(서브헤드) 행을 보내면 조용히 건너뛴다(경고 카운트에만 잡힘). 서브헤드가 있는 슬라이드는 반드시 `textBlocks: 2`를 선언할 것.
>
> **배지는 import 대상이 아니다.** 가져온 슬라이드는 텍스트 + 이미지로만 구성된다(심플 기본형). 캡션 파일의 `badge:N` 행은 건너뛰며, 배지가 필요하면 에디터에서 추가한다.

복구 가능한 문제(미지원 locale/layout/model, 11장 초과, image 배경)는 기본값으로 대체되고 가져오기 결과 모달에 경고로 표시된다. 잘못된 JSON·버전·이름/슬라이드 누락만 전체 실패.

## 스크린샷 파일명 규칙

`{슬라이드번호}[-설명].{locale}.{확장자}` — **모든 파일에 언어 접미사 필수.**

- `sourceLocale`과 같은 언어 = 그 슬라이드의 **베이스** 스크린샷, 나머지 = 언어별 추가본(override)
- 슬라이드 번호는 1-based, 선행 숫자만 읽으므로 설명 접미사 허용: `01-home.ko.png`, `02-add-pdf.en.png`
- 같은 배치에서 베이스가 먼저 적용되므로 베이스+override를 함께 보내도 된다. **베이스 없는 슬라이드의 override는 건너뛴다**
- `hero` 레이아웃은 텍스트 전용 — 스크린샷을 보내면 경고 후 무시
- 화면비로 기기 타입을 자동 감지한다. 시뮬레이터 원본 해상도 그대로 내보내면 됨 (iPhone 세로 ≈9:19.5, iPad ≈3:4)

## 캡션 파일 (localize 템플릿 형식)

`/screenshot-copy` 스킬이 생성하는 `screenshot-copy.csv` 형식 그대로:

```csv
slide,slideId,field,ko,en,ja
1,,text:0,산책을 기록하세요,Track every walk,散歩を記録
2,,text:0,건강 리포트,Health reports,健康レポート
2,,text:1,매일 자동 정리,Summarized daily,毎日自動でまとめ
```

- `slideId`는 **비워둘 것** — 새 프로젝트의 슬라이드 id는 가져오기 시점에 생성되므로 1-based `slide` 번호로 매칭된다
- `field`: `text:0`(헤드라인), `text:1`(서브). `badge:N` 행은 건너뜀(배지는 에디터 전용)
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

위 폴더를 브라우저 없이 곧장 최종 PNG로 바꾸는 하니스:

```bash
node scripts/headless-export.mjs <input-dir> <out-dir>             # {locale}/{device}/NN.png
node scripts/headless-export.mjs <input-dir> <out-dir> --fastlane  # deliver 레이아웃 + Appfile/Deliverfile/upload.sh
```

- `<input-dir>` = 위 예시 폴더 그대로 (manifest + 캡션 CSV/JSON + 스크린샷, 플랫).
- dev 서버가 없으면 직접 띄우고 끝나면 정리한다 (떠 있으면 재사용). 다른 포트는 `BASE_URL` env로.
- 임포트 요약·경고, 슬라이드별 렌더 실패가 stdout/stderr로 나온다. 실패가 있으면 exit 1 (부분 성공 시 PNG는 그대로 남음).
- 에이전트 루프: manifest/캡션 수정 → 재실행 → `<out-dir>` PNG를 눈으로 확인 → 수렴할 때까지 반복.

## 구현 참조

- 매니페스트 파싱/빌드: `src/lib/projectImport.ts` (`parseManifest` → `buildProjectFromManifest`)
- 파이프라인: `src/lib/projectImportRun.ts` (`runProjectImport` — 라우팅 → 스켈레톤 → 이미지 → 캡션, 미커밋 Project 반환)
- 스크린샷 규칙: `src/lib/imageImport.ts` / `src/lib/bulkImageImport.ts`
- 캡션 형식: `src/lib/localeIO.ts` / `src/lib/localePatch.ts` (`applyCaptionRows`)
