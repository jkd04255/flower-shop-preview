# 오후의 정원 G3-19 — 모바일 가독성·빈 캘린더 접근성 QA

- 기준: G3-18 `main` 커밋 `c7ca2e1649a0abbbbd63383741b92582dd5631db`; 기존 G3-12~18 QA, 단일 GitHub Actions 운영 정책 유지.
- 수정 범위: 기존 공개 GitHub Pages의 합성 꽃집 예약 시안만. G2 전체 Gate **HOLD**.
- 실고객 정보·실예약·실계좌/은행·DB/Auth·문자·메일·과금·외부 API 연동을 추가하지 않음.

## 변경 전 증거 및 원인

1. **모바일 상태 글자가 작음:** 실제 Chromium 320px에서 `#calendarDemo .cal-timeline-state`가 **9px**, 상세 열기 안내 `.cal-fold-indicator`가 **10px**으로 계산됨. 페이지 전체의 가로 넘침은 0px이어서 화면 폭 문제가 아닌 작은 타이포그래피 문제로 확인. [G3-19 수정 전 실패 run #42451134623](https://github.com/jkd04255/flower-shop-preview/actions/runs/42451134623).
2. **예약 0건 안내가 늦게 보임:** `renderCalendarDay()`가 11:00~20:00의 시간 행 10개를 먼저 생성한 후 빈 목록 문구를 마지막에 추가하고 있었음. 캘린더의 시간표를 지나 한참 스크롤해야 예약 없음 안내에 접근 가능한 구조. 해당 문구 자체에 `role=status`와 `aria-live`도 없음.
3. **테스트 시작 화면 오류와 구별:** 첫 브라우저 QA에서 일간 화면에서 월간 화면으로 복귀하지 않고 월간 컨테이너를 기다리는 **테스트의 초기 조건 문제**가 발생. 테스트를 보정하고 다시 실행해 위 9/10px 문제를 실제 Chrome에서 재현함. [초기 테스트 run #42450970407](https://github.com/jkd04255/flower-shop-preview/actions/runs/42450970407).

## 최소 수정

- `@media(max-width:440px)`에서 캘린더 상태 배지 및 상세 안내를 **11px**, line-height **1.4**로 보완. 상품/카드/월간·일간 캘린더/전체 스타일은 보존.
- 빈 날짜 및 선택한 필터에 결과가 없는 경우에만 달력의 시간표 **앞**에 빈 상태 메시지 `#calEmptyStatus`를 표시. `role=status`, `aria-live=polite`, `aria-atomic=true` 지정. 결과가 있으면 숨김 처리.
- 기존 시간 행 10개, 예약 타임라인, 키보드 포커스·ARIA 필터 상태·월간/일간 이동, 상태별 카운트, 가상 정원 3건, 데이터 최대 500건 및 이전 입금·관리자 흐름은 전부 유지.
- 새로운 이미지/서버/API/인증/과금·실제 거래 기능 없음.

## 검증 계획 및 수행 결과

| 검사 | 결과 | 방식 |
|---|---|---|
| G3-12 합성 예약 저장/복원·정원 | **31/31 PASS** | `tests/g3-12-synthetic-qa.cjs` |
| G3-13/15 전체 JS DOM 통합 | **34/34 PASS** | `tests/g3-13-integrated-qa.cjs` |
| G3-14 예약 폼 접근성 | **38/38 PASS** | `tests/g3-14-form-a11y-qa.cjs` |
| G3-15 실제 Chrome 전체 흐름 | **14/14 PASS** | `tests/g3-15-browser-qa.cjs` |
| G3-16 실제 Chrome 두 탭/Tab | **7/7 PASS** | `tests/g3-16-browser-qa.cjs` |
| G3-17 실제 Chrome 필터/초점/ARIA | **10/10 PASS** | `tests/g3-17-browser-qa.cjs` |
| G3-18 실제 Chrome 새로고침/초기화 | **14/14 PASS** | `tests/g3-18-browser-qa.cjs` |
| **G3-19 실제 Chrome 모바일/빈 캘린더** | **최종 검증 중** | `tests/g3-19-browser-qa.cjs` |
| 인라인 JavaScript 문법 | **3/3 PASS** | 실제 HTML 스크립트 파싱 |
| 실기기 iPhone/Android, VoiceOver/TalkBack | **미실행** | Chrome과 별도 장비 및 보조공학 환경 필요 |
| 실제 외부 데이터, DB/Auth, 은행 API/실송금, 서버 동시성 | **미구현·미검증** | G2 전체 Gate HOLD |

### G3-19 Chrome 테스트의 추가 검증 항목

- 320px와 390px에서 상태 배지 및 상세 텍스트의 **계산된 폰트 크기 11px 이상**, 카드 내부 겹침·전체 가로 스크롤 없음.
- 실제 가상 예약 0건인 날짜를 선택할 때 접근 가능한 빈 상태를 **시간표보다 먼저** 표시하고 날짜 제목에 포커스 유지.
- 빈 캘린더의 상태 필터 `aria-pressed`, 0건 표시, 일간 새로고침 후 빈 안내·버튼 초점 유지.
- 320px 관리자 필터·예약 상태 글씨, 가로 스크롤, 가상 초기화 완료 `role=status` 안내 확인.
- 새로운 6개 검사와 이전 G3-18 테스트 14개를 한 실제 Chrome 스크립트에서 실행. 일부 이전 검사와 중복되므로 전부 서로 다른 20개 기능이라는 뜻은 아님.

## 실행 및 증거

단일 PR 자동 검사: `.github/workflows/g3-17-browser-qa.yml`에 G3-19 실제 Chrome 검사를 추가. G3-15·16 과거 검사는 수동 실행으로 보존. 실패·새 커밋 취소 등 중복 알림 방지 정책 보존.

최종 GitHub Actions: [G3-19 CI run #42451282924](https://github.com/jkd04255/flower-shop-preview/actions/runs/42451282924) — **결과 확인 중**.

```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock --ignore-scripts playwright-core
CHROME_BIN=/usr/bin/google-chrome node tests/g3-15-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-16-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-17-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-18-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-19-browser-qa.cjs
```

**범위 구분:** GitHub-hosted 실제 Chromium은 GitHub 체크아웃의 정적 HTML/사진/CSS를 localhost로 제공해 버튼·레이아웃·초점을 시험했습니다. 기존 공개 GitHub Pages는 배포 후 **읽기 전용 버전 확인**만 하며, 실기기·스크린리더 사용 경험을 검증했다고 주장하지 않습니다.

G2 전체 Gate **HOLD** 유지.
