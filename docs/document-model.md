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
