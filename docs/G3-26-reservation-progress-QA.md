# 오후의 정원 G3-26 · 예약 3단계 진행 표시 QA

- 기준선: 승인된 G3-25 `main` 정적 시안과 `docs/G3-25-product-discovery-QA.md`, G3-24 최종 확인 및 G3-12~23 QA·보존 정책.
- 핵심 변경: 예약 화면 오른쪽에 **01 정보 입력 → 02 최종 확인 → 03 요청 완료(가상)**를 작은 선형 진행 표시로 추가합니다. 가상 요청 3단계는 **실제 매장 예약 확정이 아닙니다**.
- 유지: 히어로 `오늘의 꽃 만나기 ↗` 원문·링크, 상품 카드 `상품 상세 보기 ↗`, 사진·크림/그린 배치, 가상 예약/이중 확인, 합성 입금 안내, 관리자 캘린더, 시간당 최대 3건, 기록 최대 500건, 브라우저 저장/복원.
- 운영 범위: **G2 전체 Gate HOLD**. 실고객/실예약/실계좌·은행/DB/Auth·문자/메일/과금·실송금/결제/외부 API 연동 금지.

## 구현 사항

- `index.html`: 기존 예약 폼 위에 `<nav id="reserveProgress" aria-label="가상 예약 진행 단계"><ol>...`과 `li[data-reservation-step]` 3개를 추가했습니다. 세 단계는 **버튼·링크가 아니며** 기존 예약 처리 흐름을 바꾸지 않습니다. 현재 항목의 `aria-current="step"`은 항상 1개, 이전 단계에는 완료 스타일을 지정합니다.
- `setReservationProgress('input'|'review'|'result')`을 기존 최종 확인 흐름에 연결: 초기 접근·입력 오류 1단계, 모든 필드 유효할 때 검토 2단계, 정보 수정·변조 오류 시 1단계, 명시적 최종 확인으로 가상 기록이 생성된 경우에만 3단계.
- 기존 `clearReservationReview()`에 1단계 복귀를 연결하고, 가상 요청이 실제로 기록된 직후에만 3단계로 표시합니다. 가상 송금 상태 변경은 3단계를 유지합니다.
- 진행 표시 CSS만 추가했습니다. 모바일 320/390px에서도 각 단계 글씨·순서를 확인할 수 있고, 버튼을 추가하지 않아 기존 탭 순서가 변하지 않습니다.
- **실제 Chromium에서 발견된 확대 초점 문제 수정:** 신규 표시로 예약 폼이 아래로 이동하면서 기존 G3-22 CDP 2x 확대 테스트에서 날짜 입력 요소의 초점이 가시 영역 밖에 남았습니다. 페이지 전체의 부드러운 스크롤 대신 **예약 화면에 한정해 즉시 스크롤**하도록 `html:has(#reservation:not([hidden])){scroll-behavior:auto}`를 적용해 원래 키보드 초점 이동을 복구했습니다. [수정 전 실패 run #42506388319](https://github.com/jkd04255/flower-shop-preview/actions/runs/42506388319).
- 기존 G3-13/14 합성 DOM 테스트 모형의 `querySelectorAll` 및 `classList.toggle` 구현에 새 단계 항목을 추가하고, 초기·검토·결과·오류의 `aria-current` 전환을 점검합니다. [중간 테스트 모형 실패 run #42506506220](https://github.com/jkd04255/flower-shop-preview/actions/runs/42506506220)는 실제 앱이 아니라 가상 DOM 요소 미지원 문제였으며 해당 검사 코드를 수정했습니다.

## 최종 검증

모든 테스트는 GitHub 체크아웃의 실제 정적 `index.html`/CSS/사진과 합성 예약 데이터를 사용했습니다. 신규 페이지 테스트는 실제 Chromium localhost에서 수행했으며, 실고객 정보나 외부 계좌·문자/결제 API를 호출하지 않았습니다.

| 항목 | 결과 | 근거 |
|---|---|---|
| **G3-26 실제 Chromium 진행 표시** | **20/20 PASS** | 초기/유효성 오류/검토/수정/재검토/입력 변경/최종 확인/중복 방지/가상 입금/화면 이동/320·390px·axe |
| G3-22 페이지 확대·키보드 초점 | **22/22 PASS** | CDP 1x/2x/4x 및 320px 초점 검증 |
| G3-21 사진 대비·화면 재배치 | **30개 관찰 PASS, 오류 0** | 실제 Chromium 사진 합성 픽셀 |
| G3-20 axe-core WCAG 2.0/2.1 A·AA | **12개 시나리오 자동 위반 0** | 자동 판정 가능한 범위 |
| G3-12/13/14 합성 | **31/39/44 PASS** | 기존 예약·정원·최종 확인 및 단계 상태 |
| G3-15/16/17/18/19 실제 Chromium | **15/7/10/14/20 PASS** | 예약·탭·필터·초기화·달력/모바일 |
| G3-24 최종 확인 실제 Chromium | **15/15 PASS** | 확인 전 예약 미생성, 예시 개인정보 미저장, 중복 제출 방지 |
| G3-25 상품 카드 실제 Chromium | **10/10 PASS** | 히어로 문구·카드 라벨·링크·화면 폭 |
| iPhone/Android 실기기·VoiceOver/TalkBack | **G3-26 검증 미실행** | 실제 기기 접근 없이 Chrome 자동화만 수행 |

**첫 전체 성공 실행:** [GitHub Actions #42506648424](https://github.com/jkd04255/flower-shop-preview/actions/runs/42506648424) — `success`. 문서 추가 후 변경 커밋에 대한 Actions 결과도 병합 전 확인합니다.

## 파일 및 운영 기록

- `index.html`: 예약 3단계 안내, 모바일 CSS 및 키보드 초점 스크롤. 푸터 `G3-26 STATIC DEMO`.
- `tests/g3-26-booking-progress-qa.cjs`: 기존 G3-24 브라우저 시나리오 위에 단계 상태·검사 확장.
- `tests/g3-13-integrated-qa.cjs` 및 `tests/g3-14-form-a11y-qa.cjs`: 최신 앱에 맞춰 합성 DOM/단계 확인 업데이트.
- `.github/workflows/g3-17-browser-qa.yml`: 기존 자동 PR 통합 Actions **하나**에 새 브라우저 테스트 추가. 과거 G3-15/16 수동 워크플로 및 `cancel-in-progress` 유지.
- `docs/G3-26-reservation-progress-QA.md`: 본 보고서.

### 테스트 실행 예

```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock --ignore-scripts playwright-core axe-core@4.10.3 pngjs@7.0.0
CHROME_BIN=/usr/bin/google-chrome node tests/g3-26-booking-progress-qa.cjs
```

기존 단일 PR Actions가 위 항목과 모든 이전 실제 Chromium·axe 테스트를 한 번에 실행합니다.

**범위 제한:** 화면 진행 표시의 3단계는 합성 가상 예약 요청의 흐름이며, 송금 확인·실제 매장 예약 확정은 이후 별도 관리자/은행 정책의 개념으로만 설명합니다. 실제 인증·실고객 DB·은행·예약/문자/과금 연동 기능은 구현하지 않았으며 G2 전체 Gate HOLD를 유지합니다.
