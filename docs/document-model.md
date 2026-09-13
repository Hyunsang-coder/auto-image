# 문서 모델 (데스크톱)

> **구현 완료** (2026-09-01). 이 문서는 동작 중인 규칙의 레퍼런스다 — 과정 기록(스파이크·Phase 체크박스)은 걷어냈다. 결정의 근거는 `docs/adr.md` ADR-009…013, 코드 지도는 `CLAUDE.md`의 *Document model (desktop)* 절.

## 왜

앱에 "내 프로젝트"가 뭔지 합의하지 않은 저장소가 셋 있었다.

| | 정체 | 문제 |
|---|---|---|
| localStorage 활성 슬롯 | 실제 작업본 | 하나뿐. 이름만 있고 파일 정체성이 없음 |
| 라이브러리 (`useLibraryStore`) | 앱 안의 가짜 Finder | 수동 스냅샷이라 첫 편집에 stale. 5MB 캡을 다른 둘과 공유 |
| `.studio.zip` | 진짜 파일 포맷 | 경로 기억이 없어 저장할 때마다 새 다운로드 |

그래서 **프로젝트 = 파일**로 정했다. 아래 규칙이 그 합의의 전부다.

## 확정된 전제 (재론 금지)

1. **웹 빌드는 더 이상 쓰지 않는다.** 데스크톱(Tauri) 기준으로 설계한다. 웹에서 깨지지만 않으면 된다 — 새 기능은 `isTauri()` 뒤에 둔다.
2. **동시에 굴리는 프로젝트 2~4개.** Recents가 곧 전환 UI다. 검색·정렬·대규모 그리드는 불필요.
3. **앱이 기본 폴더를 잡되 사용자가 옮길 수 있다.** 기본 `~/Documents/Screenshot Studio/`, `Save As`로 임의 위치 이동 가능.
4. **단일 창으로 충분하다.** 다중 문서/다중 창 없음 → 에이전트 브리지는 "열려 있는 하나의 프로젝트"를 계속 가리키면 된다.
5. **파일 이름이 곧 문서 이름이다.** 헤더와 창 제목은 `docPath`의 basename을 보여주고, 이름을 바꾸는 유일한 방법은 `Save As`다. 앱은 사용자가 놓아둔 파일을 절대 스스로 옮기거나 rename하지 않는다. `project.name`은 남지만 **표시 이름이 아니다** (내보내기 폴더명 등 기존 용도만). `Save As` 성공 시 `project.name`을 새 basename으로 맞춰 둘이 갈라지지 않게 한다.

## 안전망 (파일 쓰기 아래에 깔린 것)

- **원자적 쓰기** — `src-tauri/src/save.rs` `write_atomic()`: 형제 임시 파일 → `sync_all` → `rename` → 부모 디렉터리 fsync. 새 파일 쓰기를 만들지 말고 이걸 쓸 것 (PNG 내보내기도 이 경로).
- **크래시 복구 미러** — `src/lib/autosave.ts` + `save.rs`의 `autosave_*` 커맨드. 프로젝트 JSON을 `<config>/autosave.json`에, 참조 이미지를 `<config>/autosave-images/`에 집합 차분으로 동기화. 미러가 앞서면 **복구를 제안** (절대 조용히 적용하지 않음).
- **저장 실패·불완전 저장 노출** — `exportProjectBundle`이 `{ blob, missingImageKeys }`를 반환. 이미지 누락을 삼키지 않는다.
- **시작 시 스윕 게이트** — 고아 이미지 스윕은 복구 결정이 끝나기 전에 돌지 않는다.

## 미러와 문서 파일의 관계 (반드시 먼저 읽을 것)

| | 무엇을 들고 있나 | 언제 쓰나 |
|---|---|---|
| 문서 파일 (`docPath`) | 사용자가 마지막으로 `저장`한 상태 | ⌘S / ⌘⇧S / 새 프로젝트 생성 시 |
| 미러 (`<config>/autosave*`) | **마지막 저장 이후의 편집분** | 편집마다 (디바운스 1.5s) |

- 미러 스냅샷에 **`docPath`를 함께 기록한다.** 이게 없으면 "어느 문서의 미저장 편집인지"를 판단할 수 없다.
- **열기·저장이 성공하면 미러를 즉시 그 상태로 다시 쓴다.**
- 실행 시: `mirror.docPath === 기억된 docPath`이고 미러가 앞섬 → **"저장하지 않은 편집이 있습니다"** 제안 후 수락 시 dirty 상태로 연다(`savedHash`는 파일 것 그대로 — 복구된 편집은 아직 파일에 없으므로). 그 외는 조용히 진행.
- **미러를 문서 저장으로 대체하지 말 것.**

## 열기·저장 흐름

`loadProject`는 경로를 모른다. 문서 수준 동작은 그 위에 얹는다 (`src/lib/documentIO.ts`).

```
openDocument(path):
  if dirty: 3버튼 프롬프트 (저장 / 저장 안 함 / 취소) — 취소면 중단
  project = importProjectBundle(blob)   // 블롭 복원 + migrateProject 포함
  loadProject(project)
  docPath = path; savedHash = hash(project); recents.push(path, preview)
  미러를 이 상태로 다시 씀

saveDocument():                          // ⌘S
  if !docPath: saveDocumentAs()
  { blob, missingImageKeys } = exportProjectBundle(project)
  if 스키마가 올라간 첫 저장: 원본을 <name>.studio.zip.bak 으로 1회 보존
  save_document(docPath, base64(blob))   // write_atomic
  savedHash = hash(project)
  if missingImageKeys.length: 경고 모달
  recents 갱신 + 미러 다시 씀
  // 저장 성공을 확인하기 전에 어떤 이미지도 GC하지 않는다
```

- **dirty는 플래그가 아니라 해시 비교** (`hashProject(project) !== savedHash`, FNV-1a, `updatedAt` 제외 — 근거 ADR-009).
- **마이그레이션된 파일은 clean으로 연다.** `.bak`은 사용자의 **첫 실제 저장** 때 만든다 (열자마자 ⌘S 반사를 막기 위해).
- 새 프로젝트는 즉시 파일이 된다 (`~/Documents/Screenshot Studio/`, 충돌 시 ` 2`, ` 3` …). "저장 안 한 문서" 상태는 없다.

## 에이전트 브리지

에이전트 패치는 **사용자 편집과 동일하게 dirty를 만들고, 자동 저장하지 않는다.** `live_save`가 ⌘S, `live_open`이 문서 열기다. 상세는 `CLAUDE.md`의 브리지 절과 ADR-002…007.

## 검증 위치

| 층 | 어디 |
|---|---|
| Rust 유닛 (원자적 저장·`.bak`·회전·종료 가드·인스턴스 잠금) | `cargo test` |
| TS 순수/IO 유닛 (해시·경로·Recents·3버튼 게이트) | `src/lib/documentModel.test.ts` · `documentIO.test.ts` |
| 저장 왕복 (의미 동일 + 이미지 전부) | `src/lib/projectBundle.test.ts` |
| 데스크톱 e2e (살아 있는 앱을 브리지로) | `npm run test:doc` (`scripts/document-e2e.mjs`) |

### 사람이 확인할 것 (자동화 불가)

- [ ] `⇧⌘S` 저장 패널이 `.studio.zip`을 어떻게 보여주는지, 그리고 확장자를 빼고 입력했을 때 앱이 띄우는 덮어쓰기 확인이 실제로 뜨는지
- [ ] dirty 상태에서 **⌘Q**(그리고 창의 빨간 버튼) → 3버튼이 뜨고 `취소`가 종료를 막는지. AppleEvent quit은 이 경로를 타지 않으므로 스크립트로는 확인 불가다
- [ ] File 메뉴에 ⌘N/⌘O/⌘S/⇧⌘S/⌘W가 보이고, 언어를 토글하면 라벨이 바뀌는지
- [ ] 창 제목이 파일 이름이고 dirty면 앞에 `•`가 붙는지
- [ ] 두 번째 인스턴스를 띄웠을 때 경고창 문구(현재 `osascript` 경고라 "osascript" 이름으로 뜬다 — ADR-011)

## 하지 말 것

- **다중 창·다중 문서** — 전제 4. 브리지가 "어느 창인가"를 밝혀야 해서 난이도가 급등한다.
- **문서 타입/UTI 등록** — 사용자가 `.studio.zip` 유지를 택했다. 더블클릭 오픈은 범위 밖.
- **`.studio.zip` 포맷 변경** — CLI·MCP·headless가 전부 이 포맷을 쓴다. 봉투를 바꾸면 `scripts/`와 `packages/mcp/`가 따라와야 한다.
- **렌더/내보내기 파이프라인 건드리기** — 무관하고, 회귀 비용이 크다.
- **fs 플러그인 도입** — 커스텀 커맨드로 충분하고, 현재 방식이 더 좁다.
- **라이브러리 부활** — 데스크톱에서 은퇴했고 웹에서만 유지된다 (ADR-013). 스토어 자체도 언젠가 제거 대상.
