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
| `get_design_reference` | 테마 프리셋(id+실제 그라디언트), 레이아웃, 장식 shape 18종, 로케일, 디바이스 모델·해상도, 슬라이드당 한도 — 문서에 없는 프리셋 id 목록의 유일한 소스 |

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

스모크(`scripts/mcp-smoke.mjs`)는 지식 도구와 도구 등록만 검증한다 — 렌더
경로의 회귀는 기존 `npm run test:headless`가 막는다.
