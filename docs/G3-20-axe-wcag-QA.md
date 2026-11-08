# 오후의 정원 · G3-20 axe-core WCAG 자동 접근성 QA

- 기준선: G3-19 `main` 커밋 `dc237efd7534fc7afefd1daedf04b6111788fc14` (기존 승인된 가상 시안).
- 이전 근거: `docs/G3-19-mobile-empty-calendar-QA.md`, `docs/GitHub-Actions-notification-policy.md`, G3-12~18 QA 기록.
- 실행 환경: `jkd04255/flower-shop-preview` GitHub 체크아웃의 실제 `index.html` 및 자산을 **localhost HTTP 서버**로 띄운 **GitHub-hosted Chromium**. 사용자 개인정보/은행/실예약 데이터 미사용.
- 적용 도구: CI 전용 `axe-core@4.10.3` + `playwright-core`. 실제 앱 번들·런타임에 axe를 포함하지 않음.
- 검사 기준: axe의 `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` 태그 및 `color-contrast` 규칙. axe가 자동 판단할 수 있는 범위에 한함.
- **G2 전체 Gate HOLD**. 실고객 정보·실예약·DB/Auth·실은행·실계좌·메일·문자·결제·과금·외부 연동 금지.

## 검사 화면·상태

실제 Chromium에서 다음 12개 화면/너비 조합을 대상으로 axe를 주입하여 검사했습니다.

| 화면 | 뷰포트 |
|---|---|
| 꽃집 홈 | 390px |
| 가상 예약 폼·입력 오류 | 390px |
| 관리자 전체 목록·입금 전 필터 | 390px |
| 월간 캘린더 | 390px, 320px |
| 일간 캘린더·빈 일정 | 390px, 320px(빈 일정) |
| 관리자 전체 목록 | 320px |
| 가상 예약 폼 | 320px |

실제 선택 항목 수는 홈 1, 예약 3(오류 포함), 관리자 3, 캘린더 5 = **12개 시나리오**입니다. 각 시나리오에서 실제 DOM의 버튼 접근 가능한 이름, 폼 레이블·오류, 선택 상태의 ARIA, 색상 대비 등 해당 WCAG 태그의 axe 규칙을 검사합니다. 별도로 달력에서 Shift+Tab·Tab 후 연결된 요소에 포커스가 남는지 Chromium에서 확인했습니다.

## 발견한 위반과 확인된 수정

**수정 전 axe baseline:** 12개 시나리오 모두 `color-contrast` WCAG 위반이 검출됐습니다. 총 **183개 요소 판정(중복 화면 포함)**, CSS 경로 기준 **78개 대상(서로 다른 기능 78개를 뜻하지 않음)**을 분석했습니다. 검사 결과 ZIP은 [발견용 GitHub Actions](https://github.com/jkd04255/flower-shop-preview/actions/runs/42452278920)에서 확인할 수 있습니다.

실제 측정 예:
- 예약자 안내 `#rLead`: **3.30:1**, 예상 최소 **4.5:1**.
- 관리자 상세 명칭 `dt`: **3.31:1**.
- 주말 달력 날짜 `.cal-number.is-weekend`: **2.32:1**.
- 빈 시간표의 시간 라벨 `.cal-hour-row.is-empty .cal-hour-label`: **2.32:1**.
- 예약 결과와 관리자 작은 문구 다수는 4.5:1 미만이었습니다.

**수정:**
1. 기존 크림/뮤트 그린 색조와 레이아웃을 유지하며, axe가 실제 위반으로 보고한 **작은 안내 문구의 전경색만 #52614f 중심으로 조정**했습니다. 달력의 별도 주말/오늘 표시를 보존하고, 색상 대비에 영향을 준 시간 라벨·상세 아이콘의 불필요한 불투명도를 보정했습니다.
2. axe의 `aria-prohibited-attr` **판정 보류(incomplete)** 사유로 표시된 `aria-label`이 있는 일반 div 6개(예약 안내, 관리자 통계·목록, 월간 날짜 그룹·상태 범례·일간 개요)에 `role=group`을 부여해 그룹 이름이 보조기술에 의미 있게 제공되도록 보완했습니다. 이 항목은 최초부터 확정된 WCAG 위반으로 집계한 것이 아니라 **별도 보류 사유를 검토해 개선한 것**입니다.
3. 첫 엄격 테스트에서 **홈 예약 설명 1곳·관리자 상세 3곳**이 기존 높은 CSS specificity에 밀려 색상 변경이 적용되지 않은 것을 확인했습니다. 해당 4개 원래 선택자만 더 구체적으로 덮어써 추가 수정했습니다. [첫 엄격 실패 run](https://github.com/jkd04255/flower-shop-preview/actions/runs/42452584558).
4. 나머지 꽃다발/가격/헤더/입금 체험/관리자 수동 확정/가상 예약 정원 3건/기록 500건/월·주·일 캘린더/저장 복원/반응형 배치는 변경하지 않았습니다.

## 최종 검증

**최종 GitHub Actions: [run #42452652620](https://github.com/jkd04255/flower-shop-preview/actions/runs/42452652620) — 모든 단계 SUCCESS.**

| 검사 | 결과 | 테스트 |
|---|---|---|
| G3-20 axe-core WCAG 2.0/2.1 A·AA 12개 시나리오 | **위반 0건, 엄격 게이트 PASS** | `tests/g3-20-axe-qa.cjs`, `AXE_ENFORCE=1` |
| G3-20 실제 Chromium 달력 Tab·Shift+Tab 연결 포커스 | **PASS** | 동일 axe 테스트 |
| G3-12 합성 예약 저장·정원 | **31/31 PASS** | `tests/g3-12-synthetic-qa.cjs` |
| G3-13/15 합성 DOM 예약 통합 | **34/34 PASS** | `tests/g3-13-integrated-qa.cjs` |
| G3-14 예약 폼·입금 안내 접근성 | **38/38 PASS** | `tests/g3-14-form-a11y-qa.cjs` |
| G3-15 실제 Chrome 전체 가상 예약 흐름 | **14/14 PASS** | `tests/g3-15-browser-qa.cjs` |
| G3-16 실제 Chrome 두 탭·키보드 | **7/7 PASS** | `tests/g3-16-browser-qa.cjs` |
| G3-17 실제 Chrome 관리자 필터·초점 | **10/10 PASS** | `tests/g3-17-browser-qa.cjs` |
| G3-18 실제 Chrome 초기화·새로고침 | **14/14 PASS** | `tests/g3-18-browser-qa.cjs` |
| G3-19 실제 Chrome 모바일·빈 캘린더 | **20/20 PASS** | `tests/g3-19-browser-qa.cjs` |
| 메인 HTML 인라인 JS 구문 | **3개 유효** | 변경 소스 정적 구문 검증 |
| 실제 iOS/Android·VoiceOver/TalkBack | **미실행** | 실기기/보조기술 직접 접근 없음 |
| 실데이터, 은행/문자/메일/DB/Auth/서버 동시성 | **미구현·범위 밖** | G2 전체 Gate HOLD |

최종 자동 검사에서 보이는 화면에 대한 **확정 violation은 0건**입니다. 다만 axe의 `incomplete` 항목 중 **배경 사진/복잡한 시각적 대비의 수동 판정이 필요한 color-contrast 항목이 일부 남아 있습니다.** 이를 정상 판정 또는 WCAG 완전 준수로 주장하지 않습니다. 버튼 이름·폼 오류·캘린더 ARIA는 자동 탐지 가능한 룰과 기존 실제 Chrome 상호작용 검사에서 확인했습니다.

## 반복 실행

```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock --ignore-scripts playwright-core axe-core@4.10.3
CHROME_BIN=/usr/bin/google-chrome AXE_ENFORCE=1 node tests/g3-20-axe-qa.cjs
```

기존 G3-15~19 Chrome 스크립트도 단일 GitHub workflow `.github/workflows/g3-17-browser-qa.yml`에서 자동 실행합니다. PR 변경 시 **통합 워크플로 하나만** 실행하고 오래된 실행을 취소하는 기존 중복 메일 완화 정책을 유지합니다. 검사 실패를 성공으로 처리하거나 `continue-on-error`로 우회하지 않습니다. 테스트 결과는 `qa-artifacts/g3-20-axe-results.json`으로 저장되어 GitHub Actions 아티팩트에서 내려받을 수 있습니다.

## 배포와 운영 경계

기능 브랜치에서 실브라우저 테스트 → QA 보고서 → PR → 기존 공개 GitHub Pages 가상 시안에 한정한 병합·배포 확인 순으로 진행했습니다. 공개 GitHub Pages에서는 **읽기 전용 홈/버전 제공 확인만 수행**하며 합성 고객 정보를 실제 공개 URL에 입력하지 않았습니다.

**실제 서비스 전환, 관리자 인증, 계좌·결제·실예약·실알림, 외부 API, 과금, 실고객 데이터 사용은 여전히 모두 미승인(G2 전체 Gate HOLD)입니다.**
