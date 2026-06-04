# Lessons Learned

---

## Fabric.js

### IText는 width를 무시한다 → Textbox 사용
`IText`에 `width`를 지정해도 텍스트가 단어 단위로 줄바꿈되지 않는다. 지정 너비를 초과하면 옆으로 흘러서 다른 레이어와 겹친다.
- **고친 방법**: `renderCaption`에서 `IText` → `Textbox`로 교체. `Textbox`는 `width` 안에서 스페이스 기준 줄바꿈을 한다.
- **주의**: 한국어처럼 스페이스 없는 단어는 `splitByGrapheme: true`를 써야 문자 단위 줄바꿈이 된다. 영문+한국어 혼용이면 `false`로 두고 텍스트를 짧게 유지하는 게 안전하다.

### Group 좌표계 함정
`new Group([obj1, obj2], { left, top })` 생성 시, 내부 오브젝트 좌표는 그룹 중심 기준 상대좌표로 재계산된다. 절대좌표로 그린 오브젝트를 그룹에 넣으면 위치가 틀어진다.
- **고친 방법**: Group 대신 `FabricObject[]` 배열을 반환하고 호출부에서 `forEach(canvas.add)`로 추가. 좌표 변환 없이 절대좌표 그대로 유지.

### Path + evenodd로 "화면 구멍" 뚫기
기기 베젤 프레임(외곽은 채우고 화면 영역은 투명)을 만들려면 두 개의 닫힌 경로(외곽 rect + 내부 rect)를 하나의 Path 문자열에 이어 붙이고 `fillRule: 'evenodd'`를 설정한다. evenodd 규칙은 방향 무관하게 경계 교차 횟수로 채움 여부를 결정하므로 내부 경로가 구멍이 된다.

### cornerRadius는 deviceSpecs에서 계산해야 한다
`rx = 24 * scale` 고정값은 실제 기기 비율과 맞지 않는다. iPhone 16 Pro의 실제 cornerRadius는 export 해상도 기준 200px이다.
- **올바른 계산**: `Math.round(spec.cornerRadius * canvasWidth / spec.exportWidth)`

---

## 렌더링 성능

### 미리보기는 에디터 해상도로 렌더
`renderSlide()`의 기본 동작은 export 해상도(iPhone: 1320px)로 렌더링하므로 미리보기에 쓰면 4초 이상 걸린다. `previewWidth` 파라미터를 추가해 에디터 해상도(440px)로 렌더하면 약 3배 빠르다. 병목은 Fabric.js 초기화 + 폰트 로딩 고정 오버헤드라 픽셀 수 감소 효과는 9배 미만이다.

---

## 레이아웃 & 타이포그래피

### 템플릿별 폰트 크기 분리 필수
단일 기본값(110pt)을 모든 템플릿에 쓰면 narrow 컬럼(split) 또는 텍스트가 적은 영역(text-top/bottom)에서 넘침이 발생한다. 각 템플릿의 텍스트 영역 너비에 맞춰 기본값을 다르게 설정하고, 템플릿 전환 시 자동 조정되도록 `handleTemplateChange`에서 함께 업데이트한다.

| 템플릿 | headline | subheadline |
|--------|----------|-------------|
| hero | 80 | 40 |
| text-top/bottom | 56 | 30 |
| split | 44 | 24 |

### text-bottom: 기본 기기 스케일이 텍스트 앵커를 침범한다
text-bottom의 텍스트 앵커는 캔버스 높이 74% 지점인데, 기본 스케일(1) 기기는 5%→83%를 차지해 캡션이 항상 베젤 위에 그려진다. 기기 높이는 `0.78 × scale × ch`로 모든 모델에서 동일하게 성립한다 (프레임 종횡비 = 캔버스 종횡비).
- 내장 프로젝트 템플릿은 슬라이드별로 scale/offset을 직접 지정해 이 문제를 우회해 왔다 — 즉 기본 deviceFrame의 text-bottom은 어떤 경로로도 렌더된 적이 없었고, 프로젝트 가져오기가 처음으로 그 조합을 만들었다.
- **고친 방법**: 기본 frame으로 text-bottom을 만드는 유일한 생산자(가져오기)에서 `scale: 0.85` 시드 (`0.05 + 0.78·s ≤ ~0.72`). 캔버스 레이아웃 상수를 고치면 기존 프로젝트/큐레이트 템플릿의 지오메트리가 틀어지므로 임포트 쪽에서 잡는다.
- **교훈**: 레이아웃 상수(텍스트 앵커, 기기 밴드)는 기본값 조합으로도 성립하는지 검증해야 한다. 에디터 UI가 만들 수 없는 상태도 임포트는 만들 수 있다.

### Split 레이아웃: 텍스트와 기기 사이 gap 확보
텍스트 컬럼 우측 끝과 기기 프레임 좌측 사이 gap이 20px 미만이면 시각적으로 붙어 보인다. 최소 40–50px 이상 유지해야 한다.
- 텍스트 centerX: `cw * 0.21`, width: `cw * 0.37` → 우측 끝 `cw * 0.395`
- 기기 centerX: `cw * 0.76` → 좌측 끝 `cw * 0.535`
- gap: `cw * 0.14 ≈ 62px` ✓

---

## iOS 시뮬레이터 자동화

### `xcrun simctl`은 터치 이벤트 미지원
`xcrun simctl io <udid> sendEvent touch x y` 는 존재하지 않는다. 프로그래밍 방식 UI 조작이 필요하면 `idb` (Meta/Facebook) 설치가 필요하다.

### headless 모드에서 AppleScript로 Simulator.app 접근 불가
`Simulator.app`이 실행 중이어도 headless 환경에서는 `System Events`가 창을 찾지 못한다(`windows count: 0`). GUI 자동화는 디스플레이가 있는 환경에서만 가능.

### KTX SplashBoard 스냅샷은 `sips`로 PNG 변환 가능
`sips -s format png file.ktx --out file.png` 로 변환 가능하다. 단, 앱을 처음 설치하고 아직 백그라운드 전환이 없었다면 스냅샷은 빈 흰 이미지다.

### AsyncStorage 파일은 첫 저장 이후에 생성
온보딩이 완료되기 전 앱이 종료되면 `@react-native-async-storage`가 아무 파일도 남기지 않는다. 스토리지 파일 조작으로 앱 상태를 바꾸려면 최소 한 번 이상 저장이 발생해야 한다.
