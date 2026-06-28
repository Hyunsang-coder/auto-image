/**
 * English UI dictionary. Keys are the Korean source strings as they appear in
 * code (after joining multi-line JSX text with single spaces); `{name}` tokens
 * are interpolation slots filled by `t()`.
 */
export const en: Record<string, string> = {
  // App.tsx
  '제목 없음': 'Untitled',
  '{name} 템플릿': '{name} Template',
  '스크린샷 없는 슬라이드 {n}개': '{n} slide(s) missing a screenshot',
  '번역 미완료 로케일 {n}개': '{n} locale(s) not fully translated',
  '{name} · {n}장': '{name} · {n} slides',
  '저장됨 ✓': 'Saved ✓',
  저장: 'Save',
  '템플릿 저장됨 ✓': 'Template saved ✓',
  '템플릿으로 저장': 'Save as Template',
  '프로젝트 파일 저장': 'Save Project File',
  초기화: 'Reset',
  '저장 공간이 가득 차 최근 변경 사항이 저장되지 않았을 수 있습니다. 슬라이드 수나 하이라이트를 줄이거나, 내보낸 뒤 프로젝트를 초기화하세요.':
    'Storage is full — your latest changes may not have been saved. Reduce the number of slides or highlights, or export and reset the project.',
  닫기: 'Close',
  '프로젝트 저장': 'Save Project',
  '이미 저장된 프로젝트입니다. 기존 항목을 이 이름으로 덮어쓰거나, 원본은 그대로 두고 새 프로젝트로 저장할 수 있습니다.':
    'This project is already saved. Overwrite the existing entry with this name, or keep the original and save it as a new project.',
  '현재 작업을 보관합니다.': 'Saves your current work.',
  '프로젝트 이름': 'Project name',
  취소: 'Cancel',
  '새 프로젝트로 저장': 'Save as New Project',
  덮어쓰기: 'Overwrite',
  "현재 모든 슬라이드의 디자인(레이아웃·배경·텍스트·기기 배치)을 재사용 가능한 템플릿으로 저장합니다. 스크린샷은 포함되지 않으며, '프로젝트 설정'의 '템플릿으로 시작'에 추가됩니다.":
    'Saves the design of every slide (layout, background, text, device placement) as a reusable template. Screenshots are not included; it appears under "Start from a template" in Project Setup.',
  '템플릿 이름': 'Template name',
  '프로젝트 초기화': 'Reset Project',
  '현재 프로젝트 데이터가 모두 삭제됩니다. 되돌릴 수 없습니다.':
    'All data in the current project will be deleted. This cannot be undone.',

  // PropertiesPanel tabs
  배경: 'Background',
  텍스트: 'Text',
  디바이스: 'Device',
  하이라이트: 'Highlights',
  장식: 'Decorations',
  배지: 'Badges',

  // CaptionPanel
  '여러 슬라이드 일괄 스타일': 'Bulk style — multiple slides',
  폰트: 'Font',
  크기: 'Size',
  '최대 크기': 'Max size',
  굵기: 'Weight',
  '변경 안 함': 'No change',
  '선택 {n}개에 적용': 'Apply to {n} selected',
  '전체 {n}개에 적용': 'Apply to all {n}',
  '제목 (헤드라인)': 'Title (Headline)',
  '텍스트 {n}': 'Text {n}',
  // LocalizeEditor grid field label (non-literal i18nT call — kept manually)
  '배지 {n}': 'Badge {n}',
  '이 텍스트 블록 삭제': 'Delete this text block',
  삭제: 'Delete',
  '텍스트 블록 추가 ({n}/{max})': 'Add text block ({n}/{max})',

  // CaptionField
  '박스 너비에 맞춤': 'Fit to box width',
  '(자동 크기)': '(auto size)',
  '줄 간격': 'Line height',
  '텍스트 색상': 'Text color',
  외곽선: 'Outline',
  '외곽선 색상': 'Outline color',
  그림자: 'Shadow',
  '박스 배경': 'Box background',
  '박스 색상': 'Box color',
  '가로 패딩': 'Horizontal padding',
  '세로 패딩': 'Vertical padding',
  '모서리 둥글기': 'Corner radius',
  테두리: 'Border',
  '테두리 색상': 'Border color',
  '테두리 굵기': 'Border width',
  '박스 그림자': 'Box shadow',
  정렬: 'Alignment',
  왼쪽: 'Left',
  가운데: 'Center',
  오른쪽: 'Right',

  // ShadowControls
  색상: 'Color',
  불투명도: 'Opacity',
  '가로 위치 (X)': 'Horizontal offset (X)',
  '세로 위치 (Y)': 'Vertical offset (Y)',
  흐림: 'Blur',

  // BadgePanel
  추가: 'Add',
  배경색: 'Background color',
  텍스트색: 'Text color',
  '세로 위치': 'Vertical position',
  모서리: 'Corner radius',

  // EditorLayout.tsx
  'App Store 스크린샷 사이즈 — 이 타입의 모든 슬라이드가 이 해상도로 export됩니다. 다른 기기를 고르면 슬라이드가 그 기기로 전환됩니다.':
    'App Store screenshot size — all slides of this type export at this resolution. Changing the device switches those slides to that device.',
  '축소 (Cmd −)': 'Zoom out (Cmd −)',
  '100%로 맞춤 (Cmd 0)': 'Fit to 100% (Cmd 0)',
  '확대 (Cmd +)': 'Zoom in (Cmd +)',
  '편집 언어 — 원본({locale})은 전체 공통 레이아웃이며 여기 입력한 텍스트가 번역 원본이 됩니다. 특정 언어를 고르면 그 언어용 위치/크기/텍스트만 조정합니다. 원본 언어 변경은 3. 로컬라이즈에서.':
    "Edit language — the base ({locale}) defines the shared layout and the source text for translation. Selecting a specific language adjusts only that language's position, size, and text. Change the source language in step 3 Localize.",
  '편집: 원본 ({locale})': 'Edit: Base ({locale})',
  '편집: {locale}': 'Edit: {locale}',
  '이 언어의 레이아웃 override(위치·크기·템플릿·배경·디바이스)를 지웁니다. 번역 텍스트와 스크린샷은 유지됩니다.':
    'Clears layout overrides (position, size, template, background, device) for this language. Translation text and screenshots are kept.',
  '레이아웃 리셋': 'Reset Layout',
  '이 언어는 자체 스크린샷이 없습니다. 어떤 언어의 스크린샷을 빌려올지 선택하세요 (기본: 기준 언어).':
    "This language has no screenshot of its own. Choose which language's screenshot to borrow (default: base language).",
  '스크린샷: 기준 언어': 'Screenshot: Base language',
  '스크린샷: {locale}': 'Screenshot: {locale}',
  '다음 단계: 로컬라이즈': 'Next step: Localize',
  '다음 →': 'Next →',
  '드래그하여 슬라이드 트레이 높이 조절': 'Drag to resize the slide tray',
  '드래그하여 속성 패널 너비 조절': 'Drag to resize the properties panel',
  '슬라이드를 선택하세요': 'Select a slide',

  // SlideList.tsx
  '{n}개 슬라이드': '{n} slides',
  '옆 슬라이드와 한 장으로 묶기': 'Link with adjacent slide into a 2-page span',
  '슬라이드 추가': 'Add slide',
  '최대 {n}장까지 추가할 수 있습니다': 'Maximum {n} slides',
  '슬라이드 복제': 'Duplicate slide',
  '슬라이드 삭제': 'Delete slide',
  '마지막 슬라이드는 삭제할 수 없습니다': 'Cannot delete the last slide',
  '왼쪽 (Leader)': 'Left (Leader)',
  '오른쪽 (Follower)': 'Right (Follower)',
  '그룹 해제 — 두 장으로 분리': 'Unlink — split into two slides',
  해제: 'Unlink',
  '를 삭제합니다.': ' will be deleted.',
  ' 슬라이드를 삭제합니다.': ' slide will be deleted.',
  '이 작업은 되돌릴 수 없습니다.': 'This action cannot be undone.',

  // defaults.ts
  '슬라이드 {n}': 'Slide {n}',
  '새 기능': 'New',

  // projectTemplates.ts
  '{n}장': '{n} slides',

  // projectImport.ts
  '{where}: 알 수 없는 테마 프리셋 "{value}" — 기본 배경 사용':
    '{where}: unknown theme preset "{value}" — using default background',
  '{where}: 배경 형식이 올바르지 않음 — 기본 배경 사용':
    '{where}: invalid background format — using default background',
  '{where}: 그라디언트 stops가 2개 이상 필요 — 기본 배경 사용':
    '{where}: gradient requires at least 2 stops — using default background',
  '{where}: image 배경은 manifest에서 지원하지 않음 — 기본 배경 사용':
    '{where}: image backgrounds are not supported in manifests — using default background',
  '매니페스트 JSON을 파싱할 수 없습니다': 'Cannot parse manifest JSON',
  '매니페스트는 JSON 객체여야 합니다': 'Manifest must be a JSON object',
  '지원하지 않는 매니페스트 버전: {ver} (version: 1 만 지원)':
    'Unsupported manifest version: {ver} (only version: 1 is supported)',
  '프로젝트 이름(name)이 필요합니다': 'Project name (name) is required',
  '슬라이드(slides)가 최소 1장 필요합니다': 'At least one slide (slides) is required',
  '슬라이드는 최대 {max}장 — {n}장 중 처음 {max}장만 사용':
    'Maximum {max} slides — using first {max} of {n}',
  '알 수 없는 device "{device}" — iphone 사용':
    'Unknown device "{device}" — using iphone',
  '"{model}"는 {device}의 모델이 아님 — {fallback} 사용':
    '"{model}" is not a valid {device} model — using {fallback}',
  '지원하지 않는 sourceLocale "{locale}" — {fallback} 사용':
    'Unsupported sourceLocale "{locale}" — using {fallback}',
  'targetLocales는 배열이어야 함 — 무시': 'targetLocales must be an array — ignored',
  '지원하지 않는 targetLocale "{code}" — 제외':
    'Unsupported targetLocale "{code}" — excluded',
  '{where}: 슬라이드 항목이 객체가 아님 — 기본값 사용':
    '{where}: slide entry is not an object — using defaults',
  '{where}: 알 수 없는 layout "{layout}" — text-top 사용':
    '{where}: unknown layout "{layout}" — using text-top',
  '{where}: textBlocks는 1~{max} — 1 사용':
    '{where}: textBlocks must be 1–{max} — using 1',
  '{where}: {field} 값이 숫자가 아님 — 무시':
    '{where}: {field} is not a number — ignored',
  '{where}: {field} {value}는 {min}~{max} 범위 밖 — 경계값으로 보정':
    '{where}: {field} {value} is outside {min}–{max} — clamped to the bound',
  '{where}: deviceFrame 형식이 올바르지 않음 — 기본값 사용':
    '{where}: invalid deviceFrame format — using defaults',
  '{where}: deviceFrame.color는 black|silver — 무시':
    '{where}: deviceFrame.color must be black|silver — ignored',
  '{where}: screenshotStyle 형식이 올바르지 않음 — 무시':
    '{where}: invalid screenshotStyle format — ignored',
  '{where}: screenshotStyle.shadow는 boolean — 무시':
    '{where}: screenshotStyle.shadow must be a boolean — ignored',
  '{where}: screenshotStyle.crop 형식이 올바르지 않음 — 무시':
    '{where}: invalid screenshotStyle.crop format — ignored',
  '{where}: ornaments는 배열이어야 함 — 무시':
    '{where}: ornaments must be an array — ignored',
  '{where}: ornaments는 최대 {max}개 — 처음 {max}개만 사용':
    '{where}: maximum {max} ornaments — using first {max}',
  '{where}: 항목이 객체가 아님 — 제외':
    '{where}: entry is not an object — excluded',
  '{where}: 알 수 없는 shape "{shape}" — 제외':
    '{where}: unknown shape "{shape}" — excluded',
  '{where}: color는 문자열 — 무시':
    '{where}: color must be a string — ignored',
  '{where}: externalImages는 배열이어야 함 — 무시':
    '{where}: externalImages must be an array — ignored',
  '{where}: externalImages는 최대 {max}개 — 처음 {max}개만 사용':
    '{where}: maximum {max} external images — using first {max}',
  '{where}: file 문자열이 필요함 — 제외':
    '{where}: file string is required — excluded',
  '{where}: badges는 배열이어야 함 — 무시':
    '{where}: badges must be an array — ignored',
  '{where}: badges는 최대 {max}개 — 처음 {max}개만 사용':
    '{where}: maximum {max} badges — using first {max}',
  '{where}: text는 문자열 — 무시':
    '{where}: text must be a string — ignored',
  '{where}: badge.style 형식이 올바르지 않음 — 무시':
    '{where}: invalid badge.style format — ignored',
  '{where}: badge.style.backgroundColor는 문자열 — 무시':
    '{where}: badge.style.backgroundColor must be a string — ignored',
  '{where}: badge.style.textColor는 문자열 — 무시':
    '{where}: badge.style.textColor must be a string — ignored',
  '{where}: span은 {group, role} 객체여야 함 — 무시':
    '{where}: span must be a {group, role} object — ignored',
  '{where}: span.group이 필요 — span 무시':
    '{where}: span.group is required — span ignored',
  '{where}: span.role은 leader|follower — span 무시':
    '{where}: span.role must be leader|follower — span ignored',
  'span "{group}"은 인접한 leader/follower 한 쌍이어야 함 — span 무시':
    'span "{group}" must be one adjacent leader/follower pair — span ignored',
  '{where}: texts는 배열이어야 함 — 무시':
    '{where}: texts must be an array — ignored',
  '{where}: texts는 최대 {max}개 — 처음 {max}개만 사용':
    '{where}: maximum {max} text blocks — using first {max}',
  '{where}: 항목이 객체가 아님 — 무시':
    '{where}: entry is not an object — ignored',
  '{where}: align은 left|center|right — 무시':
    '{where}: align must be left|center|right — ignored',
  '{where}: fitToBox는 boolean — 무시':
    '{where}: fitToBox must be a boolean — ignored',
  '{where}: pos는 x,y(0~1) 둘 다 필요 — 무시':
    '{where}: pos needs both x and y (0–1) — ignored',
  '{where}: pos 형식이 올바르지 않음 — 무시':
    '{where}: invalid pos format — ignored',
  '{where}: box 형식이 올바르지 않음 — 무시':
    '{where}: invalid box format — ignored',
  '{where}: box.fill(문자열)이 필요 — box 무시':
    '{where}: box.fill (string) is required — box ignored',
  '{where}: outline 형식이 올바르지 않음 — 무시':
    '{where}: invalid outline format — ignored',
  '{where}: outline.color(문자열)이 필요 — outline 무시':
    '{where}: outline.color (string) is required — outline ignored',
  '{where}: shadow 형식이 올바르지 않음 — 무시':
    '{where}: invalid shadow format — ignored',
  '{where}: shadow.color(문자열)이 필요 — shadow 무시':
    '{where}: shadow.color (string) is required — shadow ignored',
  '{where}: highlights는 배열이어야 함 — 무시':
    '{where}: highlights must be an array — ignored',
  '{where}: highlights는 최대 {max}개 — 처음 {max}개만 사용':
    '{where}: maximum {max} highlights — using first {max}',
  '{where}: sourceRegion 형식이 올바르지 않음 — 기본값 사용':
    '{where}: invalid sourceRegion format — using defaults',
  '{where}: popup 형식이 올바르지 않음 — 기본값 사용':
    '{where}: invalid popup format — using defaults',

  // projectImportRun.ts
  '무시된 파일: {name}': 'Ignored file: {name}',
  'JSON을 파싱할 수 없음: {name}': 'Cannot parse JSON: {name}',
  '매니페스트가 여러 개 — 첫 파일만 사용 (무시: {name})':
    'Multiple manifests found — using first file (ignored: {name})',
  '캡션 JSON이 여러 개 — 첫 파일만 사용 (무시: {name})':
    'Multiple caption JSON files — using first file (ignored: {name})',
  '매니페스트도 캡션 양식도 아닌 JSON: {name}':
    'JSON is neither a manifest nor a caption template: {name}',
  '매니페스트(version + slides 배열을 가진 JSON)를 찾을 수 없습니다':
    'No manifest found (JSON with version + slides array)',
  '슬라이드 {n}: 외부 이미지 파일을 찾을 수 없음: {name}':
    'Slide {n}: external image file not found: {name}',
  '슬라이드 {n}: 외부 이미지를 읽을 수 없음: {name}':
    'Slide {n}: could not read external image: {name}',
  '캡션 CSV가 여러 개 — 첫 파일만 사용 (무시: {name})':
    'Multiple caption CSV files — using first file (ignored: {name})',
  '캡션 CSV와 JSON이 함께 있음 — CSV 사용':
    'Both caption CSV and JSON provided — using CSV',

  // imageImport.ts
  '이미지 파일명 규칙 (벌크 업로드)': 'Image filename convention (bulk upload)',
  '• 형식: {슬라이드번호}[-설명].{언어}.png — 모든 파일에 언어 접미사 필요':
    '• Format: {슬라이드번호}[-desc].{언어}.png — every file must include a locale suffix',
  '• 기준 언어({label}, {code})로 들어온 파일 = 슬라이드 베이스, 나머지 = 언어별 추가본':
    '• Files with source language ({label}, {code}) become the slide base; others become per-locale overrides',
  '• 슬라이드 1 예시: {examples}': '• Slide 1 examples: {examples}',
  '(베이스)': ' (base)',
  '• 설명 접미사 허용: 01-home.{src}.png, 02-add-pdf.{tgt}.png':
    '• Descriptive suffix allowed: 01-home.{src}.png, 02-add-pdf.{tgt}.png',
  '슬라이드 번호를 읽을 수 없음: "{filename}"':
    'Cannot read slide number: "{filename}"',
  '언어 접미사가 필요함 (예: 01.en.png): "{filename}"':
    'Locale suffix required (e.g. 01.en.png): "{filename}"',
  '지원하지 않는 언어 "{locale}": "{filename}"':
    'Unsupported locale "{locale}": "{filename}"',

  // bulkImageImport.ts
  '슬라이드 {n} {locale} 중복 — "{ignored}" 무시, "{kept}" 사용':
    'Slide {n} {locale} duplicate — ignoring "{ignored}", keeping "{kept}"',
  '기준 언어': 'Source language',
  '슬라이드 {n} 없음: "{name}"': 'Slide {n} not found: "{name}"',
  '슬라이드 {n}는 텍스트 전용(hero)이라 스크린샷 불가':
    'Slide {n} is text-only (hero) — screenshots not supported',
  '슬라이드 {n}: 기준 언어({src}) 스크린샷이 없어 {tgt} 추가본을 붙일 수 없음':
    'Slide {n}: no base screenshot for source language ({src}) — cannot attach {tgt} override',
  '이미지를 읽을 수 없음: "{name}"': 'Cannot read image: "{name}"',

  // localeIO.ts
  'JSON 형식이 올바르지 않습니다': 'Invalid JSON format',
  '`rows` 배열을 찾을 수 없습니다': '`rows` array not found',
  '`field`가 없는 행을 건너뜀': 'Skipping row with no `field`',
  '빈 파일입니다': 'File is empty',
  '`field` 열을 찾을 수 없습니다': '`field` column not found',

  // localePatch.ts
  '지원하지 않는 언어 "{locale}"': 'Unsupported locale "{locale}"',
  '{n}행 건너뜀 (슬라이드 또는 필드 없음)':
    '{n} row(s) skipped (slide or field not found)',

  // useProjectStore.ts
  '다음 슬라이드가 없습니다': 'No next slide',
  '이미 그룹에 속한 슬라이드입니다': 'Slide is already part of a group',
  '디바이스 모델이 달라 묶을 수 없습니다': 'Cannot link slides with different device models',

  // Locale labels (defaults.ts LOCALES, rendered via t(label))
  영어: 'English',
  한국어: 'Korean',
  일본어: 'Japanese',
  독일어: 'German',
  프랑스어: 'French',
  스페인어: 'Spanish',
  이탈리아어: 'Italian',
  '포르투갈어(브라질)': 'Portuguese (Brazil)',
  '스페인어(멕시코)': 'Spanish (Mexico)',
  베트남어: 'Vietnamese',
  인도네시아어: 'Indonesian',
  태국어: 'Thai',

  // ProjectSetup.tsx
  '새 스크린샷 프로젝트': 'New Screenshot Project',
  'App Store 제출용 스크린샷 세트를 만듭니다. 데이터는 이 브라우저에만 저장됩니다.':
    'Create a screenshot set for App Store submission. Data is stored in this browser only.',
  '템플릿으로 시작': 'Start from a Template',
  '여러 슬라이드로 구성된 시작 세트입니다. 고르면 바로 편집 단계로 들어갑니다.':
    'A multi-slide starter set. Picking one takes you straight to the editor.',
  '이 템플릿으로 시작 →': 'Start with This Template →',
  '내 템플릿': 'My Template',
  '시작 →': 'Start →',
  '삭제 확인': 'Confirm Delete',
  '프로젝트 가져오기': 'Import Project',
  'AI 에이전트가 준비한 파일들(manifest.json + 스크린샷 + 캡션 CSV/JSON)을 한 번에 선택하면 export 전 단계까지 채워진 프로젝트로 시작합니다.':
    'Select files prepared by an AI agent (manifest.json + screenshots + caption CSV/JSON) all at once to start a project ready for export.',
  '가져오는 중…': 'Importing…',
  '프로젝트 파일 열기': 'Open Project File',
  '이전에 저장한 프로젝트 파일(.zip)을 열어 이어서 편집합니다. 스크린샷과 모든 편집 내용이 그대로 복원됩니다.':
    'Open a previously saved project file (.zip) to keep editing. Screenshots and all edits are restored as-is.',
  '프로젝트 파일을 열 수 없습니다. 올바른 프로젝트 .zip 파일인지 확인하세요.':
    'Could not open the project file. Make sure it is a valid project .zip.',
  '예: Dogo, Claude, ADHD': 'e.g. Dogo, Claude, ADHD',
  '파일 선택': 'Select Files',
  '앱 이름': 'App Name',
  기기: 'Device',
  '한 종류만 선택합니다. 사이즈는 App Store에 등록 가능한 해상도입니다.':
    'Select one type only. Sizes are resolutions accepted by the App Store.',
  '슬라이드 수': 'Slide Count',
  '1~10장. 나중에 추가할 수도 있습니다.': '1–10 slides. You can add more later.',
  장: 'slides',
  '기본 배경': 'Default Background',
  '모든 슬라이드의 기본 배경으로 사용됩니다.': 'Used as the default background for all slides.',
  '계속하면 기존 프로젝트를 덮어씁니다.': 'Continuing will overwrite the existing project.',
  '저장은 자동으로 이루어집니다.': 'Changes are saved automatically.',
  '새로 만들기 →': 'Create New →',
  '이전에 만들던 프로젝트가 있습니다:': 'You have a project in progress:',
  '마지막 수정': 'Last edited',
  '계속 편집하기 →': 'Continue Editing →',
  '저장된 프로젝트': 'Saved Projects',
  "헤더의 '저장'으로 보관한 프로젝트입니다.": "Projects saved via the 'Save' button in the header.",
  불러오기: 'Load',
  '프로젝트 불러오기': 'Load Project',
  '현재 편집 중인 작업을': 'Replace current work with',
  '(으)로 교체합니다. 저장하지 않은 변경 사항은 사라집니다.': '. Unsaved changes will be lost.',
  '— 슬라이드 {slides}장 · 스크린샷 {screenshots}개 · 캡션 {captions}개 적용':
    '— {slides} slide(s) · {screenshots} screenshot(s) · {captions} caption(s) applied',
  '— 슬라이드 {slides}장 · 스크린샷 {screenshots}개 · 외부 이미지 {externalImages}개 · 캡션 {captions}개 적용':
    '— {slides} slide(s) · {screenshots} screenshot(s) · {externalImages} external image(s) · {captions} caption(s) applied',
  '가져올 수 없습니다.': 'Could not import.',
  '경고 {n}건 보기': 'View {n} warning(s)',
  '가져오면 현재 편집 중인 프로젝트를 덮어씁니다. 저장하지 않은 변경 사항은 사라집니다.':
    'Importing will overwrite the project currently being edited. Unsaved changes will be lost.',
  '에디터에서 검수 →': 'Review in Editor →',
  '새 프로젝트 만들기': 'Create New Project',
  "현재 편집 중인 프로젝트를 새 프로젝트로 덮어씁니다. 저장하지 않은 변경 사항은 사라집니다. 먼저 '저장'으로 보관해 두면 나중에 다시 불러올 수 있습니다.":
    'This will overwrite the project currently being edited. Unsaved changes will be lost. Save it first to be able to reload it later.',
  '새로 만들기': 'Create New',
  '처음이신가요? 4단계로 만듭니다:': "First time? Here's how it works in 4 steps:",
  설정: 'Setup',
  '기기 · 슬라이드 수 · 테마': 'Device · slides · theme',
  편집: 'Edit',
  '스크린샷 올리고 문구 · 디자인': 'Upload screenshots, write copy & design',
  현지화: 'Localize',
  '언어별 문구 · 스크린샷': 'Per-language copy & screenshots',
  내보내기: 'Export',
  'PNG ZIP (App Store 규격)': 'PNG ZIP (App Store spec)',
  '내 앱': 'My App',
  '추천 시작 세트': 'Recommended Starter Set',
  '히어로 상·하단 + 2페이지 스팬(기울인 기기)': 'Hero top & bottom + 2-page span (tilted device)',

  // LocalizeEditor.tsx
  '기본 이미지': 'Default image',
  변경: 'Change',
  업로드: 'Upload',
  지우기: 'Clear',
  '이미지를 읽을 수 없습니다 (PNG/JPG 권장)': 'Could not read image (PNG/JPG recommended)',
  '저장됨: {name}': 'Saved: {name}',
  '번역 프롬프트를 복사했습니다 — AI 도구에 붙여넣고 양식을 첨부하세요':
    'Translation prompt copied — paste it into your AI tool and attach the form',
  '복사 실패 — 클립보드 권한을 확인하세요': 'Copy failed — check clipboard permission',
  '파일명 규칙을 복사했습니다': 'File naming guide copied',
  '기준 언어 {n}개 갱신': '{n} source text(s) updated',
  '가져올 번역이 없습니다': 'No translations to import',
  '{n}개 적용': '{n} applied',
  '경고 {n}건 (아래 목록 확인)': '{n} warning(s) — see list below',
  '{n}개 번역을 가져왔습니다': '{n} translation(s) imported',
  '가져올 이미지가 없습니다': 'No images to import',
  '{n}개 이미지를 가져왔습니다': '{n} image(s) imported',
  로컬라이즈: 'Localize',
  '← 에디터': '← Editor',
  '내보내기 →': 'Export →',
  '에디터에서 기준 언어로 입력한 텍스트가 번역 원본이 됩니다. 스크린샷이 없는 언어는 기준 언어 스크린샷을 사용합니다.':
    'Text entered in the editor as the source language becomes the translation source. Languages without a screenshot use the source language screenshot.',
  '번역 언어': 'Target languages',
  '전체 해제': 'Deselect all',
  '전체 선택': 'Select all',
  '번역 양식 (외부 번역용)': 'Translation form (for external translation)',
  'CSV 내보내기': 'Export CSV',
  'JSON 내보내기': 'Export JSON',
  '번역 프롬프트': 'Translation Prompt',
  가져오기: 'Import',
  '이미지 일괄': 'Bulk Images',
  '이미지 가져오기': 'Import Images',
  '규칙 복사': 'Copy Naming Guide',
  '파일명 {pattern} · 기준 언어({locale})가 베이스 · 예: 1.{locale}.png, 1.{alt}.png':
    'Filename {pattern} · source language ({locale}) is base · e.g. 1.{locale}.png, 1.{alt}.png',
  '번역할 언어를 선택하세요': 'Select a language to translate',
  '에디터에서 이미지나 텍스트를 먼저 추가하세요': 'Add an image or text in the editor first',
  슬라이드: 'Slide',
  필드: 'Field',
  '번역 없음': 'No translation',
  'AI 도구에 붙여넣고, 내보낸 CSV/JSON 양식을 함께 첨부하세요. 결과 파일은 「가져오기」로 다시 불러옵니다.':
    'Paste into your AI tool and attach the exported CSV/JSON form. Import the result file back with Import.',
  복사: 'Copy',
  이미지: 'Image',

  // ExportPanel.tsx
  '스크린샷을 저장할 폴더 선택': 'Select a folder to save screenshots',
  '모든 슬라이드 렌더링에 실패해 내보낼 파일이 없습니다.':
    'All slides failed to render — no files to export.',
  '번역 미완료 로케일 {n}개: {locales} — 소스 텍스트로 내보내집니다.':
    '{n} locale(s) not fully translated: {locales} — source text will be used.',
  '스크린샷 없는 슬라이드: {slides} — 기기 프레임만 내보내집니다.':
    'Slides missing a screenshot: {slides} — only the device frame will be exported.',
  미리보기: 'Preview',
  '미리보기 크기': 'Preview size',
  '렌더링 범위': 'Render scope',
  로케일: 'Locales',
  '총 PNG': 'Total PNGs',
  '{n}개': '{n}',
  '렌더링 완료': 'Rendering complete',
  '슬라이드 {n} · {locale} ({done}/{total})': 'Slide {n} · {locale} ({done}/{total})',
  '{done} / {total} 렌더링 중…': 'Rendering {done} / {total}…',
  '렌더링 실패: {n}개 슬라이드 — 내보낸 파일이 없습니다.':
    'Render failed: {n} slide(s) — no files were exported.',
  '일부 슬라이드 렌더링 실패 ({n}개). 나머지는 정상적으로 내보냈습니다.':
    '{n} slide(s) failed to render. The rest exported successfully.',
  '슬라이드 {n} ({locale}) 렌더 실패: {message}': 'Slide {n} ({locale}) render failed: {message}',
  'screenshots/<locale>/<device>_NN.png — fastlane deliver로 바로 업로드':
    'screenshots/<locale>/<device>_NN.png — upload directly with fastlane deliver',
  'fastlane 폴더': 'fastlane folder',
  'fastlane용 ZIP': 'ZIP for fastlane',
  '렌더링 중… ({done}/{total})': 'Rendering… ({done}/{total})',
  '다시 내보내기': 'Export Again',
  'ZIP 다시 다운로드': 'Download ZIP Again',
  '내보낼 언어를 선택하세요': 'Select a language to export',
  '내보내기 · {n}개 PNG': 'Export · {n} PNGs',
  'ZIP 내보내기 · {n}개 PNG': 'Export ZIP · {n} PNGs',
  'fastlane으로 App Store Connect에 업로드하는 법': 'How to upload to App Store Connect with fastlane',
  '「fastlane용 ZIP」을 받아 압축을 풉니다.': 'Download the "ZIP for fastlane" and unzip it.',
  '{file}에 앱 번들 ID를 입력합니다.': "Enter your app's bundle ID in {file}.",
  'App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API에서 키(.p8)를 만들어 {file}에 채웁니다.':
    'Generate an API key (.p8) under App Store Connect → Users and Access → Integrations → App Store Connect API, then fill in {file}.',
  '폴더에서 {cmd1} 실행 (또는 {cmd2}).': 'From the folder, run {cmd1} (or {cmd2}).',
  '스크린샷만 업로드되고(바이너리·메타데이터 제외), .p8 키는 내 컴퓨터에만 머뭅니다. fastlane 설치가 필요합니다.':
    'Only screenshots are uploaded (binary and metadata are skipped). Your .p8 key stays on this machine. fastlane must be installed.',

  // StepIndicator / ErrorBoundary / ColorPickerPopover
  프로젝트: 'Project',
  에디터: 'Editor',
  '색상 선택': 'Pick a color',
  '문제가 발생했어요': 'Something went wrong',
  '화면을 그리는 중 오류가 났습니다. 작업 내용은 저장돼 있으니 다시 시도하거나 새로고침해 주세요.':
    'An error occurred while rendering the screen. Your work is saved — try again or refresh the page.',
  '다시 시도': 'Try Again',
  새로고침: 'Refresh',

  // BackgroundPanel.tsx
  '테마 프리셋': 'Theme Presets',
  '이 슬라이드': 'This slide',
  전체: 'All',
  '선택 {n}개': 'Selected ({n})',
  '{n}개 슬라이드에 적용할까요?': 'Apply to {n} slides?',
  '되돌리기 불가': 'Cannot undo',
  적용: 'Apply',
  '프리셋 삭제': 'Delete preset',
  '프리셋 이름': 'Preset name',
  '+ 현재 배경을 프리셋으로 저장': '+ Save current background as preset',
  단색: 'Solid',
  그라데이션: 'Gradient',
  '배경색 선택': 'Pick background color',
  선형: 'Linear',
  방사형: 'Radial',
  '색상 스톱': 'Color stops',
  '스톱 {n} 색상': 'Stop {n} color',
  '스톱 {n} 삭제': 'Delete stop {n}',
  '+ 색상 추가': '+ Add color',
  방향: 'Direction',
  '이미지 교체': 'Replace image',
  '클릭하여 배경 이미지 업로드': 'Click to upload a background image',
  '맞춤 방식': 'Fit mode',
  채우기: 'Cover',
  맞춤: 'Contain',
  늘이기: 'Fill',
  '이미지를 읽을 수 없습니다. 다른 파일(PNG/JPG)을 올려주세요.':
    'Could not read the image. Please try a different file (PNG/JPG).',

  // ScreenshotPanel.tsx
  스크린샷: 'Screenshot',
  'Hero 레이아웃은 텍스트만 표시합니다. 스크린샷을 넣으려면 「레이아웃」 탭에서 Hero Bleed · Text Top · Text Bottom · Split 중 하나를 먼저 선택하세요.':
    'Hero layout shows text only. To add a screenshot, first choose Hero Bleed, Text Top, Text Bottom, or Split from the Layout tab.',
  '남아있는 스크린샷 삭제': 'Delete remaining screenshot',
  교체: 'Replace',
  '클릭하여 이미지 업로드': 'Click to upload an image',
  '여러 장 일괄 업로드': 'Bulk upload',
  '파일명 {fmt} · 기준 언어({src})가 베이스 · 예: 01-home.{src}.png, 01-home.{ex}.png':
    'Filename {fmt} · source language ({src}) is base · e.g. 01-home.{src}.png, 01-home.{ex}.png',
  '{n}개 적용 · 경고 {w}건 (아래 목록 확인)': '{n} applied · {w} warning(s) (see list below)',
  '렌더링 모드': 'Render mode',
  '기기 프레임 표시': 'Show device frame',
  '기기 회전': 'Device rotation',
  '가장자리 잘라내기': 'Edge crop',
  위: 'Top',
  아래: 'Bottom',

  // ExternalImagePanel.tsx
  '외부 이미지': 'External images',
  '이미지 추가': 'Add image',
  '최대 {n}개까지 추가할 수 있습니다': 'You can add up to {n}',
  '추가된 이미지 ({n}/{max})': 'Images ({n}/{max})',
  '이미지 {n}': 'Image {n}',

  // OrnamentPanel.tsx
  '추가된 장식 ({n})': 'Decorations ({n})',
  별: 'Star',
  스파클: 'Sparkles',
  하트: 'Heart',
  꽃: 'Flower',
  잎: 'Leaf',
  발자국: 'Paw',
  불: 'Fire',
  파티: 'Party',
  로켓: 'Rocket',
  전구: 'Bulb',
  번개: 'Bolt',
  체크: 'Check',
  따봉: 'Thumbs up',
  트로피: 'Trophy',
  보석: 'Gem',
  과녁: 'Target',
  벨: 'Bell',
  백점: '100',
  회전: 'Rotation',
  투명도: 'Opacity',

  // HighlightPanel.tsx
  '하이라이트 추가': 'Add highlight',
  '먼저 스크린샷을 업로드하세요': 'Upload a screenshot first',
  '+ 추가': '+ Add',
  '하이라이트는 스크린샷 영역을 확대해 보여주는 기능이에요. 먼저 스크린샷을 업로드해야 추가할 수 있어요.':
    'Highlights zoom into a region of the screenshot. Upload a screenshot first to add one.',
  '"+ 추가"로 하이라이트를 만드세요. 캔버스에서 원본 박스와 확대 카드를 직접 조정하세요.':
    'Use "+ Add" to create a highlight. Adjust the source box and zoom card directly on the canvas.',
  '하이라이트 {n}': 'Highlight {n}',
  '원본 영역 (스크린샷 안)': 'Source region (inside screenshot)',
  '확대 카드': 'Zoom card',
}
