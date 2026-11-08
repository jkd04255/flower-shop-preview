# 오후의 정원 G3-17 · 실제 Chromium 상태 필터, 역방향 Tab, 초기화 및 동기화 QA

- 테스트 날짜: 2026-11-08 (KST).
- 기준선: G3-16 메인 커밋 `6effa9b329ea83d4dad8c8ff57ac9416842d0084`.
- 이전 기록: `docs/G3-16-keyboard-multitab-QA.md`; 승인된 G3-15·16 실제 Chromium 검사, G3-12·13·14 합성 회귀 유지.
- 범위: `jkd04255/flower-shop-preview`의 **기존 정적 가상 시안**만. G2 전체 Gate **HOLD** 유지. 실고객 데이터/실예약/실계좌·은행/API/DB/Auth/문자·이메일·과금 연동 금지.

## 브라우저에서 재현한 문제

1. G3-16 기존 관리자 상태 필터에서 `pending` 필터를 선택하고 `DEMO-001` 카드에 초점을 둔 뒤, 다른 탭에서 `DEMO-001`을 가상 입금 확인 및 수동 확정하면 목록에서 사라진 원래 카드 대신 남은 `DEMO-002` 카드에 초점이 복원됨 — **정상**.
2. 이어 `DEMO-002`도 다른 탭에서 합성 데이터의 유효한 `confirmed + verified`로 바꾸면, `pending` 필터의 결과는 **0건**이 됨. 마지막 카드가 DOM에서 제거되는 순간 기존 fallback은 첫 번째 카드만 찾고, 아무 카드도 없어 **초점이 문서에서 이탈하는 오류를 실제 Chrome에서 실패로 재현**함. [G3-17 최초 실패 run #42433585484](https://github.com/jkd04255/flower-shop-preview/actions/runs/42433585484).
3. 상태 필터가 빈 결과를 렌더링할 때 안내 `p.admin-empty`에는 `role=status`가 없어 결과 없음 상태를 보조기술에 알리는 명시적 상태 역할이 없었음.

## 최소 수정

- `window.storage` 핸들러에서 다른 탭으로부터 관리자 목록을 갱신할 때, 기존 카드에 대응하는 새 DOM을 최우선으로 초점 복원.
- 해당 카드가 필터에 남아 있지 않으면 다음 카드로, 필터 결과가 **0건**이면 `#adminDemo .admin-filter[aria-pressed="true"]`로 초점 복원. 필터 버튼도 없을 경우 안전한 관리자 제목으로 복원.
- 빈 필터 안내 문구에 `role=status` 설정. 기존 `#adminDetail`의 `aria-live=polite`, 기존 `aria-pressed`, `#calDetails`의 `aria-live=polite`, 캘린더 region 등은 유지.
- 수정된 컴포넌트 이외 사진, 상품, 가격, 가상 예약 생성/입금, 관리자 수동 확정, 상태별 캘린더, 정원 3건, 합성 기록 최대 500건, 기기별 반응형 디자인 등은 변경하지 않음.

## 검증 결과

| 검사 | 결과 | 조건 |
|---|---|---|
| G3-12 저장·복원·정원 합성 회귀 | **31/31 PASS** | `tests/g3-12-synthetic-qa.cjs` |
| G3-13 + G3-15 합성 DOM 통합 회귀 | **34/34 PASS** | `tests/g3-13-integrated-qa.cjs` |
| G3-14 예약 폼 합성 접근성 회귀 | **38/38 PASS** | `tests/g3-14-form-a11y-qa.cjs` |
| G3-15 실제 Chromium 홈/예약/관리자 전체 흐름 | **14/14 PASS** | 320·390·768·1280px 로컬 사이트 및 공개 Pages 읽기 전용 홈/버전 표시 포함 |
| G3-16 실제 Chromium 멀티탭/Tab | **7/7 PASS** | `tests/g3-16-browser-qa.cjs` |
| **G3-17 실제 Chromium 필터·Tab/Shift+Tab·초기화·ARIA** | **10/10 PASS** | `tests/g3-17-browser-qa.cjs` |
| HTML 내 메인 포함 스크립트 구문 | **3개 통과** | 변경 HTML 정적 구문 검사 |
| 실기기 iOS/Android·VoiceOver/TalkBack | **미실행** | GitHub Actions Chrome으로 대체할 수 없음 |
| 실제 예약·은행 거래·서버 동시성·실고객 데이터 | **미실행 / 금지** | G2 전체 Gate HOLD |

### 실제 Chromium에서 확인한 G3-17 열 가지

1. 관리자 pending 필터의 가상 요청 2건, `aria-pressed` 및 상세 안내.
2. 관리자 필터 Shift+Tab → Tab 이동 순서.
3. 다른 탭의 실제 관리자 수동 확정 시 현재 필터에서 제거된 카드의 초점을 남은 카드로 복원.
4. 다른 탭에서 마지막 필터 결과가 사라져도 현재 선택된 필터 버튼으로 초점 복원, 빈 목록 `role=status`.
5. 로컬 관리자 가상 데이터 초기화 후 전체 목록, 전체 필터 및 초기화 버튼 초점 유지.
6. 캘린더 예약 확정 필터 `aria-pressed`, 건수, 레이블 연결된 `role=region`, 날짜 상세 `aria-live`.
7. 캘린더 상태 필터 Shift+Tab → Tab 이동.
8. 다른 탭의 상태 변경으로 현재 캘린더 필터 항목이 사라져도 날짜 제목으로 초점 복원.
9. 일간→월간 복귀 시 보이는 날짜 버튼에 초점 유지.
10. 두 탭에서 앱 JavaScript 런타임 오류 없음.

### 증거와 이전 실패

- 최초 빈 목록 초점 이탈: [실패 run #42433585484](https://github.com/jkd04255/flower-shop-preview/actions/runs/42433585484).
- 수정 후 캘린더 예약 1건일 때 `1건의 예약 일정`으로 표기되는 기존 정상 문구를 테스트가 `1건 표시`만 허용해 실패. **서비스 문제가 아니므로** 테스트 패턴만 보정: [run #42433659807](https://github.com/jkd04255/flower-shop-preview/actions/runs/42433659807).
- 이전 G3-15 브라우저 smoke의 허용 버전 정규식을 G3-16·17까지 확장하여 실제 공개 G3-16의 읽기 전용 확인을 부당하게 미검증으로 표시하지 않게 테스트 보정.
- **최종 GitHub Actions 모든 단계 PASS:** [run #42433832566](https://github.com/jkd04255/flower-shop-preview/actions/runs/42433832566). G3-15 14건(공개 사이트 읽기 전용 smoke 포함), G3-16 7건, G3-17 10건, 합성 31/34/38건 통과.

## 실행 환경의 범위

Chromium 전체 상호작용은 GitHub Actions에서 **기능 브랜치의 실제 HTML·CSS·사진을 localhost HTTP 서버로 제공**하여 시험함. 사용자에게 공개된 GitHub Pages에서는 **홈 화면 및 버전 표시만 읽기 전용으로** 확인하며, 실제 고객·거래·예약 데이터를 입력하지 않음. 실제 iPhone/Android·스크린리더와는 분명히 다름.

반복 실행:
```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock --ignore-scripts playwright-core
CHROME_BIN=/usr/bin/google-chrome node tests/g3-15-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-16-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-17-browser-qa.cjs
```

GitHub Actions: `.github/workflows/g3-17-browser-qa.yml`.

**전체 G2 Gate HOLD**. 이 작업은 공개된 가상 시안의 회귀/접근성 개선이지 실서비스 배포 승인이나 실예약/외부결제 구현이 아님.
