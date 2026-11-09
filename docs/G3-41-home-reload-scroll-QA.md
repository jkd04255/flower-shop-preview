# 오후의 정원 G3-41 — 홈 새로고침 후 스크롤 위치 오류 수정

## 사용자 재현
iPhone 내장 브라우저에서 홈페이지를 열고 내려가거나 `오늘의 꽃 만나기 ↗`를 눌러 `Today's selection.`으로 이동한 뒤 페이지를 새로고침하면, 페이지 맨 위 히어로가 아니라 `Today's selection.`부터 표시되는 오류.

## 원인 범위
- 기존 CSS는 `html{scroll-behavior:smooth}`이지만 홈페이지 새로고침 시 브라우저의 **스크롤 자동 복원** 제어가 없습니다.
- 메인 CTA가 남기는 `#curation` 등 홈 섹션 해시로 새로고침하면 브라우저의 네이티브 앵커 스크롤이 같은 위치로 이동할 수 있습니다.
- 기존 `route()`는 상세/예약/관리자/캘린더/조회 페이지에는 `scrollTo(0,0)`을 실행하지만, 홈 섹션을 다시 여는 경우에는 해당 처리가 없습니다.

## 수정
- 기존 메인 `<script>` 시작 부분에 G3-41 스크롤 보정 IIFE를 통합합니다. 기존 인라인 `<script>` **3개 구조와 첫 번째 메인 스크립트 위치를 그대로 보존**해 G3-12~14의 엄격한 전체 스크립트 문법·통합 회귀 검사가 유지됩니다. 브라우저 외의 합성 DOM 테스트에서는 `performance` 등을 확인하여 보정 로직을 안전하게 건너뜁니다.
- PerformanceNavigationTiming/구형 navigation type으로 **실제 새로고침(reload)**만 감지. 홈 페이지에서만 브라우저 `history.scrollRestoration='manual'`을 설정합니다.
- 홈 섹션 `#curation`, `#arrivals`, `#other`, `#store`로 새로고침한 경우에는 `history.replaceState`로 `#top`을 지정하여 자동 앵커 이동을 차단합니다. 주소에는 사용자정보를 남기지 않습니다.
- 초기 DOM 구축, load, pageshow 및 2 프레임 이후의 초기 복원을 제어합니다. Safari/WebKit의 지연 복원 대응으로 페이지 표시 후 180ms에도 한 번 더 최상단을 보정합니다. 이동 시에만 일시적으로 부드러운 스크롤을 중단하여 최상단 이동 애니메이션/흔들림을 방지하고, 기존 `html{scroll-behavior:smooth}`은 보존합니다.
- **일반 링크 클릭 시의 `#curation` 등 홈 내부 이동은 그대로 유지**합니다. `#/flower/...`, `#/reserve/...`, `#/booking-status`, `#/admin-demo`, `#/calendar-demo`의 직접 방문 및 새로고침은 제외합니다. 브라우저 뒤로가기/앞으로가기 등 `navigate`, `back_forward` 로딩은 사용자 위치 복원 동작을 불필요하게 변경하지 않습니다.
- 전체 기존 원본 사진·브랜드·상품/예약·관리자/캘린더 정책·스크린 UX 및 고정 문구 **`오늘의 꽃 만나기 ↗`** 보존. 푸터 `G3-41 STATIC DEMO`.

## 검증 / QA 게이트
- 기존 단일 CI 워크플로의 **G3-12~40 Chromium/axe/Linux WebKit 전체 회귀 유지**. G3-40 푸터 회귀 검사는 버전 40 이상도 허용하도록 수정했지만 원래 기능 검증은 유지합니다.
- 신규 `tests/g3-41-home-reload-scroll-qa.cjs`: Chromium 및 Linux WebKit 모바일에서 (1) 주소 해시 없는 홈을 스크롤 후 새로고침하면 최상단 복원, (2) `오늘의 꽃 만나기` 클릭→`#curation`→새로고침 시 `#top` 및 최상단, (3) 일반 CTA 클릭 시 내부 이동 계속 가능, (4) `#arrivals`, `#other`, `#store` 새로고침도 최상단, (5) 상품 상세/예약/조회/관리자/캘린더 SPA 직접 URL은 변경하지 않음, (6) axe WCAG 2.1 A/AA 위반 0, 320/390px 모바일 가로 넘침 및 JS 오류 0.
- 전체 CI 성공 시에만 PR squash merge → GitHub Pages 동일 SHA 배포 성공 확인.

## 유보 사항
- **G2 전체 Gate HOLD 유지**, 실제 예약·실계좌/결제·실고객 개인정보·DB/Auth·은행/SMS/메일 등 실서비스 연동 전면 금지.
- Playwright Linux WebKit은 실제 iPhone Instagram 인앱 브라우저가 아닙니다. **실기기 테스트 미확인**.

## 사용자 확인
iPhone에서 공개 테스트 사이트를 열고 **‘오늘의 꽃 만나기 ↗’**를 눌러 아래로 내려간 후 새로고침합니다. 맨 위 히어로가 다시 보이는지 확인합니다. 일반 클릭 시 꽃다발 섹션으로 자연스럽게 이동하는 것도 확인합니다.
