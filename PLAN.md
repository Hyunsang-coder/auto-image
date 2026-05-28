# App Store 스크린샷 생성 도구 상세 계획서

> 버전 1.0 | 2026-05-28  
> 클라이언트사이드 전용 웹앱 — 서버 없음, 설치 없음

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [UX 전체 플로우](#3-ux-전체-플로우)
4. [데이터 모델](#4-데이터-모델)
5. [컴포넌트 아키텍처](#5-컴포넌트-아키텍처)
6. [Phase별 구현 계획](#6-phase별-구현-계획)
7. [Fabric.js 캔버스 설계](#7-fabricjs-캔버스-설계)
8. [번역 API 연동](#8-번역-api-연동)
9. [Export 파이프라인](#9-export-파이프라인)
10. [상태 관리 (Zustand)](#10-상태-관리-zustand)
11. [리스크 및 대응 전략](#11-리스크-및-대응-전략)
12. [파일 구조](#12-파일-구조)
13. [품질 기준](#13-품질-기준)

---

## 1. 프로젝트 개요

### 목적

App Store 제출용 스크린샷을 브라우저에서 직접 만들 수 있는 **노코드 비주얼 에디터**다. 디자이너 없이 개발자나 인디 개발자가 10분 안에 다국어 스크린샷 세트를 만들어 바로 제출할 수 있는 것이 목표다.

### 핵심 제약

- **완전 클라이언트사이드**: API 키는 브라우저 localStorage에만 저장, 서버로 전송 없음
- **Apple 규격 엄수**: iPhone 1320×2868, iPad 2064×2752, PNG, 최대 10MB
- **오프라인 사용 가능**: 번역 기능 제외 시 인터넷 연결 불필요
- **설치 없음**: `yarn dev` 또는 정적 파일 배포로 즉시 사용

### 성공 기준

- 단일 프로젝트(앱 1개) 기준, 1가지 언어, 5장 스크린샷을 **5분 이내** 완성
- Export ZIP 파일 구조가 ASC(App Store Connect) 업로드 폴더 구조와 일치
- Undo/Redo가 캔버스 조작 전 단계에서 100% 복원

---

## 2. 기술 스택

| 레이어 | 라이브러리 | 버전 | 선택 이유 |
|--------|-----------|------|----------|
| UI 프레임워크 | React | 18 | 훅 기반 상태 관리, 생태계 |
| 번들러 | Vite | 5 | 빠른 HMR, 정적 빌드 |
| 타입 | TypeScript | 5 | 데이터 모델 안전성 |
| 캔버스 | Fabric.js | 6 | Undo/Redo 내장, 객체 기반 편집 |
| 스타일 | Tailwind CSS | 4 | 유틸리티 CSS, 번들 크기 최소 |
| 전역 상태 | Zustand | 4 | 보일러플레이트 최소, persist 미들웨어 |
| 압축/다운로드 | JSZip + FileSaver.js | - | 브라우저 ZIP 생성 |
| 번역 | Claude API / OpenAI / Gemini | - | 브라우저 직접 호출 지원 |

---

## 3. UX 전체 플로우

### 3.1 상위 플로우

```
┌─────────────────────────────────────────────────────────┐
│  Step 1: 프로젝트 설정                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ 기기 선택    │  │ 슬라이드 수   │  │  테마 컬러     │  │
│  │ □ iPhone    │  │    [5] ▲▼   │  │  ████ #6366F1  │  │
│  │ □ iPad      │  │  (1~10장)   │  │  (Color Picker)│  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                        [다음 →]          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Step 2: 슬라이드 에디터                                  │
│  ┌──────────┐  ┌─────────────────────┐  ┌───────────┐  │
│  │ 슬라이드  │  │                     │  │ 속성 패널 │  │
│  │ 목록     │  │   Fabric.js 캔버스   │  │           │  │
│  │ [1] ←선택│  │   (드래그 편집)      │  │ 템플릿    │  │
│  │ [2]     │  │                     │  │ 배경      │  │
│  │ [3]     │  │                     │  │ 디바이스  │  │
│  │ [4]     │  │                     │  │ 텍스트    │  │
│  │ [5]     │  │                     │  │ 배지      │  │
│  │ [+]     │  │                     │  │ 하이라이트│  │
│  └──────────┘  └─────────────────────┘  └───────────┘  │
│  Cmd+Z / Cmd+Shift+Z (Undo/Redo)                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Step 3: 로컬라이즈                                       │
│  언어: [한국어] [English] [日本語] [+추가]                │
│  API:  [Claude ●] [OpenAI] [Gemini]  [API 키 입력]       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  슬라이드  │  ko (원본)      │  en          │  ja  │  │
│  │  Slide 1   │  앱을 더 빠르게 │  Get faster  │  ... │  │
│  │  Slide 2   │  모든 기기에서  │  On all dev. │  ... │  │
│  └──────────────────────────────────────────────────┘   │
│  [전체 번역]  수동 편집 가능                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Step 4: Export                                          │
│  ko/iphone/01.png ~ 05.png                              │
│  en/iphone/01.png ~ 05.png                              │
│  ja/iphone/01.png ~ 05.png                              │
│  렌더링: [██████░░░░] 6/15                               │
│  [⬇ ZIP 다운로드]                                        │
└─────────────────────────────────────────────────────────┘
```

### 3.2 4가지 레이아웃 템플릿

```
[Hero]               [Text Top]           [Text Bottom]        [Split]
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │  Headline    │     │              │     │ Headline  📱 │
│  Headline    │     │  Subtext     │     │  [디바이스]   │     │ Subtext   📱 │
│  Subtext     │     │              │     │              │     │           📱 │
│  [배지]      │     │  [디바이스]   │     │  Headline    │     │              │
│              │     │              │     │  Subtext     │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
디바이스 없음          디바이스 하단          디바이스 상단          좌텍스트/우디바이스
(히어로 슬라이드)
```

**레퍼런스 근거**:
- Hero: Claude 앱 1번 슬라이드 (사람 사진 + 큰 텍스트, 디바이스 없음)
- Text Top: Dogo, ADHD 앱 대부분의 슬라이드
- Text Bottom: ADHD 앱 일부
- Split: 텍스트와 디바이스를 나란히 배치

---

## 4. 데이터 모델

```typescript
// src/types/project.ts

export type DeviceType = 'iphone' | 'ipad';
export type TemplateType = 'hero' | 'text-top' | 'text-bottom' | 'split';
export type DeviceModel = 'iphone-16-pro' | 'ipad-pro-13';
export type DeviceColor = 'black' | 'silver';
export type HighlightShape = 'rect' | 'circle';
export type BackgroundType = 'solid' | 'gradient' | 'image';
export type TranslationAPI = 'claude' | 'openai' | 'gemini';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  devices: DeviceType[];
  screenshotCount: number;    // 1~10
  themeColor: string;         // 프로젝트 공통 hex (#RRGGBB)
  sourceLocale: string;       // 'ko'
  targetLocales: string[];    // ['en', 'ja', ...]
  translationApi: TranslationAPI;
  slides: Slide[];
}

export interface Slide {
  id: string;
  index: number;
  template: TemplateType;
  background: Background;
  deviceFrame: DeviceFrame;
  screenshot: ScreenshotImage | null;
  headline: Caption;
  subheadline: Caption;
  badge: Badge | null;
  highlights: Highlight[];
}

export interface Background {
  type: BackgroundType;
  color?: string;
  gradient?: {
    direction: number;  // 각도 0~360
    stops: Array<{ color: string; position: number }>;
  };
  imageDataUrl?: string;
  imageObjectFit?: 'cover' | 'contain' | 'fill';
}

export interface DeviceFrame {
  show: boolean;              // 프레임 표시 여부 (선택사항)
  model: DeviceModel;
  color: DeviceColor;
}

export interface ScreenshotImage {
  id: string;
  dataUrl: string;            // base64 PNG (IndexedDB에 별도 저장)
  originalWidth: number;
  originalHeight: number;
}

export interface Caption {
  text: string;
  translations: Record<string, string>;
  style: TextStyle;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;         // 400 | 600 | 700 | 800
  color: string;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
}

export interface Badge {
  id: string;
  text: string;
  translations: Record<string, string>;
  style: BadgeStyle;
}

export interface BadgeStyle {
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
  fontSize: number;
  fontWeight: number;
  icon?: string;              // emoji 또는 SVG string
  iconPosition?: 'left' | 'right';
}

export interface Highlight {
  id: string;
  sourceRegion: {             // 스크린샷 내 상대 좌표 (0~1 비율)
    x: number;
    y: number;
    w: number;
    h: number;
  };
  shape: HighlightShape;
  borderColor: string;
  borderWidth: number;
  popup: {
    x: number;               // 슬라이드 내 절대 px
    y: number;
    width: number;
    zoom: number;            // 1.5~4 배율
    showConnectorLine: boolean;
    connectorStyle?: 'straight' | 'curved';
    borderRadius?: number;
    shadowColor?: string;
  };
}

// 번역 API 키 (프로젝트 데이터와 별도 localStorage)
export interface ApiConfig {
  claude?: { apiKey: string };
  openai?: { apiKey: string };
  gemini?: { apiKey: string };
}
```

---

## 5. 컴포넌트 아키텍처

```
<App>
├── <StepIndicator>

├── [step=1] <ProjectSetup>
│   ├── <DeviceSelector>
│   ├── <SlideCountPicker>
│   └── <ThemeColorPicker>

├── [step=2] <EditorLayout>
│   ├── <SlideList>
│   │   └── <SlideThumbnail>
│   ├── <CanvasArea>
│   │   ├── <CanvasToolbar>        (Undo, Redo, Zoom)
│   │   └── <FabricCanvas>
│   │       레이어 순서 (bottom→top):
│   │       1. BackgroundLayer
│   │       2. ScreenshotLayer
│   │       3. DeviceFrameLayer
│   │       4. HighlightBorderLayer
│   │       5. HighlightPopupLayer + ConnectorLine
│   │       6. HeadlineLayer + SubheadlineLayer
│   │       7. BadgeLayer
│   └── <PropertiesPanel>
│       ├── <TemplateSelector>
│       ├── <BackgroundPanel>
│       ├── <DevicePanel>          (showFrame 토글)
│       ├── <ScreenshotDropzone>
│       ├── <CaptionPanel>
│       ├── <BadgePanel>
│       └── <HighlightPanel>

├── [step=3] <LocalizeEditor>
│   ├── <LocaleSelector>
│   ├── <ApiKeyInput>              (Claude/OpenAI/Gemini 탭)
│   ├── <TranslationTable>
│   └── <TranslationActions>

└── [step=4] <ExportPanel>
    ├── <FileTreePreview>
    ├── <ExportProgressBar>
    └── <ExportButton>
```

---

## 6. Phase별 구현 계획

### Phase 1: 프로젝트 셋업 + 데이터 모델 (1~2일)

- [ ] Vite + React + TypeScript + Tailwind 초기화
- [ ] `src/types/project.ts` 전체 인터페이스 작성
- [ ] `src/constants/deviceSpecs.ts` Apple 규격 상수화
- [ ] Zustand 스토어 스켈레톤 + localStorage persist 연결
- [ ] `<ProjectSetup>` UI + Step 네비게이션

**완료 기준**: Step 1 폼 → Zustand 저장 → 새로고침 후 복원

---

### Phase 2: Fabric.js 에디터 핵심 (3~4일)

- [ ] `<FabricCanvas>` — `useEffect`로 `fabric.Canvas` 초기화
- [ ] `useCanvasSync` — Fabric ↔ Zustand 양방향 동기화
- [ ] `applyTemplate()` — 4종 템플릿 레이아웃 적용
- [ ] BackgroundLayer: 단색/그라데이션/이미지
- [ ] DeviceFrameLayer: SVG 프레임 + 클리핑 마스크
- [ ] ScreenshotLayer: 드래그앤드롭 + 프레임 내부 맞춤
- [ ] CaptionLayer: `fabric.Textbox` 더블클릭 인라인 편집
- [ ] Undo/Redo: Cmd+Z 바인딩
- [ ] `<PropertiesPanel>` 연결

**완료 기준**: 4종 템플릿 전환, 텍스트 편집, Undo/Redo 작동

```typescript
// src/canvas/templateLayouts.ts
export function applyTemplate(
  canvas: fabric.Canvas,
  template: TemplateType,
  canvasWidth: number,
  canvasHeight: number
): void;
```

---

### Phase 3: 배지 + 하이라이트 확대 팝업 (1~2일)

**배지**:
- [ ] `createBadgeObject(badge: Badge): fabric.Group`
- [ ] `<BadgePanel>` — 텍스트, 색상, 반경, 아이콘

**하이라이트**:
- [ ] 하이라이트 모드: 캔버스 위 마우스드래그 → `sourceRegion` 기록
- [ ] `createHighlightBorder()` — rect 또는 circle
- [ ] `createHighlightPopup()` — 확대 팝업 (fabric.Image clipPath)
- [ ] `createConnectorLine()` — 원본↔팝업 연결선 (선택)
- [ ] `<HighlightPanel>` — zoom 슬라이더 (1.5~4)

```
원본 영역 선택 (sourceRegion) → zoom 배율 적용
  → 팝업에 해당 영역 확대 표시 (fabric clipPath)
  → 연결선으로 원본 위치 표시 (선택)
```

**완료 기준**: 하이라이트 추가 → 팝업 확대 → 연결선 표시/숨김

---

### Phase 4: 로컬라이즈 (1일)

- [ ] `src/services/translation.ts` — 3가지 API 통합
- [ ] `translateTexts(request, api, apiKey)` 함수
- [ ] Claude: `anthropic-dangerous-direct-browser-access: true` 헤더
- [ ] OpenAI: `gpt-4o-mini`, Gemini: `gemini-2.0-flash`
- [ ] 공통 시스템 프롬프트 (App Store 카피 컨텍스트)
- [ ] `<TranslationTable>` — 슬라이드×언어 그리드, 셀 수동 편집
- [ ] API 키 localStorage 저장 (`useApiKeyStore`, 프로젝트 데이터와 분리)

**번역 프롬프트 핵심**:
```
Translate App Store screenshot captions from {src} to {target}.
Keep them concise and punchy — marketing copy, not documentation.
Return ONLY a valid JSON array. No markdown, no explanation.
```

**완료 기준**: Claude API로 5장×3언어 일괄 번역 성공

---

### Phase 5: 고해상도 Export + ZIP (1~2일)

- [ ] `renderSlide(slide, device, locale): Promise<Blob>`
  - offscreen Canvas 생성 (실제 해상도)
  - `document.fonts.ready` 대기 후 렌더링
  - `canvas.dispose()` 즉시 호출 (메모리 해제)
- [ ] `exportProject(options)` — 순차 렌더링 + JSZip 패키징
- [ ] ZIP 폴더 구조: `{locale}/{device}/{index}.png`
- [ ] `<ExportProgressBar>` — 실시간 진행률
- [ ] 파일 크기 사전 검증 (10MB 초과 시 경고)

**완료 기준**: iPhone 5장×3언어 = 15개 PNG ZIP 생성, 각 파일 10MB 미만

---

### Phase 6: 마감 (1일)

- [ ] Undo/Redo 전수 테스트
- [ ] localStorage 자동저장 복원 검증
- [ ] 반응형 UI (최소 1280px)
- [ ] `<ErrorBoundary>` — Fabric 크래시 격리
- [ ] 빈 상태 UX (스크린샷 없음 안내)
- [ ] `vite build` 정적 빌드 검증

---

## 7. Fabric.js 캔버스 설계

### Zustand ↔ Fabric 동기화 원칙

**단방향 흐름** — 두 시스템 충돌 방지의 핵심:

```
사용자 편집
    │
    ▼
Fabric.js 내부 상태 (즉시 렌더링)
    │ object:modified 이벤트 (디바운스 300ms)
    ▼
syncToZustand(): Fabric → Zustand 업데이트
    │
    ▼
localStorage 자동 저장

역방향 (Zustand → Fabric): 슬라이드 전환/로드 시에만
```

Undo/Redo 후에도 동기화 보장:
```typescript
canvas.on('history:undo', () => syncToZustand(canvas, slideId));
canvas.on('history:redo', () => syncToZustand(canvas, slideId));
```

### 레이어 식별자

```typescript
export const LAYER_NAMES = {
  BACKGROUND: 'background',
  SCREENSHOT: 'screenshot',
  DEVICE_FRAME: 'device-frame',
  HIGHLIGHT_BORDER: (id: string) => `highlight-border-${id}`,
  HIGHLIGHT_POPUP: (id: string) => `highlight-popup-${id}`,
  CONNECTOR: (id: string) => `connector-${id}`,
  HEADLINE: 'headline',
  SUBHEADLINE: 'subheadline',
  BADGE: (id: string) => `badge-${id}`,
} as const;
```

---

## 8. 번역 API 연동

| | Claude (sonnet-4-6) | OpenAI (gpt-4o-mini) | Gemini (2.0-flash) |
|--|---|---|---|
| 브라우저 직접 호출 | 가능 (특수 헤더 필요) | 가능 | 가능 |
| App Store 카피 품질 | 최상 | 상 | 상 |

```typescript
export async function translateTexts(
  request: { texts: string[]; sourceLocale: string; targetLocale: string },
  api: TranslationAPI,
  apiKey: string
): Promise<string[]>;
```

---

## 9. Export 파이프라인

```
exportProject()
  │
  ├── for each locale × device × slide (순차):
  │     renderSlide()
  │       1. offscreen Canvas 생성 (1320×2868 or 2064×2752)
  │       2. document.fonts.ready 대기
  │       3. locale 텍스트 적용 후 렌더링
  │       4. toBlob('image/png')
  │       5. canvas.dispose() ← 메모리 해제
  │
  └── JSZip 패키징 → saveAs()

출력 구조:
{project}-screenshots.zip
├── ko/iphone/01.png ~ 05.png
├── en/iphone/01.png ~ 05.png
└── ja/iphone/01.png ~ 05.png
```

---

## 10. 상태 관리 (Zustand)

두 스토어로 분리:

```typescript
// useProjectStore: 프로젝트/슬라이드 데이터
// - localStorage persist (이미지 dataUrl 제외)
// - 이미지는 IndexedDB에 별도 저장 → localStorage 용량 초과 방지

// useApiKeyStore: API 키만 별도 저장
// - 프로젝트 JSON 공유 시 키 노출 방지
```

---

## 11. 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| Fabric Undo ↔ Zustand 불일치 | `history:undo/redo` 이벤트에서 `syncToZustand()` 재호출 |
| 고해상도 메모리 부족 | 슬라이드 순차 렌더링 + 즉시 `dispose()` |
| LLM API CORS | Claude(특수 헤더), OpenAI/Gemini 모두 브라우저 허용 확인됨 |
| 폰트 렌더링 불일치 | `document.fonts.ready` + 특정 폰트 명시적 로드 대기 |
| Apple 규격 변경 | `deviceSpecs.ts` 단일 파일 상수화 |
| localStorage 용량 초과 | 이미지 dataUrl → IndexedDB 분리 저장 |

---

## 12. 파일 구조

```
src/
├── types/project.ts
├── constants/
│   ├── deviceSpecs.ts
│   └── defaults.ts
├── store/
│   ├── useProjectStore.ts
│   └── useApiKeyStore.ts
├── canvas/
│   ├── useFabricCanvas.ts
│   ├── useCanvasSync.ts
│   ├── initializeSlide.ts
│   ├── templateLayouts.ts
│   ├── layerNames.ts
│   ├── history.ts
│   └── objects/
│       ├── background.ts
│       ├── deviceFrame.ts
│       ├── screenshot.ts
│       ├── caption.ts
│       ├── badge.ts
│       └── highlight.ts
├── services/
│   ├── translation.ts
│   ├── translationClaude.ts
│   ├── translationOpenAI.ts
│   ├── translationGemini.ts
│   └── export.ts
├── components/
│   ├── setup/
│   ├── editor/
│   │   ├── FabricCanvas.tsx
│   │   ├── SlideList.tsx
│   │   ├── CanvasToolbar.tsx
│   │   └── properties/
│   ├── localize/
│   ├── export/
│   └── common/
├── App.tsx
└── main.tsx

public/
└── frames/
    ├── iphone-16-pro-black.svg
    ├── iphone-16-pro-silver.svg
    ├── ipad-pro-13-black.svg
    └── ipad-pro-13-silver.svg
```

---

## 13. 품질 기준

| Phase | 완료 조건 |
|-------|----------|
| 1 | Step 1 폼 → 저장 → 새로고침 복원 |
| 2 | 4종 템플릿 전환, 텍스트 편집, Undo/Redo 정상 |
| 3 | 하이라이트 추가 → 팝업 확대 → 연결선 표시/숨김 |
| 4 | Claude API 5장×3언어 일괄 번역 성공 |
| 5 | iPhone 5장×3언어 = 15개 PNG ZIP, 각 10MB 미만 |
| 6 | 새로고침 완전 복원, `vite build` 오류 없음 |

| 지표 | 목표 |
|------|------|
| 슬라이드 전환 | < 100ms |
| 단일 슬라이드 렌더링 | < 3초 |
| 15장 Export 전체 | < 45초 |

**브라우저 지원**: Chrome 120+, Safari 17+, Firefox 121+
