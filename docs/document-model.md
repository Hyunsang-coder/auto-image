# 문서 모델 전환 계획 (데스크톱)

이 문서는 **다른 세션이 대화 맥락 없이 그대로 집어들 수 있도록** 쓰였다. 배경 →
확정된 전제 → 이미 끝난 것 → 남은 단계 → 검증 → 하지 말 것 순서.

## 왜

앱에 "내 프로젝트"가 뭔지 합의하지 않은 저장소가 셋 있다.

| | 정체 | 문제 |
|---|---|---|
| localStorage 활성 슬롯 | 실제 작업본 | 하나뿐. 이름만 있고 파일 정체성이 없음 |
| 라이브러리 (`useLibraryStore`) | 앱 안의 가짜 Finder | 수동 스냅샷이라 첫 편집에 stale. 5MB 캡을 다른 둘과 공유 |
| `.studio.zip` | 진짜 파일 포맷 | 경로 기억이 없어 저장할 때마다 새 다운로드 |

그래서 앱에 **"전환"이라는 동작이 없다.** 있는 건 "교체"뿐이고, 프로젝트 A → B로
가는 데 조작 7번·모달 2개·메뉴 2곳이 들고, 중간에 수동 저장을 빠뜨리면 A가 사라진다.
UI 문제로 보이지만 원인은 문서 정체성의 부재다.

## 확정된 전제 (사용자 확인 완료, 재론 금지)

1. **웹 빌드는 더 이상 쓰지 않는다.** 데스크톱(Tauri) 기준으로 설계한다. 웹에서
   깨지지만 않으면 된다 — 새 기능은 `isTauri()` 뒤에 둔다.
2. **동시에 굴리는 프로젝트 2~4개.** Recents가 곧 전환 UI다. 검색·정렬·대규모
   그리드는 불필요.
3. **앱이 기본 폴더를 잡되 사용자가 옮길 수 있다.** 기본 `~/Documents/Screenshot
   Studio/`, `Save As`로 임의 위치 이동 가능.
4. **단일 창으로 충분하다.** 다중 문서/다중 창 없음 → 에이전트 브리지는 "열려 있는
   하나의 프로젝트"를 계속 가리키면 되고 구조를 바꿀 필요가 없다.
5. **파일 이름이 곧 문서 이름이다.** 헤더와 창 제목은 `docPath`의 basename을 보여주고,
   이름을 바꾸는 유일한 방법은 `Save As`다. 앱은 사용자가 놓아둔 파일을 절대 스스로
   옮기거나 rename하지 않는다 — Finder·Git으로 관리하는 경로가 자상하게 움직이면 안 된다.
   `project.name`은 남지만 **표시 이름이 아니다** (내보내기 폴더명 등 기존 용도만).
   `Save As` 성공 시 `project.name`을 새 basename으로 맞춰 둘이 갈라지지 않게 한다.

## 이미 끝난 것 (Phase 0, main에 있음)

파일 쓰기를 핵심 경로로 승격시키기 전에 깔아둔 안전망. 커밋 `f77f405`, `6daab7f`,
`09daab4`, `7a77155`, `845e88e`.

- **원자적 쓰기** — `src-tauri/src/save.rs` `write_atomic()`: 형제 임시 파일 →
  `sync_all` → `rename` → 부모 디렉터리 fsync. 임시 파일이 `/tmp`가 아니라 형제인
  이유는 rename이 같은 파일시스템 안에서만 원자적이기 때문. `write_file`(PNG 내보내기)도
  이 경로를 탄다.
- **크래시 복구 미러** — `src/lib/autosave.ts` + `save.rs`의 `autosave_*` 커맨드.
  프로젝트 JSON을 `<config>/autosave.json`에, 참조된 이미지를 `<config>/autosave-images/`에
  집합 차분으로 동기화. 실행 시 localStorage 사본과 비교해 미러가 앞서면 **복구를 제안**
  (절대 조용히 적용하지 않음). 수락 시 IndexedDB가 잃은 블롭을 되돌린 뒤 프로젝트를 로드.
- **저장 실패·불완전 저장 노출** — `exportProjectBundle`이 `BundleExport
  { blob, missingImageKeys }`를 반환. 이미지 누락을 삼키지 않는다.
- **시작 시 스윕 게이트** — 고아 이미지 스윕은 복구 결정이 끝나기 전에 돌지 않는다
  (keep-set이 *로드된* 프로젝트 기준이라, 미러가 앞선 실행에서 복구가 필요할 이미지를
  지워버렸다).

**Phase 1 이후는 이 원시 도구 위에 올린다.** 새로 파일 쓰기를 만들지 말고
`write_atomic`을 쓸 것.

## 미러와 문서 파일의 관계 (반드시 먼저 읽을 것)

Phase 1 이후에는 **저장소가 둘**이 된다. 역할을 섞으면 안 된다.

| | 무엇을 들고 있나 | 언제 쓰나 |
|---|---|---|
| 문서 파일 (`docPath`) | 사용자가 마지막으로 `저장`한 상태 | ⌘S / ⌘⇧S / 새 프로젝트 생성 시 |
| 미러 (`<config>/autosave*`) | **마지막 저장 이후의 편집분** | 편집마다 (디바운스 1.5s) |

규칙:

- 미러 스냅샷에 **`docPath`를 함께 기록한다.** 이게 없으면 "어느 문서의 미저장 편집인지"를
  판단할 수 없다.
- **열기·저장이 성공하면 미러를 즉시 그 상태로 다시 쓴다.** 방금 저장한 문서보다 미러가
  앞서 있는 상태를 만들지 않는다.
- 실행 시 분기 (`chooseRecovery` 확장):
  - `mirror.docPath === 기억된 docPath` 이고 미러가 앞섬 → **"저장하지 않은 편집이 있습니다"**
  - `mirror.docPath`가 없거나 다름 → 기존 "localStorage가 프로젝트를 잃음" 경로
  - 미러가 뒤처지거나 같음 → 아무 말 안 함
- 복구를 수락하면 `docPath`는 유지하고 `savedHash`는 **파일 것 그대로 둔다** → 문서가
  dirty 상태로 열리고, ⌘S 한 번이면 파일에 반영된다. 이게 맞다: 복구된 편집은 아직
  파일에 없다.
- **미러를 문서 저장으로 대체하지 말 것.** 사용자가 몇 시간 ⌘S를 안 누를 수 있고,
  그 구간을 지키는 게 미러의 존재 이유다.

## 열기·저장 흐름

`loadProject`는 경로를 모른다. 문서 수준 동작은 그 위에 얹는다.

```
openDocument(path):
  if dirty: 3버튼 프롬프트 (저장 / 저장 안 함 / 취소) — 취소면 중단
  bytes    = read_document(path)
  project  = importProjectBundle(blob)   // 블롭 복원 + migrateProject 포함
  loadProject(project)                   // 기존 동작: step 2, 첫 슬라이드
  docPath   = path
  savedHash = hash(project)              // ↓ 아래 결정
  recents.push(path, preview)
  미러를 이 상태로 다시 씀

saveDocument():                          // ⌘S
  if !docPath: saveDocumentAs()
  { blob, missingImageKeys } = exportProjectBundle(project)
  if 스키마가 올라간 첫 저장: 원본을 <name>.studio.zip.bak 으로 1회 보존
  save_document(docPath, base64(blob))   // write_atomic
  savedHash = hash(project)
  if missingImageKeys.length: 경고 모달 (Phase 0 것 재사용)
  recents 갱신 + 미러 다시 씀
  // 저장 성공을 확인하기 전에 어떤 이미지도 GC하지 않는다
```

**마이그레이션된 파일은 clean으로 연다.** v4 파일을 열면 메모리 프로젝트가 파일 내용과
다르지만, 사용자는 아무것도 바꾸지 않았다. dirty로 열면 반사적으로 ⌘S를 누르게 되고
`.bak`이 공짜로 발생한다. `.bak`은 사용자의 **첫 실제 저장** 때 만든다. (매 열기마다
`importProjectBundle`이 마이그레이션하므로 파일이 v4로 남아 있어도 안전하다.)

## 에이전트 브리지

브리지는 이 앱의 1급 기능이다. 문서 모델이 들어오면 어휘를 맞춰야 한다.

- 에이전트 패치는 **사용자 편집과 동일하게 dirty를 만든다.** 특별 취급 없음.
- 에이전트 패치가 자동 저장을 유발하지 않는다 — 사용자 편집과 같고, 미러가 덮는다.
- `status`에 `docPath`와 `dirty`를 추가한다. 지금 에이전트는 자기가 무슨 파일을
  건드리는지 알 방법이 없다.
- 메서드 추가: `save` (docPath에 저장, 없으면 에러), `open(path)`.
  **이건 테스트 하네스이기도 하다 — 아래 검증 절 참고.**
- MCP 쪽(`packages/mcp/lib/tools.mjs` + `scripts/mcp-server.mjs`)에 `live_save` /
  `live_open`을 1:1로 얹는다. 두 서버가 같은 정의를 공유한다는 기존 규칙을 지킬 것.

---

## 먼저: 스파이크 (반나절, 코드 남기지 않아도 됨)

Phase 1의 위험이 여기 몰려 있다. **이걸 먼저 확인하지 않고 1b를 설계하지 말 것.**

1. **종료 가드 왕복.** Tauri v2 `WindowEvent::CloseRequested` → `api.prevent_close()`
   → 웹뷰로 이벤트 → 웹뷰가 3버튼 다이얼로그 → `confirm_close(save: bool)` 커맨드 →
   Rust가 저장 후 종료 or 즉시 종료. 확인할 것: 이벤트 재진입, 중복 발화, **웹뷰가
   먹통일 때 앱이 종료 불가가 되지 않는지**.
   - 결정: 웹뷰 응답에 타임아웃(예: 3초)을 두고 **타임아웃이면 종료를 허용한다.**
     먹통이면 어차피 저장할 수 없고, 미러가 데이터를 들고 있으므로 종료 불가 상태로
     사용자를 가두는 쪽이 더 나쁘다.
2. **네이티브 다이얼로그.** `@tauri-apps/plugin-dialog`의 `save`/`open`은 이미
   `ExportPanel`·`LocalizeEditor`에서 쓰이므로 동작은 검증됨. 확인할 것: 기본 디렉터리
   지정, **`.studio.zip` 이중 확장자를 macOS 저장 패널이 어떻게 다루는지**(`.zip`으로
   잘리거나 `.studio.zip.zip`이 되지 않는지), 덮어쓰기 확인이 OS 쪽에서 나오는지.
   - 이중 확장자가 문제면 대안은 `.studiozip` 단일 확장자. 단, `.studio.zip`은 CLI·MCP·
     headless가 이미 쓰는 이름이라 **바꾸려면 `scripts/`와 `docs/`를 같이 고쳐야 한다.**

---

## Phase 1a — 파일 정체성과 저장

**목표: 프로젝트에 경로가 생기고, ⌘S가 그 경로에 원자적으로 쓴다.**

### 상태

`useProjectStore`에 추가 (프로젝트 데이터가 아니므로 `.studio.zip` 안에는 안 들어간다):

```ts
docPath: string | null      // 절대 경로. null = 아직 파일이 없음
savedHash: string | null    // 마지막 저장 시점의 프로젝트 해시
```

둘 다 `partialize`에 포함 — 재실행 때 어떤 문서를 열고 있었는지 기억해야 한다.

### dirty 판정은 플래그가 아니라 해시

`hash(JSON.stringify(project)) !== savedHash`. 이유: 플래그는 undo·에이전트 브리지·
일괄 편집에서 반드시 어긋난다. 해시는 **undo로 저장 시점까지 되돌아가면 자동으로 clean**이
된다. 의존성 추가 금지 — FNV-1a 10줄이면 된다.

- 알려진 한계: 키 순서가 달라지면 false dirty가 난다. 안전한 방향이므로 수용한다.
- 이미지: 스크린샷 교체는 항상 새 `imageKey`를 만들므로 JSON이 바뀐다. 커버됨.

### 저장

```
Rust:  save_document(path: String, data_base64: String) -> Result<(), String>
       // 절대 경로(다이얼로그가 준 것)를 write_atomic으로. write_file과 달리
       // dir+상대경로 가드를 쓰지 않는다 — 경로를 고른 건 사용자다.
Rust:  read_document(path: String) -> Result<String, String>   // base64
```

TS 흐름: `exportProjectBundle(project)` → `blob` → base64 → `save_document(docPath)` →
성공 시 `savedHash = hash(project)`. `missingImageKeys`가 비어 있지 않으면 경고
(Phase 0의 모달 재사용).

**저장 성공을 확인하기 전에 어떤 이미지도 GC하지 말 것.**

### 새 프로젝트는 즉시 파일이 된다

`createProject` 직후 `~/Documents/Screenshot Studio/<name>.studio.zip`에 저장한다
(이름 충돌 시 ` 2`, ` 3` …). "저장 안 한 문서" 상태를 만들지 않는 이유: 사용자의
1순위 요구가 작업 유실 방지이고, 이름 없는 문서는 그 요구와 정면으로 충돌한다.

### 옛 스키마 파일은 파괴적으로 마이그레이션하지 않는다

`importProjectBundle`은 이미 메모리에서 `migrateProject`를 돌린다. **스키마 버전이
올라간 파일을 처음 저장할 때는 원본을 `<name>.studio.zip.bak`으로 한 번 남긴다.**
마이그레이션 버그 하나가 원본까지 가져가는 걸 막는 유일한 장치다.

### 인스턴스 하나만 (작지만 여기 있어야 함)

지금은 앱을 두 번 띄울 수 있고, 두 인스턴스가 **같은 미러 파일과 같은 localStorage를
공유한다** — 서로의 편집을 덮어쓰는 경로다. 브리지는 이미 소켓 충돌로 이걸 감지해
경고만 남긴다(`agent bridge unavailable: another Screenshot Studio instance already
owns the agent bridge`). 같은 신호로 두 번째 인스턴스는 안내 후 종료시킨다.

### 완료 기준

- [ ] 새 프로젝트를 만들면 기본 폴더에 `.studio.zip`이 생기고 헤더가 그 파일명을 보여준다
- [ ] 편집 → ⌘S → 앱 종료 → 재실행 → 같은 문서가 같은 내용으로 열린다
- [ ] 편집 후 undo로 저장 시점까지 되돌리면 dirty가 **스스로 풀린다**
- [ ] 저장 실패(권한 없는 경로)가 모달로 뜨고, **원본 파일이 그대로다**
- [ ] v4 번들을 열면 clean이고, 첫 저장에서만 `.bak`이 생긴다
- [ ] 두 번째 인스턴스가 뜨지 않는다

---

## Phase 1b — 메뉴·단축키·종료 가드

지금 `tauri::menu`를 전혀 쓰지 않는다. macOS 사용자가 근육기억으로 누르는 키가 전부
무반응이다.

- File 메뉴: New ⌘N / Open ⌘O / Open Recent ▸ / Save ⌘S / Save As ⌘⇧S / Close ⌘W
- 메뉴 이벤트 → 웹뷰로 emit → 기존 핸들러 재사용
- **종료 가드**: 스파이크 결과대로. dirty일 때 3버튼 — `저장` / `저장 안 함` / `취소`.
  2버튼("교체/취소")은 지금 앱 전반의 문제이고, 여기서 표준을 잡는다.
- 창 제목 = 문서 이름, dirty면 표시. (macOS `isDocumentEdited` 점은 Tauri가 직접
  노출하지 않으므로 제목에 표시하는 선에서 끝낼 것 — objc 의존성을 들이지 말 것.)

**함정: 네이티브 메뉴에는 React i18n이 닿지 않는다.** 메뉴는 Rust에서 만들어지는데
`src/i18n/`은 웹뷰 안에 있다. 웹뷰가 마운트되면서 현재 로케일의 라벨을 넘겨 메뉴를
구성하고, 언어 토글 시 다시 구성한다. Rust에 한국어 문자열을 하드코딩하지 말 것 —
사전이 두 곳으로 갈라진다.

> 리포 규칙: 새로 추가하는 웹뷰 쪽 문자열은 **전부** `src/i18n/en.ts`에 항목이 있어야
> 한다. 없으면 `src/i18n/en.test.ts`가 실패한다. Phase 1b·1c는 문자열이 많다.

### 완료 기준

- [ ] ⌘N/⌘O/⌘S/⌘⇧S/⌘W가 전부 동작하고 메뉴에도 보인다
- [ ] dirty 상태로 ⌘Q → 3버튼, `취소`가 실제로 종료를 막는다
- [ ] `저장`을 고르면 저장이 **끝난 뒤** 종료된다 (경합 없음)
- [ ] 웹뷰가 응답하지 않아도 3초 후 종료된다 (앱이 갇히지 않는다)
- [ ] 언어를 바꾸면 메뉴 라벨도 따라 바뀐다

---

## Phase 1c — Recents와 전환

전제 2(2~4개)이므로 **Recents가 곧 전환 UI다.** 별도의 대형 브라우저를 만들지 말 것.

`<config>/recents.json`:

```jsonc
[{ "path": "/Users/…/Memento.studio.zip", "name": "Memento",
   "lastOpened": "2026-08-31T…", "slideCount": 5,
   "preview": "<base64 PNG, 1번 슬라이드, 폭 320px>" }]
```

- 저장·열기 성공 시 갱신. 상한 10개.
- **preview를 여기 캐시하는 이유**: 닫힌 프로젝트의 썸네일을 그리려면 파일을 unzip해야
  하는데, 목록을 그릴 때마다 최근 항목 전부를 푸는 건 못 쓴다. 저장할 때 한 장만
  만들어 넣는다 (`useSlideThumbnails` / `renderSlide` 재사용).
- 파일이 사라진 항목은 회색 + "찾을 수 없음", 목록에서 제거 제안. 크래시 금지.
- ⌘O 피커: 어디서든(스텝 2·3·4 포함) 열린다. 지금은 1단계로 가야만 다른 프로젝트에
  닿을 수 있고, 그 단계 이름이 "설정"이라 거기 파일이 있다는 걸 알 방법이 없다.
- 전환 시 dirty면 1b의 3버튼을 그대로 태운다. 목표는 **A → B가 ⌘O + 클릭 1번.**

### 완료 기준

- [ ] **A → B 전환이 ⌘O + 클릭 1번** (현재 7번)
- [ ] 스텝 2·3·4 어디서든 ⌘O가 열린다
- [ ] dirty 상태에서 전환하면 3버튼이 뜨고, `저장`이 실제로 저장한 뒤 전환한다
- [ ] 파일을 Finder에서 지운 뒤 Recents를 열어도 앱이 죽지 않는다
- [ ] 목록을 그릴 때 `.studio.zip`을 하나도 열지 않는다 (preview 캐시가 도는지 확인)

### 1단계 정리 (같이 해야 함)

`ProjectSetup`은 지금 세 가지를 겸한다 — 새 프로젝트 마법사 / 파일 브라우저 / 프로젝트
설정. 파일 브라우저 역할이 ⌘O 피커로 빠지면 1단계는 순수 "새 프로젝트"가 된다.
(같은 겸업이 이미 "새 프로젝트가 옛 프로젝트 이름을 뒤집어쓰던" 버그를 만들었다 —
커밋 `6dc8b5a`.)

---

## Phase 2 — 라이브러리 은퇴, 자동 백업으로 교체

**1a~1c가 실사용으로 검증된 다음에.** 사용자 데이터를 건드리는 유일한 단계다.

- 저장이 성공할 때마다 직전 버전을 `<config>/backups/<projectId>/<ts>.studio.zip`으로
  회전 보관(최근 10개). 사람이 "저장"을 안 눌러도 되고, stale 스냅샷 혼란도 사라진다.
- 마이그레이션: 첫 실행에 `useLibraryStore`의 각 항목을 기본 폴더로 1회 내보내고
  Recents에 넣는다. **이미지 포함 여부를 반드시 확인할 것** — 라이브러리 스냅샷은
  `imageKey`만 들고 있고 블롭은 IndexedDB에 있다.
- 마이그레이션이 성공한 뒤에만 라이브러리 UI 제거. 스토어 자체는 한 버전 더 남겨둔다.

### 완료 기준

- [ ] 저장 10번 뒤 백업이 10개이고 11번째에 가장 오래된 것이 밀려난다
- [ ] 백업에서 되살린 프로젝트에 **이미지가 들어 있다**
- [ ] 라이브러리 항목이 이미지까지 포함해 파일로 나가고 Recents에 나타난다
- [ ] 마이그레이션을 두 번 돌려도 중복이 생기지 않는다

---

## 검증

Phase 0이 믿을 만했던 건 테스트 때문이다. 후반부에도 같은 밀도를 유지한다.

| 층 | 무엇 | 어디 |
|---|---|---|
| Rust 유닛 | 임의 경로 원자적 저장, 실패 시 원본 보존, 종료 가드 상태 기계 | `src-tauri/src/save.rs` |
| TS 순수 유닛 | dirty 해시, 저장 경로 도출·충돌 회피, Recents 추가/중복제거/유실 항목 | `src/lib/*.test.ts` |
| 라운드트립 | 저장 → 재오픈 → 프로젝트 의미 동일 + 참조 이미지 전부 존재 | `npm run test:headless` 옆 |
| 데스크톱 e2e | 아래 | |

**데스크톱 e2e는 에이전트 브리지를 쓴다.** tauri-driver를 새로 들이지 말 것 —
`src-tauri/src/bridge.rs`가 이미 유닉스 소켓으로 살아 있는 앱을 조종하고, MCP `live_*`
툴이 그 위에 있다. 브리지에 `save` / `open` / `docStatus`(경로 + dirty) 메서드를 추가하면
**실행 중인 실제 앱을 스크립트로 몰 수 있다.** Phase 0의 복구 버그도 실기를 몰아서 잡았다.

수동으로만 확인 가능한 것 (체크리스트로 남길 것):
- 저장 다이얼로그의 확장자·덮어쓰기 동작
- ⌘Q로 dirty 종료 시 3버튼
- **Phase 0 잔여**: 스크린샷을 하나 넣고 `<config>/autosave-images/`가 채워지는지.
  로직은 유닛 테스트로 덮여 있지만 IPC 이음새는 실기로 확인된 적이 없다.

---

## 하지 말 것

- **다중 창·다중 문서** — 전제 4. 브리지가 "어느 창인가"를 밝혀야 해서 난이도가 급등한다.
- **문서 타입/UTI 등록** — 사용자가 `.studio.zip` 유지를 택했다. 더블클릭 오픈은 범위 밖.
- **`.studio.zip` 포맷 변경** — CLI·MCP·headless가 전부 이 포맷을 쓴다. 봉투를 바꾸면
  `scripts/`와 `packages/mcp/`가 따라와야 한다.
- **렌더/내보내기 파이프라인 건드리기** — 무관하고, 회귀 비용이 크다.
- **fs 플러그인 도입** — 커스텀 커맨드로 충분하고, 스코프 선언 없이 필요한 경로만
  다루는 현재 방식이 더 좁다.
- **라이브러리 조기 삭제** — Phase 2에서, 마이그레이션이 도는 걸 본 다음에.
