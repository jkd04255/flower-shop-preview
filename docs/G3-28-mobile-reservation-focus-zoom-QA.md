# 오후의 정원 G3-28 · iPhone 예약 제목 파란 테두리와 완료 화면 확대 완화 QA

- 기준선: 승인된 G3-27 `main` 정적 꽃집 시안, G3-23 수동 QA 및 G3-24~27 검증 기록.
- 사용자 증거: 2026-11-09 iPhone **Instagram 앱 내 브라우저** 스크린샷 2장. (1) 예약 화면 `꽃다발 예약 요청` 제목에 파란 사각형 포커스 표시, (2) 가상 예약 결과 화면에서 약간 확대되는 느낌.
- 구현/테스트 한계: 실제 iOS·Instagram WebKit에 접근하지 못했습니다. **첫 현상은 사용자 사진으로 확인**, 확대에 대한 정확한 브라우저 내부 원인은 직접 측정되지 않아 **iOS WebKit의 15px 입력 자동 확대와 무조건 실행하는 제목 focus/부드러운 스크롤의 복합 영향 가능성**을 근거로 보수적으로 수정했습니다.
- 정책: **G2 전체 Gate HOLD.** 실고객 데이터·DB/Auth·실계좌·은행/송금·문자·메일·과금·실결제·실예약 및 운영 API 연동 금지.

## 변경 사항

1. `#reservation`의 비대화형 제목 세 곳에만 CSS `outline:none`: `#reservationHeading` (H1), `#rReviewTitle` (H2), `#reserveResultTitle` (H2). 일반적인 `*:focus` 또는 버튼/입력의 focus ring을 제거하지 않습니다. 기존 G3-27 상품 상세 제목 수정을 유지합니다.
2. `window.pointerdown`의 `pointerType==='touch'` 및 최근 2초 여부를 사용해 **실제 터치에서만** 화면 전환 시 비대화형 제목 강제 `.focus()`를 생략하고 이전 활성 요소를 `.blur()`합니다. `keydown` 시 터치 판정을 초기화합니다. 키보드 Enter 및 일반적인 보조기술 합성 클릭(터치 pointerdown이 없는 경우)에서는 기존처럼 제목에 초점을 주어 문맥 이동을 유지합니다.
3. 유효한 예약 폼 제출→최종 검토, 검토→가상 요청 결과 전환의 `scrollIntoView`는 터치일 때 `auto`, 다른 입력 수단에서는 종전 `smooth`를 사용합니다. 터치로 '정보 수정하기'를 누를 때 날짜 입력칸에 강제 초점을 주지 않습니다.
4. `@media(max-width:700px)`의 예약 `input/select/textarea` 계산 글자 크기를 15px에서 **16px**로 조정하여 iOS WebKit의 작은 입력 폰트 자동 확대를 예방하도록 했습니다. 브라우저 화면 확대 기능을 차단하거나 `user-scalable=no`를 사용하지 않습니다.
5. **새 실제 예약 결과 화면 axe-core 자동 검사**에서 시연용 입금 영역의 `은행 / 계좌번호 / 입금 금액` 라벨 색상 대비 부족 3건이 발견됐습니다. `#reservation .transfer-result .transfer-details dt`에만 `#4f5d50`을 지정해 읽기 쉽게 조정했습니다. 입금 안내·상품·가격·사진은 그대로 유지합니다.
6. 푸터만 `G3-28 STATIC DEMO`로 표시합니다.

## 재현·검증 기록

- 첫 PR 실행 [#42552286136](https://github.com/jkd04255/flower-shop-preview/actions/runs/42552286136): 이전 G3-12~27 자동 검사 전부 통과, G3-28 터치 화면 변경·16px 입력·제목 초점·1건 가상 요청 생성은 통과. 신규 확장된 예약 결과 axe-core에서 **예전 대비 미흡 3건**을 찾아 실패했습니다. 검사 비활성화 없이 위 CSS 한 곳을 수정했습니다.
- 수정 후 [#42552625446](https://github.com/jkd04255/flower-shop-preview/actions/runs/42552625446): 새로운 **G3-28 실제 Chromium 11/11 PASS**, 완료 화면 axe-core WCAG A/AA **자동 위반 0**, 기존 G3-20 12화면 axe-core 위반 0, G3-21 사진 대비·재배치, G3-22 CDP 확대, G3-12~27 회귀 검사 모두 통과.
- CI: 기존 PR당 **단일 GitHub Actions 워크플로**에 `tests/g3-28-mobile-touch-zoom-qa.cjs` 한 단계만 추가. `cancel-in-progress` 및 이전 엄격 검사 유지.

| 확인 항목 | 결과 | 한계 |
|---|---|---|
| Chromium 모바일 touch emulation에서 상세→예약 제목 강제 초점 방지 | **PASS** | 실제 iOS Instagram 브라우저 아님 |
| 예약 제목·검토 제목·결과 제목의 브라우저 기본 outline | **none, PASS** | 실제 WebKit 화면 수동 확인 필요 |
| 모바일 예약 input/select/textarea 계산 font-size | **16px 이상, PASS** | iOS 자동 확대 방지 효과는 실기기 확인 필요 |
| 터치 유효 예약→검토→수정→가상 결과, 1건만 생성 | **PASS** | 합성 예약만 |
| Chromium visualViewport.scale 전환 전후 | **변화 없음, PASS** | iOS의 입력 자동 확대를 직접 재현한 것은 아님 |
| 완료 화면 신규 axe-core 검사 | **자동 위반 0, PASS** | 수동 WCAG 인증 아님 |
| 키보드 Enter 화면 전환 시 H1/H2 초점 유지, Tab 버튼 강조 | **PASS** | 실제 VoiceOver/TalkBack 별도 미검증 |
| G3-20~27 Chromium·axe 전체 회귀 | **PASS** | 실제 기기/스크린리더 미검증 |
| 실제 iPhone Instagram 인앱 브라우저에서 파란 테두리 및 화면 확대 재확인 | **미실행 (사용자 확인 요청)** | Chrome 자동화로 대체 불가 |

### 파일

- `index.html`: 모바일 제목·터치 전환·입력 폰트·결과 라벨 대비 및 푸터 변경.
- `tests/g3-28-mobile-touch-zoom-qa.cjs`: 실제 Chromium `hasTouch/isMobile`과 별도 키보드 context로 터치·키보드 경로 검증.
- `.github/workflows/g3-17-browser-qa.yml`: 기존 단일 CI의 G3-28 엄격 단계.
- `docs/G3-28-mobile-reservation-focus-zoom-QA.md`: 본 문서.

### 사용자 실제 iPhone에서 확인할 사항

1. 반드시 **같은 Instagram 앱 내 브라우저**에서 공개 G3-28 주소를 엽니다. 하단의 `G3-28 STATIC DEMO` 표시를 확인합니다.
2. 로지 모먼트→예약 화면 진입 직후 H1 파란 테두리가 사라졌는지 확인합니다.
3. 합성 이름/예시 번호·날짜·시간을 넣고 **검토 화면→정보 수정하기→재검토→최종 가상 요청**을 진행합니다. 개인정보/실계좌를 입력하지 않습니다.
4. 결과 화면에서 **확대된 것처럼 보이는 현상**이 사라졌는지, 화면 너비가 갑자기 달라지거나 가로 스크롤이 생기지 않는지 확인합니다.
5. 남는다면 **언제 시작되는지(날짜/시간 입력 선택 순간 vs 검토→결과 버튼을 누른 순간)**를 알려주십시오. 실제 iOS WebKit의 배율/스크롤 특성에 따라 추가 조정합니다.

**G2 전체 Gate HOLD 및 정적 시안 범위 준수.**
