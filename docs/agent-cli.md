# Agent CLI 로드맵 — Phase 1 + Surgical Patch + Phase 2 구현됨

> 상태: **전 단계 구현·검증 완료.** Phase 1(#1 번들 렌더 입력, #3 validate) + Surgical Patch + Phase 2((B) 마이그레이션 하드닝, #4 타겟 렌더, #2 역방향 내보내기) 모두 머지됨.
> 구현 산출물: 순수 lib `src/lib/projectPatch.ts`·`projectMigrate.ts`·`projectExport.ts`(+각 `.test.ts`), CLI `scripts/project-patch.mjs`(tsx 실행), 하니스 `scripts/headless-export.mjs`(번들 입력 + `--validate`/`--slides`/`--locale`/`--export-manifest` 분기), 앱 hook `ProjectSetup.handleImportFiles`(`window.__importResult`)·`App.tsx`(`window.__exportManifest`)·`ExportPanel`(`window.__renderFilter`), `projectImport.ts` coercer export, `i18n/index.ts` `document` 가드, devDep `image-size`/`tsx`.

AI 에이전트가 에디터를 **더 자유롭고 surgical하게** 활용하게 하는 CLI/헤들리스 확장.
기존 에이전트 루프(manifest 폴더 → 렌더 → `layout-report` 확인 → manifest 수정 → 재렌더)를
(a) **무손실 양방향**으로 닫고, (b) **부분 수정(surgical patch)**을 가능케 하고, (c) 반복을 빠르게.

기반 사실:
- `Project`는 image blob을 빼면 완전 JSON 직렬화 가능(`imageKey` 포인터만). 이미지는 IndexedDB.
- `.studio.zip` 번들(`src/lib/projectBundle.ts`) = `project.json` + `images/<uuid>` → **무손실** GUI 왕복.
- manifest 가져오기 포맷은 **의도적으로 lossy**(텍스트+이미지+디자인 노브; `localeOverrides`·이미지 배경 등은 표현 불가).
- 헤들리스 하니스(`scripts/headless-export.mjs`)는 dev 서버를 띄워 실제 앱을 Playwright로 구동.
- 페이지↔노드 패턴: `addInitScript` 플래그 + window 함수. 바이너리는 download 이벤트, 구조화 데이터는 `page.evaluate` 반환 문자열.

---

## 우선순위 / 순서

1. ✅ **Phase 1**: #1 번들 렌더 입력 + #3 validate/dry-run (저비용, 무손실 루프 + 빠른 검증)
2. ✅ **Surgical patch**: 번들 위 부분 수정 (핵심 신규 니즈)
3. ✅ **Phase 2**: (B) 마이그레이션 하드닝 + #4 타겟 렌더(`--slides`/`--locale`) + #2 역방향 내보내기(`--export-manifest`)

> 구현 메모(설계와 달라진 점):
> - CLI는 순수 lib의 런타임 TS 그래프를 import하므로 bare `node`로는 extensionless `.ts`가 resolve 안 됨 → `tsx`로 실행(`.mjs` 엔트리도 tsx 로더가 처리). `apply-layout-summary.mjs`가 되는 건 그게 **type-only** import만 써서 i18n을 런타임 로드하지 않기 때문.
> - 그 그래프가 node에서 로드되려면 `i18n/index.ts`의 모듈-로드 `document` 부작용을 `typeof document !== 'undefined'`로 가드해야 했음(localStorage는 이미 `safeLocalStorage`로 가드됨). navigator.language는 node 21+ 글로벌이라 OK — CLI issues는 그래서 영어로 렌더됨.
> - patch lib의 자체 issue 문자열은 `t()`를 쓰지 않고 평문 영어(en.test의 literal 스캔/dict 부담 회피, CLI 전용). 위임한 coercer가 내는 `t()` 메시지는 node에서 영어로 나와 일관됨.

> **중요**: surgical patch를 번들 위에서 하면 #2(lossy 역방향)의 손실을 우회한다.
> 에이전트가 무손실 `project.json`을 읽고 무손실 패치를 꽂으므로, "에이전트 편집" 용도엔 #2보다 낫다.

---

## 공유 프리미티브 — gated window 브릿지

기존 패턴(`__layoutReportEnabled`→`__layoutReport`, `__bundleExportEnabled`→`__downloadProjectBundle`) 답습.
- 바이너리(`.studio.zip`): download 이벤트(`saveAs` → `page.waitForEvent('download')`).
- 구조화 JSON: `page.evaluate(() => window.__hook())` 반환 문자열.

Phase 1에서 실제 추가하는 in-app hook은 **#3용 1개**(`window.__importResult`). #1은 in-app 변경 0.
포워드(#2/#4)용 `__getProject()` / `__loadProject(json)` / `__renderFilter`는 **이름만 예약**, 지금 구현 안 함.

---

## #1 — 번들을 렌더 입력으로 (하니스 전용, 앱 변경 0)

근거: `.zip` 입력 → `importProjectBundle→loadProject`는 manifest import와 동일 상태(step 2, blob 복원 완료, ready-to-Export). fresh 프로필은 overwrite 모달도 안 뜸(`ProjectSetup.tsx` `handleLoad`: `existingProject` falsy → `doLoad` 직행 → `useProjectStore.loadProject`).

CLI:
```bash
npm run headless:export -- project.studio.zip <out-dir>            # 번들 → PNG
npm run headless:export -- project.studio.zip <out-dir> --report   # + layout 리포트
```

하니스 변경(`scripts/headless-export.mjs`):
1. 입력 위치 인자를 `stat`. **파일(.zip/.studio.zip) → 번들 모드**(`IMPORT_EXTS` readdir 스킵), 디렉터리 → 기존 폴더 모드.
2. 번들 분기(현 import 드라이브 구간 대체):
   - `page.getByText('프로젝트 파일 열기').first().waitFor()`
   - `page.locator('input[accept=".zip"]').setInputFiles(bundlePath)`
   - 에디터 진입 대기(요약 모달/"에디터에서 검수 →" 없음): step-2 신호(예: `getByRole('button', { name: '프로젝트 파일 저장' })` — step≠1에서만 노출) 또는 캔버스 가시성.
   - 실패 가드: `bundleError` 모달 보이면 즉시 exit 1.
3. 이후 Export 경로(Export 탭 → ZIP → extract → report) 그대로 재사용.

직교/엣지:
- `--fastlane`/`--report`/`--fail-on-layout-issues` 모두 합성됨(렌더 경로 공유).
- 번들입력 + `--bundle`(출력) = 로드 후 재방출. 무의미하나 무해 → 경고만.
- **버전 caveat**(아래 "마이그레이션 부재") — 구버전 번들은 오렌더 가능.

---

## #3 — validate / dry-run (앱 hook 1 + 하니스)

근거: `runProjectImport`(`src/lib/projectImportRun.ts`)가 렌더 전에 구조화 결과 반환 —
`ImportRunResult { project, applied:{slides,screenshots,captions}, addedLocales, issues }`. 하니스가 지금 DOM 텍스트로 긁는 그 데이터를 **구조화 JSON으로** 받고 Export를 건너뛴다.

앱 변경(`src/components/setup/ProjectSetup.tsx`, `handleImportFiles`의 `setImportResult(result)` 직후):
```ts
if ((window as ...).__validateEnabled) {
  ;(window as ...).__importResult = JSON.stringify({
    ok: !!result.project,
    applied: result.applied,
    addedLocales: result.addedLocales,
    issues: result.issues,
    project: result.project,   // imageKey 포인터만 → JSON 안전
  })
}
```
- commit(loadProject) 안 함 → 렌더/ZIP/리포트 전부 스킵. blob 부수효과는 fresh 프로필과 함께 폐기.

하니스 변경:
- `--validate` 플래그 → `addInitScript(() => { window.__validateEnabled = true })`.
- 흐름: goto → import 입력 setInputFiles → 요약 locator로 import 완료 확인 → `page.evaluate(() => window.__importResult)` → `<out>/import-result.json` 기록 → 종료(에디터/Export 미진입).

출력 `import-result.json`:
```jsonc
{ "ok": true,
  "applied": { "slides": 6, "screenshots": 12, "captions": 24 },
  "addedLocales": ["ja"],
  "issues": ["..."],          // ⚠ 한국어 prose, 안정 code 없음
  "project": { /* 조립된 Project 전체 JSON */ } }
```

한계: #3의 순증분은 "구조화 채널 + 렌더 스킵"이지 신규 능력 아님(요약/경고는 이미 DOM에 있음). issues는 한국어 prose(안정 code 원하면 import issue 형태 변경 — 별도).

---

## Surgical Project Patch (핵심 신규)

목표: 에이전트가 **특정 슬라이드 · 특정 언어 · 특정 텍스트**(또는 디바이스 이미지, deviceFrame, 배경 등) 하나만 수정. 나머지는 비트 단위 보존.

### 기판 = 번들(.studio.zip)
- 무손실(한 필드만 바꾸고 `localeOverrides`·하이라이트·ids 전부 보존). 이미지도 zip 내부 파일이라 로컬 처리. JSON-only면 브라우저 불필요.
- manifest+캡션 패치는 **도구 불필요**(에이전트가 CSV 셀/파일 직접 교체) + lossy + 재import가 ids 재생성 → 비채택.
- live localStorage 패치는 부차(파일-as-interface와 어긋남). 필요 시 `__loadProject` 경유 별도.

### 패치 포맷 — 도메인 op (import 어휘 재사용) + escape hatch
RFC6902 JSON Patch는 내부 경로 노출 + clamping/불변식 보호 없음 → 부적합. 캡션/manifest의 주소 체계(1-based slide · field · locale) 그대로:
```jsonc
[
  { "op": "setText", "slide": 3, "field": "headline", "locale": "ja", "value": "新しい見出し" },
  { "op": "setText", "slide": 2, "field": "badge:0", "locale": "ko", "value": "신규" },
  { "op": "setScreenshot", "slide": 3, "locale": "en", "file": "new-shot.png" },
  { "op": "addExternalImage", "slide": 1, "file": "logo.png", "x": 0.42, "y": 0.55, "width": 0.28, "cornerRadiusRatio": 0.06, "shadow": true },
  { "op": "setExternalImage", "slide": 1, "index": 0, "rotation": -8, "opacity": 0.85, "crop": { "top": 0, "right": 0, "bottom": 0.08, "left": 0 } },
  { "op": "removeExternalImage", "slide": 1, "index": 0 },
  { "op": "set", "slide": 3, "path": "deviceFrame.scale", "value": 0.9 },
  { "op": "set", "slide": 1, "path": "background", "value": { "type": "solid", "color": "#101015" } },
  { "op": "set", "path": "name", "value": "New Name" }
]
```
주소 규칙(기존과 동일):
- `slide`: 1-based 또는 `slideId`(번들은 id 보존 → reorder 강함). span은 시각 슬라이드 각각을 자기 번호로.
- `field`: `headline`=text:0, `subheadline`=text:1, `text:N`, `badge:N`.
- `locale` 라우팅: `=== sourceLocale` → base(`texts[i].text`/`screenshot`), 그 외 → translation/override(`translations[locale]`/`localeOverrides[locale]`). 새 locale은 `targetLocales` 자동추가.

### 적용 = 기존 import 헬퍼에 위임 (새 검증 로직 거의 0)
| op | 재사용 |
|---|---|
| `setText` | `src/lib/localePatch.ts` `buildBasePatch`/`buildTranslationPatch`/`buildImportPatch` (base↔translation 라우팅 + targetLocales 자동추가 — 이미 구현됨) |
| `set deviceFrame.*` | `projectImport.ts` `coerceDeviceFrame` (scale 0.3–2.0, rotation ±180, offset clamp) |
| `set screenshotStyle.*` | `coerceScreenshotStyle` (corner 0–0.2, crop 0–0.5) |
| `set` texts[i] 스타일 | `applyTextOverride`/`coerceTextOverrides` |
| `set background` | manifest 배경 파서(solid/gradient; image 거부) |
| `set` ornaments/highlights/badges 구조 | `makeOrnament`/`makeHighlight`/`makeBadge` |
| `setScreenshot` | `bulkImageImport` 라우팅(base vs override, 교차타입 aspect) + dims |
| `add/set/removeExternalImage` | bundle image blob + `externalImages[]` geometry/render style(max 3; corner/crop ranges mirror `screenshotStyle`) |

### 아키텍처 — 순수 lib + 얇은 CLI
```
src/lib/projectPatch.ts   (순수: store/React/idb 없음)
  applyPatch(project, ops): { project, issues[] }
```
- 이미지 경계(역방향과 동일 원칙): 순수 lib은 blob 모름. `setScreenshot`은 `{imageKey,width,height}`, 외부 이미지는 `{imageKey,imageWidth,imageHeight}`를 인자로 받아 project만 변경. 파일 디코딩·blob 배치는 호출자.
- CLI `scripts/project-patch.mjs`:
  1. `.studio.zip` 언집 → `project.json` 파싱
  2. `setScreenshot.file`/`addExternalImage.file`/`setExternalImage.file` → Node에서 dims 디코드(`image-size` devDep, native 의존 없음) → `images/<newuuid>.<ext>` 추가 → 필요한 image payload 산출
  3. `applyPatch(project, ops)`
  4. `projectImageKeys`(`src/lib/imageRefs.ts`, export됨)로 미참조 이미지 파일 prune(orphan 제거) → 재zip
- 인앱 호출자(선택)는 같은 lib + `fileToImageKey`(blob 저장)로 재사용 가능.

### CLI 표면 & 합성
```bash
npm run project:patch -- in.studio.zip patch.json out.studio.zip
npm run project:patch -- in.studio.zip patch.json --in-place
npm run project:inspect -- in.studio.zip inspect.json
npm run project:inspect -- in.studio.zip inspect.json --extract-images extracted-assets
# 합성: 패치 → 렌더(#1) / 패치 → GUI 열기로 검수
npm run headless:export -- out.studio.zip render-out --report
```

### 안전장치
- `set path` **whitelist**: `deviceFrame.*`, `screenshotStyle.*`, `background`, `template`, `texts[i].style.*`, `texts[i].pos/boxWidth`, `badges[i].style.*`, `ornaments`, `highlights`, `externalImages[i].x/y/width/rotation/opacity/cornerRadiusRatio/shadow/crop` 및 `externalImages[i].crop.top/right/bottom/left`, 프로젝트 `name/sourceLocale/targetLocales/deviceModels`. **금지**: `id`/`imageKey` 직접, `spanGroupId`, `index`(불변식 보호; 이미지는 전용 image op로만).
- span 불변식: leader가 공유 레이어 소유 → follower에 `deviceFrame/background/externalImages` 패치 시 거부+경고(텍스트는 follower 소유라 허용).
- 모든 거부/보정은 `issues[]` 보고.

### 엣지
- `setScreenshot` 교차타입: 새 aspect가 크게 다르면 기본은 frame 유지(surgical), 불일치 시 경고. `"redetect": true`로 강제 재검출.
- source locale 셀 setText → editor base 덮어씀(import과 동일, 요약 카운트).
- `slideId` 우선, 없으면 1-based `slide`. 매칭/슬롯 실패 행은 skip+경고.

### 포워드
- add/remove op(ornament 추가, badge 삭제) — 지금은 set만.
- live-injection 패치(`__loadProject`) — 파일 패치 정착 후.
- escape hatch를 RFC6902로 — 필요 시.

---

## 가로지르는 리스크 — `loadProject` 마이그레이션 부재 → (B)로 하드닝됨 ✅

(과거 리스크) `useProjectStore.loadProject`는 `ensureThemeBackground`만 적용, persist의 v4→v5 span 마이그레이션은 부팅 rehydration에서만 실행 → 구버전 번들을 #1 입력/주입하면 span 캡션 오렌더, pre-v4는 malformed.

**(B) 구현됨**: persist `migrate`의 프로젝트 마이그레이션을 순수 `src/lib/projectMigrate.ts` `migrateProject(project, fromVersion): Project | null`(`<4`→null, `<5`→`migrateSpanSlides`)로 추출. persist `version`/번들 envelope `schemaVersion`/이 헬퍼가 모두 `PROJECT_SCHEMA_VERSION`(=5) 단일 상수를 공유. `exportProjectBundle`이 `schemaVersion`을 stamp하고, `importProjectBundle`이 반환 전 `migrateProject(project, schemaVersion ?? 4)` 적용(구 v1 번들=schema v4로 간주). `bundleVersion`(envelope 포맷)과 `schemaVersion`(프로젝트 스키마)은 별개로 유지.

---

## Phase 2 — 구현·검증 완료 ✅

> 순서대로 (B) → #4 → #2 구현, 각 단계 build/lint/test green + 헤들리스 end-to-end 검증.
> 공유 패턴: Phase 1의 게이트(`addInitScript` 플래그 → 앱이 `window.__x`를 읽거나 발행) 답습. 새 in-app hook: #4용 `window.__renderFilter`(ExportPanel 읽기), #2용 `window.__exportManifest`(App 발행).

### (B) loadProject 마이그레이션 하드닝 ✅
위 "가로지르는 리스크" 섹션 참고. `src/lib/projectMigrate.ts` `migrateProject` + `PROJECT_SCHEMA_VERSION`, persist `migrate`/`exportProjectBundle`/`importProjectBundle`이 공유. 검증: `projectMigrate.test.ts`가 v4 형태(leader-owned 우반 캡션) 프로젝트 → follower 우페이지 split, pre-v4→null, v5→identity.

### #4 타겟 렌더 (`--slides 2,3 --locale en`) ✅
슬라이드/로케일 부분 집합만 렌더(반복 빠르게).
- 하니스 `--slides`/`--locale`(둘 다 `--x v`/`--x=v` 형식 지원) → `addInitScript`로 `window.__renderFilter = { slides:[2,3], locales:['en'] }`. `--validate`/`--bundle`과는 비호환(렌더 경로 미진입) → 경고 후 무시.
- `ExportPanel`이 `readRenderFilter()`로 읽어 마운트 시 `excludedLocales`를 시드(로케일은 기존 경로 그대로) + 1-based **슬라이드 화이트셋**으로 `total`/렌더 루프를 게이트. 화이트셋 밖 일반 슬라이드는 렌더 자체 스킵.
- **span 짝 확장**: 선택 슬라이드가 span 반쪽이면 leader가 2× 캔버스를 그려야 하므로, 두 반쪽 중 하나라도 선택되면 렌더하되 원하는 반쪽 PNG만 emit/count. 둘 다 미선택이면 그 짝은 통째 스킵.
- 검증: 3슬라이드(1 일반 + span 1쌍)+2로케일 fixture. `--slides 2 --locale en` → `en-US/iphone/02.png` 1장만(leader 반쪽), `--slides 1,3 --locale ko` → `01.png`+`03.png`(span follower 03 포함, leader 02 미emit). 전부 full-res(1320×2868).

### #2 역방향 텍스트 내보내기 (`--export-manifest`) ✅
라이브 프로젝트 → manifest + 캡션(에이전트가 텍스트만 손보고 재import). **lossy** — 무손실 편집은 surgical patch가 커버하므로 이건 "텍스트 일괄 추출/재작성" 용도.
- 순수 lib `src/lib/projectExport.ts` `exportProject(project) → { manifest, captions, screenshotPlan, externalImagePlan, issues }` = `projectImport.ts`의 역. manifest는 authored 파일 스키마(`parseManifest`가 읽는 형태), 캡션은 `localeIO.ts` `serializeTemplate`(text:N·badge:N × 모든 로케일) 재사용, 스크린샷은 파일명 plan(`{n}.{locale}.png`), 외부 이미지는 plan(`{n}-external-{i}.png`)으로 분리.
- in-app hook `window.__exportManifest()`(`__exportManifestEnabled` 게이트, `App.tsx`)가 **브라우저에서** 역변환을 돌려 결과 JSON을 반환 — 하니스(bare node)는 TS lib 그래프를 import 못 하므로(그건 `project:patch`=tsx 전용) 앱이 번들한 lib을 쓰는 게 일관됨(설계의 `__getProject`+하니스-측 lib에서 변경된 점). 하니스 `--export-manifest`가 `manifest.json`+`captions.csv`+`image-plan.json`을 쓰고 plan/issues를 로깅, 렌더는 스킵.
- **lossy는 `issues[]`로 명시**(평문 영어, projectPatch 컨벤션): `localeOverrides`(로케일별 룩)·이미지 배경·`localeSource`·non-default `fontFamily`·caption box `border`/`shadow`·badge `icon`/`iconPosition`·`frameModel`·혼합 디바이스 타입.
- 검증: `projectExport.test.ts`가 export → `parseManifest`→`buildProjectFromManifest`→`applyCaptionRows` 왕복으로 핵심 필드(텍스트·레이아웃·deviceFrame·배경 solid/gradient·번역) 일치 + lossy 마커 전부 `issues`에 나열. 헤들리스로 import 폴더·번들 양쪽 입력에서 manifest/captions 생성 + 재import 렌더(6 PNG) 확인.

---

## 검증 계획 (Phase 1 + patch — 완료, 참고용)

- ✅ #1: manifest 폴더 → `--bundle`로 `.studio.zip` → `headless:export <zip> out --report` → PNG 4장 + layout 0 issue 확인.
- ✅ #3: manifest 폴더 → `--validate` → `import-result.json`의 `applied`(slides/screenshots/captions)/`project` 일치 + PNG 0개 확인.
- ✅ patch: op별 단위 테스트 20개(setText base/translation·targetLocale 자동추가, setScreenshot base/override/cross-type/redetect, set clamp/거부, span follower 거부, 순수성) + 실번들 라운드트립(patch → 헤들리스 렌더로 텍스트·배경·신규 로케일 반영 확인).
- ✅ 전 구간 build/lint/test green(334 tests).

## 작업량 (대략, 남은 것)
- (B) 하드닝: ~0.5d(순수 헬퍼 추출 + envelope stamp + 마이그레이션 단위 테스트). #4: ~0.5–1d(하니스 플래그 + ExportPanel 필터 + span 확장 + 검증). #2: ~1d(역방향 lib + hook + lossy 보고 + 왕복 테스트).
