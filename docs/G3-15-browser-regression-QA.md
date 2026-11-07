# 오후의 정원 · G3-15 모바일/키보드·예약/입금/관리자 회귀 QA

- 기준선: `main` G3-14 커밋 `ae73481f1cf41ee0a3ac509f657f3b252b26f0bd`
- 전 단계: `docs/G3-14-reservation-form-QA.md`; G3-12/13/14 합성 검사 보존
- 공개 도메인과 소스: `jkd04255.github.io/flower-shop-preview`, `jkd04255/flower-shop-preview`
- **G2 전체 Gate HOLD**, 합성 데이터로 만든 정적 시연에 한정. 실고객 예약/실거래/은행·DB/Auth·메일·문자·과금·외부 서비스 연결 금지.

## 재현 문제와 최소 수정

- **재현:** G3-14의 일간 캘린더에서 주간 날짜 버튼을 클릭하면 `calendarSelectDay()`가 전체 `calWeekStrip`을 다시 생성합니다. 기존 버튼이 문서에서 제거되지만 기존 `document.activeElement`는 제거된 버튼을 가리키며 포커스가 끊어집니다. 이 문제를 기존 `tests/g3-13-integrated-qa.cjs`의 전체 메인 JS + 합성 DOM에서 수정 전 **실패로 재현**했습니다.
- **수정:** 주간 버튼에 합성 날짜 `data-date`를 지정하고 클릭 후 재렌더링된 동일 날짜의 버튼을 찾아 `focus({preventScroll:true})`로 초점을 복원합니다. 월↔일 전환, 이전/다음 날짜 버튼, 예약 상태/입금 확인 초점 규칙은 변경하지 않습니다.
- **미변경:** 꽃다발·사진·가격·가상 계좌 및 입금 안내, 고객 예약·폼 유효성, 관리자 수동 확정/거절/수령 처리, 시간당 3건 제한, 500건 합성 저장·복원, G3-11 모바일 CSS, 접근성 기존 개선.

## 실행 및 증거

| 검증 종류 | 결과 | 의미 |
|---|---|---|
| 수정 전 원본 JS의 주간 날짜 클릭 초점 | **실패 재현** | 전체 메인 JS + 합성 DOM 테스트에서 `document.activeElement.isConnected === false` |
| G3-12 저장·복원/정원 합성 회귀 | **31/31 PASS** | 실제 변경 브랜치 함수 기반 |
| G3-13 통합·G3-15 새 주간 초점 합성 회귀 | **34/34 PASS** | 전체 메인 JS + 합성 DOM; 원본 32건에 G3-15 2건 추가 |
| G3-14 예약 폼·가상 송금 안내 접근성 합성 회귀 | **38/38 PASS** | 전체 메인 JS + 합성 DOM |
| 인라인 스크립트 구문 | **3/3 PASS** | JS 구문 파싱 |
| 실제 Chromium 브랜치 HTML/모바일/예약/입금/관리자 QA | **PASS: 실제 Chromium 14/14 항목** | `tests/g3-15-browser-qa.cjs`; 가상 HTML을 localhost 웹서버로 제공하여 실제 Chromium으로 누르고 포커스/가로 넘침 확인. 공개 URL에 예약·입금 입력은 하지 않음 |
| 실제 GitHub Pages 웹페이지 | **PASS: 공개 G3-14 Pages 읽기 전용 홈·버전 확인** | 공개 URL의 제공 버전/기본 홈 화면만 읽기 |
| 실제 휴대전화/iOS VoiceOver/Android TalkBack | **미실행** | 실제 실기기와 보조공학 환경 접근 불가 |
| 실제 거래·인증·DB·결제·메일/문자·서버 동시성 | **미구현·미검증** | G2 전체 Gate HOLD |

### 브라우저 QA 실행 방식

`tests/g3-15-browser-qa.cjs`는 실제 GitHub 체크아웃의 `index.html` 및 같은 저장소 사진·CSS를 **Node localhost HTTP 서버**로 제공한 뒤 Chromium에서 320·390·768·1280px의 홈/예약 폼을 여는 방식입니다. 390px에서는 **가상** 예약 오류→날짜 재선택→예약 성공→가상 송금 표시→관리자 수동 확인→캘린더 상태 변경 및 주간 날짜 초점→저장·복원을 검증합니다. 공개 GitHub Pages 사이트에서는 홈·버전 문자열만 **읽기 전용** 확인합니다. localhost 브랜치 페이지의 통합 검사와 공개 배포 URL에서의 실제 조작은 서로 동일하지 않습니다.

반복 실행:
```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock playwright-core
CHROME_BIN=/usr/bin/google-chrome node tests/g3-15-browser-qa.cjs
```

GitHub Actions: `.github/workflows/g3-15-browser-qa.yml`. 공개 저장소의 표준 GitHub-hosted 실행 환경만 사용하고 비밀키·실고객 데이터·실은행 시스템·실예약 엔드포인트를 사용하지 않습니다.

## GitHub Actions 실제 브라우저 실행 증적

- PR #6 기능 브랜치 테스트 실행: [Actions run #42400944086](https://github.com/jkd04255/flower-shop-preview/actions/runs/42400944086) — **job chromium success**, 모든 단계 완료.
- 실제 GitHub 체크아웃의 `index.html`과 저장소 상대경로 자산을 Node HTTP 서버에서 제공한 뒤 **Chromium에서 직접 클릭/키보드 포커스/렌더링**을 검사한 결과 **14/14 PASS**.
- 320·390·768·1280px에서 홈+예약 폼 가로 스크롤 및 메인 앱 JavaScript 오류 없음.
- 390px에서 예약 입력 오류/날짜 재선택/예약 완료·결과 포커스/가상 송금 안내·포커스/관리자 입금 체크·수동 확정/일간·월간 캘린더/주간 날짜 새 버튼 포커스/수령 전·완료/새로고침 후 상태 복원까지 실제 Chromium에서 통과.
- 공개 GitHub Pages `https://jkd04255.github.io/flower-shop-preview/`에서 **읽기 전용 홈페이지 및 G3-14 버전 표기**를 실제 Chromium으로 확인. 이 항목은 localhost 브랜치의 전체 상호작용과 별개로 기록.
- Actions에서 `g3-15-chromium-evidence` 스크린샷 아티팩트 업로드 성공(원본 run에 첨부).
- 기존 G3-12 31/31, G3-13+G3-15 합성 34/34, G3-14 38/38도 GitHub Actions에서 다시 PASS.
- **실제 iPhone·Android 단말 테스트, VoiceOver/TalkBack, 공개 사이트 전체에서의 예약 클릭, 실서비스 서버 동시성/인증/송금 등은 여전히 미실행·범위 밖**.

## Gate 및 진행 경계

이번 변경은 기존 공개 가상 GitHub Pages 시안에서 발견된 키보드 초점 1건과 재현 테스트/QA 인프라만 포함합니다. 실제 예약/결제 관리자의 생산 환경 사용·G2 전체 승인·외부 시스템 통합은 진행하지 않습니다. 브라우저 QA 미실행·실패가 있으면 통과했다고 기록하거나 병합을 검증 완료로 판단하지 않습니다.
