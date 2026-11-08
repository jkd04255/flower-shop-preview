# 오후의 정원 · G3-16 실제 Chromium 키보드·다중 탭 QA

- 기준: G3-15 `main` 커밋 `a65228fc8965b92397bdd040c4f6d74ba0fab24c`.
- 기존 승인: `docs/G3-15-browser-regression-QA.md`, G3-12~14 회귀 기록 및 가상 계좌이체/관리자 수동 확인/캘린더 시안.
- 소스: `jkd04255/flower-shop-preview`; 공개 페이지는 기존 GitHub Pages 가상 시연만.
- **G2 전체 Gate HOLD**. 실고객 데이터·실예약·실은행/계좌·DB/Auth·메일·문자·외부 API·과금 연동 없음.

## 실제 브라우저 테스트 우선과 발견 사항

1. GitHub Actions 실제 Chromium에서 예약 제목→날짜 입력칸 Tab 이동 **통과**. 네이티브 `input type=date`는 내부 여러 구획을 Tab으로 순회하므로, "Tab 한 번이면 다음 시간칸"이라는 **초기 테스트 가정만 잘못되어 보정**했습니다. 서비스 코드는 이 문제로 수정하지 않았습니다. 초기 테스트 실패: [run #42428918162](https://github.com/jkd04255/flower-shop-preview/actions/runs/42428918162).
2. 두 탭에서 동일 초기 상태를 다시 저장하면 브라우저가 `storage` 이벤트를 발송하지 않을 수 있어 테스트가 거짓 양성이 될 수 있음을 확인했습니다. 가상 관리자 화면에서 실제로 **입금 확인 체크→수동 예약 확정**, **수령 전 변경**을 실행해 다른 탭에 확실한 변경 이벤트를 보내도록 강화했습니다.
3. 강화한 실제 Chrome 검증에서 다른 탭의 변경으로 `renderAdminDemo()`가 목록을 갱신하자 첫 탭의 `document.activeElement`가 해당 예약 카드에서 이탈하는 오류가 **실패로 재현**됐습니다: [run #42429084267](https://github.com/jkd04255/flower-shop-preview/actions/runs/42429084267).
4. 동일한 코드를 사용하는 일간 캘린더의 `renderCalendar()`도 다시 생성되는 타임라인 항목이 키보드 초점을 잃을 수 있어 같은 원인·기존 화면 범위에서 함께 수정했습니다.

## 변경 내용

- `storage` 이벤트가 발생하면 동기화 **직전**에 사용자 초점이 있는 가상 관리자 카드의 `data-request-id`, 관리자 상세, 캘린더 타임라인 `data-request-id`, 주간 날짜 `data-date`, 월간 날짜를 기록합니다.
- 기존 `restoreDemoBookings()`, `renderAdminDemo()`, `renderCalendar()` 동작은 그대로 실행합니다.
- 동기화 **후** 대응하는 새 카드·타임라인 `summary`·주간/월간 날짜 버튼에 `focus({preventScroll:true})`로 초점을 복원합니다. 대상 예약이 사라지면 가능한 첫 관리자 카드 또는 날짜 제목 등 기존 안전한 요소로 이동합니다.
- 기존 고객 예약 폼·상품/사진/타이포그래피·입금 단계·관리자 수동 확정·시간당 3건 제한·합성 예약 최대 500건·기존 접근성 개선은 변경하지 않았습니다.
- 추가 파일: `tests/g3-16-browser-qa.cjs`, `.github/workflows/g3-16-browser-qa.yml`. 이전 G3-15 실제 Chrome 검사도 동일 CI에서 반복합니다.

## 실행한 검증

| 종류 | 결과 | 증적 |
|---|---|---|
| G3-12 합성 저장·정원 회귀 | **31/31 PASS** | `tests/g3-12-synthetic-qa.cjs` |
| G3-13+15 전체 JS 모의 DOM 통합 | **34/34 PASS** | `tests/g3-13-integrated-qa.cjs` |
| G3-14 예약 폼/입금 UI 합성 | **38/38 PASS** | `tests/g3-14-form-a11y-qa.cjs` |
| G3-15 실제 Chrome 기존 흐름 | **14/14 PASS** | `tests/g3-15-browser-qa.cjs` |
| **G3-16 실제 Chrome 탭/다중 탭** | **7/7 PASS** | `tests/g3-16-browser-qa.cjs` |
| 코드 인라인 JavaScript 구문 | **3개 파싱 통과** | 기능 브랜치 소스 검사 |

최종 GitHub Actions: [G3-16 run #42429158218](https://github.com/jkd04255/flower-shop-preview/actions/runs/42429158218) — 모든 테스트 단계와 워크플로 **success**. 같은 수정 커밋의 [G3-15 기존 Chrome run #42429158244](https://github.com/jkd04255/flower-shop-preview/actions/runs/42429158244)도 **success**.

G3-16의 실제 Chrome 검사는 같은 브라우저 컨텍스트의 탭 두 개에서 실행했습니다. 예약 화면의 접근 가능한 Tab 이동과 날짜 선택, 다른 탭의 합성 확정 3건에 따른 시간 마감, 다른 탭 관리자 입금 확인·예약 확정/수령 상태 변경 후 관리자 카드·캘린더 타임라인 초점 복원, 캘린더 기본 Tab 이동과 JS 오류 부재를 확인했습니다.

**중요:** 브라우저에서 실제 화면을 클릭한 검사는 GitHub 체크아웃의 HTML·CSS·사진을 Node localhost에서 제공한 **브랜치 버전**에 대한 것입니다. 공개 GitHub Pages에서는 예전처럼 **읽기 전용 홈·버전 제공만** 확인하며, 생산 예약 데이터를 입력하지 않습니다.

## 미실행 및 승인 경계

- 실제 iPhone·Android 단말, iOS VoiceOver·Android TalkBack, 화면 낭독 품질과 브라우저·OS 조합 다양성은 미검증.
- 여러 **서로 다른 기기**의 동기화, 저장소 원자 트랜잭션, 실제 이용자 인증·실계좌·결제·문자·메일·DB 등은 미승인 및 미구현.
- 자동화 테스트는 실제 Chrome과 합성 DOM의 성격이 다르므로 실행 결과를 혼동하지 않습니다.
- **G2 전체 Gate HOLD 유지**. 기존 공개 정적 가상 시안에 한정합니다.

### 반복 실행

```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock --ignore-scripts playwright-core
CHROME_BIN=/usr/bin/google-chrome node tests/g3-15-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-16-browser-qa.cjs
```

GitHub Actions 경로: `.github/workflows/g3-16-browser-qa.yml`.
