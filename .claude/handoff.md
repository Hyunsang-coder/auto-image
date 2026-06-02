# Session Handoff

> Generated: 2026-06-02 01:00
> Branch: main

## 작업 요약

이번 세션은 두 갈래였다. **(A) 완료** — 에디터의 "기본 레이아웃"과 로컬라이즈의 "기준 언어"가 같은 개념인데 단어가 달라 헷갈린다는 UX 문제를 용어/안내문구로 연결했다(코드 변경 적용, lint/typecheck 통과). **(B) 미착수** — "각 레이아웃(Hero/Hero Bleed 등)의 배치·글자 크기 변경" + "그것들을 조합한 디자인 템플릿(프리셋) 제공" 작업은 요구사항 명확화 단계에서 멈췄다. **다음 세션의 본 작업은 (B)다.**

## 현재 상태

### 변경된 파일 (unstaged, 아직 커밋 안 함)
- `src/components/editor/EditorLayout.tsx` — (A) 작업. 편집언어 드롭다운 라벨/툴팁 수정
- `src/components/localize/LocalizeEditor.tsx` — (A) 작업. 기준 언어 라벨에 안내 툴팁 추가
- `.claude/scheduled_tasks.lock` — 자동 생성 파일(무시. 커밋 대상 아님)

### 커밋 이력 (이번 세션)
- 이번 세션에서 만든 커밋 **없음**. (A) 변경분은 working tree에만 있고 미커밋 상태.
- 직전 커밋 `0dbcf8a feat(localize): narrow control bar + unify source-language wording` 는 이전 세션 것.

## 미완료 작업

### (A) 용어 통일 — 거의 끝, 마무리만
- [ ] 다른 PC에서 `git pull` 후, (A) 변경분을 **직접 화면에서 확인** (`npm run dev`): 에디터 편집언어 드롭다운에 `기본 레이아웃 (기준: 한국어)` 표시되는지, 양쪽 툴팁 문구가 의도대로 보이는지
- [ ] 확인 OK면 (A)만 따로 커밋할지 결정 (단, 사용자 허락 없이 커밋 금지 — 아래 주의사항 참고)

### (B) 레이아웃 튜닝 + 조합 템플릿 — 본 작업, 요구사항부터 확정
- [ ] **작업 1**: 각 레이아웃의 배치/글자 크기 값을 바꾼다. 어떤 레이아웃의 무엇을 어떤 값으로 바꿀지 = **디자인 결정이라 사용자 입력 필요**. (임의로 "더 예쁜 값" 넣지 말 것)
- [ ] **작업 2**: 배치+배경/색+폰트를 조합한 "디자인 프리셋"을 만들어 제공한다. **현재 이 개념은 코드에 없음 — 새 데이터 구조 설계 필요.**
- [ ] (B) 진행 전, 아래 "다음 세션 가이드"의 미해결 질문 3개를 사용자에게 먼저 확정받을 것.

## 핵심 결정 사항

- **(A) '기본 레이아웃' 단어는 유지하고 의미만 보강**: 사용자가 "단어 유지, 의미 보강만" 선택. '기본 레이아웃'은 "전체 언어 공통 레이아웃"이라는 뜻이 맞으니 단어는 두고, 옆에 `(기준: {sourceLocale})`를 동적으로 붙여 어느 언어 원본인지 노출. (대안: '기준 언어'로 단어 자체를 흡수 → "공통 레이아웃" 뉘앙스가 약해져서 기각)
- **(A) 양쪽 페이지 툴팁이 서로를 가리키게 함**: 에디터 툴팁은 "→ 로컬라이즈의 기준 언어 원본", 로컬라이즈 툴팁은 "← 에디터의 기본 레이아웃 텍스트". 두 개념이 같음을 양방향으로 연결.
- **(B)는 착수 전 명확화로 결정**: 작업 1은 디자인 결정값이 필요하고, 작업 2는 새 구조가 필요해 범위가 큼. CLAUDE.md 규칙(Ask > Assume, Minimal > Speculative)에 따라 추측 진행하지 않고 사용자에게 질문하던 중 세션 종료.

## 주의사항

- **커밋 금지 규칙**: 이 프로젝트는 사용자 허락 없이 auto-commit 금지(전역+프로젝트 CLAUDE.md). (A) 변경분도 사용자가 "커밋해" 라고 명시할 때만 커밋.
- **`.claude/scheduled_tasks.lock` 은 커밋 대상 아님** — 자동 생성/갱신 파일. 다른 PC에서 pull 시 충돌 가능성 있으니 신경쓰지 말 것.
- **(B) 작업 1은 "근거 없는 값 변경" 함정 주의**: 시니어 리뷰어가 "왜 이 값?"이라 물을 변경은 하지 말 것. 반드시 사용자 지정 값 또는 화면 보며 함께 조정.
- **(B) "템플릿"의 현재 의미**: 코드상 "템플릿"은 배치만 정하는 5개 `TemplateType`(`hero`, `hero-bleed`, `text-top`, `text-bottom`, `split`)일 뿐. 배경/색/폰트를 묶은 "프리셋" 개념은 **없음**. 작업 2는 이 새 개념을 도입하는 일.
- **배치 값이 여러 파일에 흩어짐**: 텍스트 위치/폭/정렬/gap은 `templateLayouts.ts`의 각 `apply*` 함수에, 디바이스 위치/크기는 같은 파일 `getDeviceLayout`에, 폰트 크기는 `defaults.ts`의 `TEMPLATE_FONT_SIZES`에 있음. 한 레이아웃을 바꾸려면 두 파일을 같이 봐야 함.

## 핵심 파일

### (B) 레이아웃/템플릿 작업의 핵심
- `src/canvas/templateLayouts.ts` — **배치의 핵심**. `DEVICE_WIDTH_RATIO`(0.78), `getDeviceLayout()`(디바이스 위치/크기: split=cw*0.45·centerX cw*0.76, hero-bleed=cw*0.75·cw*0.7, text-top top=ch*0.30 등), `applyHero/applyHeroBleed/applyTextTop/applyTextBottom/applySplit`(텍스트 headlineCenterX/headlineTop/width/align/gap)
- `src/constants/defaults.ts` — **기본값의 핵심**. `makeSlide()`(L446~, 기본 template='text-top', 기본 헤드라인 '당신의 헤드라인'), `HEADLINE_STYLE`/`SUBHEADLINE_STYLE`, `TEMPLATE_FONT_SIZES`(현재 전부 40/22로 동일), `TEMPLATE_TEXT_ALIGN`, `DEFAULT_BACKGROUND`(그라디언트), `DEFAULT_SCREENSHOT_STYLE`. 작업 2의 "프리셋"이 들어갈 자연스러운 위치.
- `src/components/editor/properties/TemplateSelector.tsx` — 에디터에서 5개 레이아웃을 고르는 UI. 작업 2에서 "조합 프리셋 선택기"로 확장할 후보 지점.
- `src/types/project.ts` — `TemplateType`(L2~7), `Slide`/`Caption`/`TextStyle` 타입. 작업 2에서 프리셋 데이터 구조를 정의할 곳.

### (A) 용어 통일 작업 (거의 완료)
- `src/components/editor/EditorLayout.tsx` — L462~480 편집언어 select. `localeLabel(project.sourceLocale)`로 기준 언어 라벨 노출.
- `src/components/localize/LocalizeEditor.tsx` — L407~ 기준 언어 select 라벨 + 안내 툴팁.

## 다음 세션 가이드

**시작 순서:**

1. **(A) 먼저 확인하고 닫기** (5분):
   - `git pull` → `npm run dev` → 에디터/로컬라이즈에서 (A) 문구가 의도대로 보이는지 눈으로 확인.
   - OK면 사용자에게 "이 변경 커밋할까요?" 물어보고 지시 받으면 커밋. (단독 커밋 메시지 예: `docs(ui): clarify base-layout ↔ source-language wording`)

2. **(B) 본 작업 — 착수 전 아래 3가지를 사용자에게 확정받을 것** (이게 이번 핸드오프의 진짜 목적):

   **질문 1 — 작업 1(배치/글자크기)의 값을 어떻게 정할까?**
   - (a) 사용자가 레이아웃별 구체 값을 지정 (예: "hero 헤드라인을 ch*0.42→0.30, 폰트 40→48")
   - (b) `npm run dev`로 띄워놓고 화면 보며 함께 조정
   - (c) Claude가 App Store 마케팅 관점에서 먼저 제안 → 사용자가 선택

   **질문 2 — 작업 2 "조합 템플릿"이 묶어야 할 요소는?** (복수 선택)
   - 레이아웃 타입 / 배경·색 / 폰트·텍스트 스타일 / 예시 텍스트·배치 디테일(완성형 프리셋)

   **질문 3 — 조합 템플릿을 사용자가 어디서 고를까?**
   - 에디터 내 `TemplateSelector` 확장(슬라이드별) / `ProjectSetup`에서 프로젝트 전체 기본값 / 둘 다

3. 질문 확정 후, 작업 2는 **데이터 구조 설계부터** (프리셋 = `{ template, background, headlineStyle, subheadlineStyle, ... }` 형태를 `defaults.ts`나 신규 `templatePresets.ts`에 정의). 작업 1은 사용자 지정 값을 `templateLayouts.ts` + `defaults.ts`에 surgical 반영.

**참고**: 작업 1(기존 5개 레이아웃 튜닝)과 작업 2(조합 프리셋 신규)는 독립적이라 순서 무관. 사용자가 어느 걸 먼저 하고 싶은지도 물어볼 것.
