# Agent CLI 로드맵 — 설계 (미구현)

> 상태: **설계 단계**. 코드 미작성. 새 세션이 이 문서를 읽고 워크트리에서 구현한다.
> 전제 사실은 별도 딥 조사로 검증됨(file:line은 설계 시점 기준 — 구현 전 재확인할 것).

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

1. **Phase 1**: #1 번들 렌더 입력 + #3 validate/dry-run (저비용, 무손실 루프 + 빠른 검증)
2. **Surgical patch**: 번들 위 부분 수정 (핵심 신규 니즈)
3. **(뒤로) Phase 2**: #4 타겟 렌더, #2 역방향 텍스트 내보내기 (아키텍처 호환만 확보)

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

### 아키텍처 — 순수 lib + 얇은 CLI
```
src/lib/projectPatch.ts   (순수: store/React/idb 없음)
  applyPatch(project, ops): { project, issues[] }
```
- 이미지 경계(역방향과 동일 원칙): 순수 lib은 blob 모름. `setScreenshot`은 `{imageKey,width,height}`를 인자로 받아 project만 변경. 파일 디코딩·blob 배치는 호출자.
- CLI `scripts/project-patch.mjs`:
  1. `.studio.zip` 언집 → `project.json` 파싱
  2. `setScreenshot.file` → Node에서 dims 디코드(`image-size` devDep, native 의존 없음) → `images/<newuuid>.<ext>` 추가 → `{imageKey,width,height}` 산출
  3. `applyPatch(project, ops)`
  4. `projectImageKeys`(`src/lib/imageRefs.ts`, export됨)로 미참조 이미지 파일 prune(orphan 제거) → 재zip
- 인앱 호출자(선택)는 같은 lib + `fileToImageKey`(blob 저장)로 재사용 가능.

### CLI 표면 & 합성
```bash
npm run project:patch -- in.studio.zip patch.json out.studio.zip
npm run project:patch -- in.studio.zip patch.json --in-place
# 합성: 패치 → 렌더(#1) / 패치 → GUI 열기로 검수
npm run headless:export -- out.studio.zip render-out --report
```

### 안전장치
- `set path` **whitelist**: `deviceFrame.*`, `screenshotStyle.*`, `background`, `template`, `texts[i].style.*`, `texts[i].pos/boxWidth`, `badges[i].style.*`, `ornaments`, `highlights`, 프로젝트 `name/sourceLocale/targetLocales/deviceModels`. **금지**: `id`/`imageKey` 직접, `spanGroupId`, `index`(불변식 보호; 이미지는 `setScreenshot`로만).
- span 불변식: leader가 공유 레이어 소유 → follower에 `deviceFrame/background` 패치 시 거부+경고(텍스트는 follower 소유라 허용).
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

## 가로지르는 리스크 — `loadProject` 마이그레이션 부재

`useProjectStore.loadProject`는 `ensureThemeBackground`만 적용, persist의 v4→v5 span 마이그레이션(`migrateSpanSlides`)은 부팅 rehydration에서만 실행. → 구버전 번들을 #1 입력/주입하면 span 캡션 오렌더, pre-v4는 malformed.

- (A) 문서화만 — "동일 앱 버전 번들만"(기본, 비용 0).
- (B) 하드닝(권장) — persist `migrate` 클로저의 마이그레이션을 순수 헬퍼 `migrateProject(project, fromVersion)`로 추출 → `importProjectBundle`이 반환 전 적용. 번들 envelope에 앱 스키마 버전 stamp 추가(현 `bundleVersion`은 envelope만).

---

## Phase 2 (뒤로, 호환만 확보)

- **#4 타겟 렌더** (`--slides 2,3 --locale en`): `__renderFilter` addInitScript → `ExportPanel.tsx` 로케일 필터(`excludedLocales` 패턴, trivial) + 슬라이드 루프 게이트. **반드시 span 짝 확장**(선택된 span 반쪽은 인접 파트너 포함 렌더 후 불필요 PNG 폐기) — naive index 필터는 crash/누락.
- **#2 역방향 텍스트 내보내기** (`--export-manifest`): 순수 lib `projectExport.ts`(projectImport 역). `__getProject()` → manifest + 캡션(localeIO 재사용) + 스크린샷 plan. **lossy 집합**(`localeOverrides` 로케일별 레이아웃·이미지 배경·`localeSource`·fontFamily·box border/shadow·badge icon·frameModel)은 `issues[]` 보고. 무손실 필요하면 #1+`--bundle`로 충분 → surgical patch가 있으면 편집 용도엔 대체로 불필요.

---

## 검증 계획

- #1: manifest 폴더 → `--bundle`로 `.studio.zip` → `headless:export <zip> out` → PNG가 manifest 직행 렌더와 동일 구조인지. GUI 왕복(열기→1슬라이드 수정→재저장→재렌더 반영) 확인.
- #3: manifest 폴더 → `--validate` → `import-result.json`의 `applied`/`issues`가 DOM 요약과 일치 + PNG 0개.
- patch: op별(setText base/translation, setScreenshot base/override, set clamp, 거부) 단위 테스트 + 번들 라운드트립(patch → 열기/렌더로 반영 확인).
- 전 구간 build/lint/test green.

## 작업량 (대략)
- #1: 하니스 분기만, ~0.5d. #3: hook 1 + serializer + 플래그, ~0.5d. patch: 순수 lib + CLI + image-size devDep + 테스트, 보통. (B) 하드닝: ~0.5–1d.
- 권장 순서: #1 → #3 → surgical patch → (B). #1·#3 독립이라 병렬 가능.
