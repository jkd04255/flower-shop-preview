# G3-68 · 모바일 예약 3단계 진행 표시의 한글 가독성

## 확인한 기준 및 적용 Skill
- 기준 `main`: `7a375fe313d62d09bc93dddedb6ccb662d89df79` (G3-67), 열린 PR 없음, QA/Pages SHA 확인.
- `.agents/skills/human-web-design/SKILL.md`, `.agents/skills/frontend-design/SKILL.md`, `docs/G3-67-mobile-store-facts-QA.md`, 현행 통합 CI 확인.
- 기존 Pretendard·잔잔한 짙은 녹색·기존 3단계 순차 표시·가상 시연 정책을 존중합니다. 단계는 실제 순서이므로 기존의 01/02/03 표시는 의도적이며 유지합니다.

## 진단과 단일 수정
- 예약 화면의 **정보 입력 → 최종 확인 → 요청 완료 (가상)** 세 칸 진행 표시가 390px 이하에서 단계명 11px, 숫자 10px, 보조 (가상) 10px로 작아지는 소스상의 문제가 있습니다.
- 600px 이하에서 단계명 12px, 숫자 11px, '(가상)' 11px로 조정하고, 줄 높이와 약간의 여백을 보강합니다.
- 긴 한글은 원래 3열 내부에서 자연스럽게 줄바꿈하도록 둡니다. 현재 단계 `aria-current="step"`, 이전 완료 단계의 녹색 윗선, 3열 구조·단계 순서·원래 문구·동작을 유지합니다.
- 601px 이상은 기존 타이포그래피를 유지합니다. 단계/버튼/안내/애니메이션을 새로 만들지 않습니다.
- 기존 꽃 사진·비율(4:3 포함)·고정 히어로 **‘오늘의 꽃 만나기 ↗’**, 예약·조회·관리자·캘린더 기능 보존.

## QA 및 증거
`tests/g3-68-mobile-booking-progress-legibility-qa.cjs`
- Chromium/Linux WebKit × 320·390·440·600·768·1280px: 3열 원형·세 단계 원래 제목·현재 단계 표시·타이포그래피·가로 넘침 및 탭 없이 읽을 수 있는 단계 표시.
- 유효하지 않은 예약 제출 시 단계 1 유지, 합성 날짜/시간·가상 고객 입력 후 단계 2 검토 화면 진입, 수정 복귀 시 단계 1과 입력 내용 유지, 저장 전 합성 예약·localStorage 불변.
- 390px axe WCAG 2.1 AA 위반 0건, 브라우저 오류·스크린샷 확인.
- 기존 모든 Chromium/WebKit/axe 회귀 단계를 그대로 실행하며 실패·스킵을 성공으로 간주하지 않습니다.

## 배포/보안 Gate
**정확한 최신 PR HEAD SHA**에서 기존 전체 회귀 + 신규 G3-68 QA가 모두 성공한 경우에만 squash 병합하고, GitHub Pages 빌드·배포의 SHA와 최신 `main`의 일치를 검증합니다.

G2 전체 Gate HOLD. 실예약·실송금/계좌·결제·개인정보 저장·DB/Auth/SMS/외부 API 연동 금지. 실제 iPhone Safari 및 Instagram WebView 실기기 검증은 미완료입니다.
