# 오후의 정원 · G3-22 Chromium page-scale·텍스트 확대·초점 가림 QA

- 기준선: 승인된 G3-21 `main`, squash merge `69a7b03aa8ed99d3f56af1abff7cf8e801d531e9`.
- 승인/QA 참조: `docs/G3-21-photo-zoom-focus-QA.md`, `docs/G3-20-axe-wcag-QA.md`, `docs/GitHub-Actions-notification-policy.md`. 기존 사진·상품·가상 예약·입금 안내·관리자 캘린더·저장 복원·카드/타이포그래피 승인 범위를 보존.
- 프로젝트 유형: 오직 합성 데이터로 실행되는 공개 정적 GitHub Pages 시연. **G2 전체 Gate HOLD**. 실고객 데이터·DB/Auth·실계좌·은행·메일·문자·과금·실예약/실송금 연동은 금지.
- 테스트 환경: GitHub-hosted **실제 headless Chromium**, 기능 브랜치 체크아웃의 실제 `index.html`/CSS/이미지 파일을 localhost HTTP 서버로 제공. 외부 실서비스 API를 호출하지 않음.

## 새 검사 방법과 기술적 한계

### 1. Chromium의 실제 CDP 화면 배율

`Emulation.setPageScaleFactor`로 **1배·2배·4배 compositor/pinch page scale**을 적용하고 Chromium `visualViewport.scale`이 실제 1/2/4로 바뀌는지 확인. 320 CSS px 화면에서 배율 2 시 가시 폭 약 **160 CSS px**, 4 시 약 **80 CSS px**로 감소했습니다. 관리자·캘린더·예약 3개 흐름에서 다음을 반복:

- `Tab`으로 다음 요소에 이동한 뒤, 실제 활성 요소가 기대 ID(`calNext`, `adminReset`, `rDate`)인지 확인
- `:focus-visible`, 실제 computed `outline` 2px 이상, DOM 연결 유지 확인
- 요소의 사각형과 `visualViewport`의 실제 가시 영역 사이의 교차 폭/높이가 0이 아닌지 확인
- 화면의 요소 판별(`document.elementFromPoint`)으로 **다른 요소에 가려지지 않는지** 확인

**주의:** 이 CDP 배율은 실제 Chromium의 pinch/compositor page scale이며 **데스크톱 브라우저 메뉴의 Ctrl+/Cmd+ 확대, 운영체제 접근성 화면 확대, 실제 모바일의 손가락 제스처와 동일한 인터페이스는 아닙니다.** 과거 G3-21의 640/320 CSS 뷰포트 reflow 검사는 그대로 유지합니다.

### 2. 200% 글자 확대 스트레스 테스트

주요 버튼·폼 레이블·월간/일간 캘린더 필터·예약 조작 요소의 **현재 계산된 글자 크기를 선택적으로 2배**로 만드는 시연 테스트. 실제 Chrome에서 320px 페이지 폭의 가로 넘침과 `overflow:hidden`으로 인한 테스트 대상 문구 잘림을 확인합니다.

이는 시스템 글자 크기 환경설정이나 OS 글자 확대를 직접 바꾼 것이 아니며, 모든 본문·제품 설명·중첩 텍스트까지 포괄하는 정식 200% 텍스트 확대 적합성 검사는 **아닙니다**.

### 3. 사진 배경과 자동 판정의 한계

G3-21에서 **실제 사진 `hero-original.webp` + CSS 그라데이션 합성 픽셀**을 1280/390px에서 글자 위치별로 비교했습니다. 해당 자동화는 현재 G3-22 통합 QA에서도 엄격 게이트로 실행되어 통과했습니다. G3-20 axe-core 자동 검사도 12개 화면/너비 시나리오에서 확인 가능한 WCAG A·AA 위반 0건입니다.

다만 **사진의 모든 위치/뷰포트/브라우저 렌더링과 axe의 판정 보류(`incomplete`)가 사람이 직접 확인해도 적합하다는 뜻은 아닙니다.** 실제 iPhone/Android에서 화면을 직접 보며 밝은 사진 영역 위의 텍스트, 사용자별 텍스트 크기, VoiceOver/TalkBack의 발화 및 고대비 모드를 수동 검증할 필요가 있습니다. 이 수동 검사를 완료했다고 주장하지 않습니다.

## 발견 및 조치

초기 발견 검사: [GitHub Actions #42473622334](https://github.com/jkd04255/flower-shop-preview/actions/runs/42473622334).

- 처음에는 1배 관리자·2/4배 일부 요소 등 **7개 초점 가시성 결과가 실패**로 측정됐습니다. CSS `scroll-behavior:smooth`의 애니메이션 중간 시점에서 좌표를 읽은 것이 원인으로 확인됐습니다.
- `Tab` 후 부드러운 스크롤이 안정된 뒤(750ms) 계산하니 1·2·4배 9개 화면 조합의 초점 사각형이 모두 가시 영역에 들어왔습니다.
- 추가로 시각 가림 가능성을 확인하기 위해 시각 뷰포트와 교차하는 실제 초점 요소 위치를 `elementFromPoint`로 검사했습니다. 재실행 결과 9개 초점 요소 모두 가려지지 않았습니다.
- 확대 시 **앱 서비스 코드 문제는 재현되지 않았고**, 선택적 글자 크기 2배 시 페이지 가로 넘침 또는 숨겨진 글자 잘림도 재현되지 않았습니다. 따라서 실제 디자인·예약·달력 서비스 코드는 수정하지 않았습니다.

**앱 소스 변경은 footer 버전 표시 `G3-21 STATIC DEMO → G3-22 STATIC DEMO`만**으로, 서비스 동작·이미지·타이포그래피·예약 처리에 영향이 없는 QA 전용 버전 표시입니다. 테스트는 발견 전용 `G322_DISCOVERY=1`에서 검증 완료 후 **엄격 판정 `G322_DISCOVERY=0`**으로 전환했습니다. 문제 발생 시 CI가 실패하며 무시하지 않습니다.

## 실행 결과

| 검사 | 최종 상태 | 실제 범위 |
|---|---|---|
| **G3-22 CDP 1/2/4배 (달력·관리자·예약)** | **9/9 PASS** | 실제 Chromium compositor page scale |
| **G3-22 Tab 가시성·outline·가림 검사** | **9/9 PASS** | 320px, 실제 DOM/visualViewport/elementFromPoint |
| **G3-22 계산 글꼴 2배 선택적 확대** | **4/4 PASS** | 주요 컨트롤 집합, 320px |
| **G3-22 전체** | **22/22 PASS, 이슈 0건** | 엄격 검사 `tests/g3-22-scale-text-focus-qa.cjs` |
| G3-21 사진 글자 대비·640/320 재배치·초점 | **엄격 게이트 PASS** | 실제 Chromium 사진 픽셀·뷰포트 |
| G3-20 axe-core WCAG 2.0/2.1 A·AA | **자동 검출 위반 0건** | 12개 화면·너비 시나리오 |
| G3-12/13/14 합성 저장·예약·폼 | **31/34/38건 PASS** | 가상 DOM/합성 JS |
| G3-15/16/17/18/19 Chromium 회귀 | **14/7/10/14/20건 PASS** | 로컬 서버의 실제 HTML 및 가상 데이터 |
| 실제 iPhone/Android, VoiceOver/TalkBack | **미검증** | 실제 기기/스크린리더 환경 접근 없음 |
| 실제 예약·계좌·은행/문자·메일/DB/Auth·과금 | **구현/연동 금지** | G2 전체 Gate HOLD |

- 단일 통합 GitHub Actions **엄격 검사 전체 성공:** [run #42474468936](https://github.com/jkd04255/flower-shop-preview/actions/runs/42474468936).
- 9개 초점 위치에 대한 추가 비가림 판정/상세 로그: [run #42474203945](https://github.com/jkd04255/flower-shop-preview/actions/runs/42474203945).
- 아티팩트: `qa-artifacts/g3-22-native-scale-text-focus.json` 및 G3-21·G3-20 이전 단계의 실제 브라우저 보고서.
- 기존 알림/중복 실행 축소 정책 유지: **PR에 통합 자동 QA 워크플로 하나**, 과거 G3-15·16은 수동 트리거 유지.

## 재실행

```bash
npm install --no-save --no-package-lock --ignore-scripts playwright-core axe-core@4.10.3 pngjs@7.0.0
CHROME_BIN=/usr/bin/google-chrome G322_DISCOVERY=0 node tests/g3-22-scale-text-focus-qa.cjs
CHROME_BIN=/usr/bin/google-chrome G321_DISCOVERY=0 node tests/g3-21-visual-zoom-qa.cjs
CHROME_BIN=/usr/bin/google-chrome AXE_ENFORCE=1 node tests/g3-20-axe-qa.cjs
```

**접근성 적합성 인증 아님.** 모바일 실제 기기/시스템 글자 확대/스크린리더/사진 배경 전체는 향후 직접 QA가 필요합니다. G2 전체 Gate HOLD 및 기존 정적 시안 전용 승인 범위를 엄수합니다.
