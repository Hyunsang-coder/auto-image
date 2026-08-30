# MCP 서버 — AI 에이전트용 스크린샷 파이프라인

`scripts/mcp-server.mjs`는 헤들리스 파이프라인 전체를 [MCP(Model Context
Protocol)](https://modelcontextprotocol.io) stdio 서버로 노출한다. AI 에이전트가
사람 손 없이 앱스토어 스크린샷 프로젝트를 **작성 → 검증 → 렌더 → 점검 → 수술적
수정 → 재렌더**까지 도구 호출만으로 통제하는 것이 목적이다.

```bash
npm run mcp        # stdio 서버 (직접 띄울 일은 거의 없음 — 클라이언트가 spawn)
npm run test:mcp   # 스모크: 도구 등록 + 지식 도구 응답 검증 (브라우저 불필요)
```

Claude Code는 리포 루트의 `.mcp.json`으로 자동 등록된다(서버 이름
`screenshot-studio`). 다른 MCP 클라이언트는 `npx tsx scripts/mcp-server.mjs`를
cwd=리포 루트로 spawn하면 된다. 서버는 `tsx`로 실행된다 — 디자인 레퍼런스
도구가 TS 상수 그래프(`THEME_PRESETS`, `DEVICE_SPECS`, …)를 데이터 중복 없이
직접 import하기 위해서다.

## 도구 목록

지식 도구 (즉시 응답, 브라우저 불필요):

| 도구 | 반환 |
|---|---|
| `get_import_spec` | `docs/project-import.md` 전문 — manifest 스키마·파일명 규칙·캡션 형식·layout report |
| `get_patch_spec` | `patch_bundle` op 어휘(setText / setScreenshot / external image ops / `set` whitelist) |
| `get_design_reference` | 테마 프리셋(id+실제 그라디언트), 폰트 패밀리(`texts[i].fontFamily`용), 레이아웃, 장식 shape 18종, 루페(하이라이트) 필드, 로케일, 디바이스 모델·해상도, 슬라이드당 한도 — 문서에 없는 프리셋 id·폰트 목록의 유일한 소스 |

파이프라인 도구 (기존 CLI를 spawn — 렌더 계열은 dev 서버 + Playwright를 쓰므로 느림):

| 도구 | 감싸는 CLI | 비고 |
|---|---|---|
| `validate_import` | `headless:export --validate` | import 폴더 dry-run → `{ok, applied, addedLocales, issues}` (기본은 `project` 생략, `includeProject`로 포함) |
| `render` | `headless:export [--report] [--slides] [--locale]` | 폴더/번들 → PNG + layout summary/issues. `report` 기본 true |
| `create_bundle` | `headless:export --bundle` | import 폴더 → 무손실 `.studio.zip` |
| `inspect_bundle` | `project:inspect` | 번들 → 슬라이드/텍스트/번역/이미지 JSON. 브라우저 불필요 |
| `patch_bundle` | `project:patch` | ops를 **인라인 배열**로 받아 임시 patch.json 작성. 상대 `file` 경로는 `filesDir`(기본: 번들 디렉터리) 기준으로 절대화. `outPath` 생략 시 in-place |
| `export_manifest` | `headless:export --export-manifest` | 역방향(lossy) — manifest/captions/image-plan 내용을 응답에 포함 |
| `fix_layout` | `layout:fix` | layout-summary 기반 manifest 자동 수정 (기본 dry-run) |
| `layout_loop` | `layout:loop` | 렌더→수정→재렌더 수렴 루프 |

라이브 도구 (실행 중인 **macOS 앱**의 열려 있는 프로젝트를 직접 조작 — 파일 왕복 없음):

| 도구 | 역할 |
|---|---|
| `live_status` | 앱이 떠 있는지 + 지금 무엇이 열려 있는지(step, 프로젝트명, 슬라이드 수, 로케일). **다른 `live_*` 전에 먼저 호출**하고, 실패하면 파일 도구로 폴백 |
| `live_focus` | 4-step 화면(1 프로젝트 · 2 에디터 · 3 로컬라이즈 · 4 export) 전환 + 활성 슬라이드 선택. 프로젝트 데이터는 건드리지 않는다 — `live_patch` 전에 에디터로 가거나, 방금 고친 슬라이드를 사용자 앞에 띄울 때 |
| `live_new_project` | 앱에 빈 프로젝트 생성 후 에디터로 이동. 이미 열린 프로젝트가 있으면 `replace: true` 없이는 거부 |
| `live_inspect` | 열린 프로젝트를 `inspect_bundle`과 **같은 형태**로 반환(공용 `scripts/lib/inspect.mjs`) + `screenshot.canvasRect` — 스크린샷이 합성 캔버스에서 차지하는 박스(캔버스 비율). 하이라이트 `sourceRegion`이 캔버스가 아니라 이 박스 기준이라, 없으면 에이전트가 렌더만 보고 좌표를 추측해야 한다. 레이아웃 계산이 TS 그래프에 있어 MCP 프로세스가 못 부르므로 **앱이 계산해서 넘긴다**(번들 경로에는 없음) |
| `live_list_untranslated` | 로컬라이즈 워크리스트 — 아직 번역이 빠진 문자열 × 로케일을 원문과 `setText` 주소(`text:N` / `badge:N`)로 반환. 번역해서 `live_patch`의 `setText`로 되쓰면 끝 (없는 로케일은 자동 추가). CSV 내보내기 → 외부 번역 → 다시 가져오기 왕복을 대체한다 |
| `live_patch` | `patch_bundle`과 **같은 op 어휘**를 라이브 프로젝트에 적용. 캔버스가 즉시 다시 그려지고 사용자가 보던 슬라이드는 유지된다. 이미지 파일을 새로 들여오는 op(`file`)는 미지원 → `patch_bundle` 사용 |
| `live_view` | 라이브 슬라이드를 export와 동일한 해상도로 렌더해 인라인 이미지로 반환(전송 시에만 축소) |

앱은 `npm run tauri:dev` 또는 빌드된 `.app`으로 띄운다. 전송은
`~/Library/Application Support/com.hyunsang.screenshotstudio/agent-bridge.sock`
위의 개행 구분 JSON이다(0600). 설계 근거는 [docs/adr.md](./adr.md).

시각 피드백 + 에셋 도구 (에이전트가 디자인을 **보면서** 고치게 한다):

| 도구 | 역할 |
|---|---|
| `view_output` | PNG(렌더 슬라이드·아이콘·원본 스크린샷)를 인라인 이미지로 반환. macOS `sips`로 다운스케일(없으면 2MB 이하 원본 폴백). 디자인 변경 전후로 반드시 볼 것 |
| `search_icons` | Lucide(ISC, ~2,000종) 아이콘 이름 검색 |
| `make_icon` | Lucide 아이콘 → 투명 PNG 래스터라이즈(Playwright chromium). `background` 지정 시 앱아이콘 스타일 라운드 타일. 산출 PNG는 `addExternalImage` 패치나 manifest `externalImages`로 슬라이드에 올린다 |

## 동작 특성

- **진행 알림**: 렌더 계열 도구는 자식 프로세스의 stdout/stderr 라인을 MCP
  progress notification으로 스트리밍한다. 클라이언트가 progress에 타임아웃을
  리셋하는 경우(Claude Code 등) 수 분짜리 렌더도 안전하다.
- **경로**: 인자의 상대 경로는 리포 루트 기준으로 해석된다. 절대 경로 권장.
- **dev 서버**: 렌더 계열은 5173에 떠 있는 dev 서버를 재사용하고, 없으면
  스스로 띄웠다 정리한다(하니스의 기존 동작). 연속 호출이 많은 세션은 dev
  서버를 미리 띄워두면 호출당 기동 비용이 사라진다.
- **에러 규약**: 감싼 CLI가 non-zero로 끝나면 `isError: true` + 로그 tail을
  반환한다. patch의 거부/보정은 에러가 아니라 `issues[]`로 보고된다.

## 전형적인 에이전트 루프

```text
get_import_spec + get_design_reference          # 어휘 학습
→ (에이전트가 manifest/캡션/스크린샷 폴더 작성)
→ validate_import                               # 빠른 구조 검증
→ create_bundle                                 # 무손실 기판 확보
→ render (slides/locales 필터로 부분 렌더)       # 눈으로 확인할 PNG + layout issues
→ view_output                                   # 렌더를 눈으로 확인
→ search_icons → make_icon → patch_bundle       # 아이콘/에셋 합성
→ inspect_bundle → patch_bundle → render → view_output …  # 수렴할 때까지
→ render (전체) 또는 layout_loop                # 최종 산출
```

로컬라이즈는 별도 루프다 — 파일 왕복이 없다:

```text
live_status → live_list_untranslated            # 남은 문자열 × 로케일 + setText 주소
→ (에이전트가 직접 번역)
→ live_patch (setText ops, 문자열×로케일당 1개)  # 사용자가 보는 창에 즉시 반영
→ live_focus { step: 3 }                        # 채워진 표를 사용자 앞에 띄운다
```

스모크(`scripts/mcp-smoke.mjs`)는 지식 도구와 도구 등록만 검증한다 — 렌더
경로의 회귀는 기존 `npm run test:headless`가 막는다.

## npm 발행 (`screenshot-studio-mcp`)

앱과 **따로** 버전이 매겨진다. 체크아웃 없이 `.app`만 받은 사람이 쓰는 절반이라,
앱이 새 어휘를 실으면 이 패키지도 올려야 한다 — 안 올리면 `npx`로 붙은
에이전트만 구 버전 어휘를 보게 된다. 릴리즈 노트를 쓰기 전에 확인한다:

```bash
npm view screenshot-studio-mcp version   # 레지스트리
node -p "require('./packages/mcp/package.json').version"
```

`prepack`이 `npm run mcp:package`를 돌려 `packages/mcp/data/`(design reference +
import spec)를 다시 굽기 때문에, 발행 전에 따로 빌드할 필요는 없다. 무엇이
나가는지는 `npm publish --dry-run`으로 먼저 본다.

계정 2FA가 `auth-and-writes`라 **쓰기마다** 챌린지가 걸린다. `auth-type`이 `web`이면
브라우저로 답할 수 있지만, 그 흐름을 시작하려면 TTY가 필요하다 — TTY 없는
셸에서는 브라우저를 못 띄우고 곧장 `EOTP`로 떨어진다. 의사 TTY를 붙이면 된다:

```bash
cd packages/mcp && script -q /dev/null npm publish --auth-type=web
```

출력에 뜨는 `https://www.npmjs.com/auth/cli/...`를 브라우저에서 승인하면 발행이
끝난다. (`--otp=`로 코드를 넘기는 길도 있지만, 웹 승인이 코드를 주고받지 않아
낫다.)

발행 직후 `npm view`는 캐시된 packument를 내주며 한동안 옛 버전을 보고한다.
성공 여부는 레지스트리에 직접 묻는다:

```bash
curl -s https://registry.npmjs.org/screenshot-studio-mcp | jq '.["dist-tags"]'
npx -y --prefer-online screenshot-studio-mcp   # 실사용 경로까지 확인
```
