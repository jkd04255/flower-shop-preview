# GitHub Actions 알림/중복 실행 축소 정책

- 적용 범위: `jkd04255/flower-shop-preview`의 **정적 합성 예약 시안 QA**.
- 배경: G3-17에서 `index.html` 변경 하나로 G3-15/16/17의 유사한 QA 워크플로가 중복 실행되어 실패 알림이 여러 건 도착함.
- G2 전체 Gate **HOLD**. 실제 개인정보·DB/Auth·실계좌·은행·메일/SMS·결제·실예약 연동을 변경하지 않음.

## CI 구성

1. `.github/workflows/g3-17-browser-qa.yml` — PR 변경 시 **유일한 자동 QA**. 앱 HTML/에셋, `tests/**`, 워크플로가 바뀌면 가상 데이터 합성 테스트 31+34+38건과 실제 Chromium G3-15(14항목)·G3-16(7항목)·G3-17(10항목)을 한 실행에서 점검.
2. `.github/workflows/g3-15-browser-qa.yml` — 과거 브라우저 QA를 필요할 때 수동으로 실행하는 보관용 워크플로(`workflow_dispatch`).
3. `.github/workflows/g3-16-browser-qa.yml` — 과거 다중 탭 QA를 필요할 때 수동으로 실행(`workflow_dispatch`).
4. 자동 QA의 `concurrency`는 동일 PR의 이전 실행이 끝나기 전에 새 변경이 올라오면 이전 실행을 취소해 테스트 중복 및 낡은 커밋의 실패 알림을 줄임.
5. 성공·실패 여부는 그대로 엄격하게 검사함. 실패를 무시하거나 `continue-on-error`를 설정하지 않음.

## 알림 한계

- **중복 자동 테스트 실행을 줄인 것이지 GitHub의 개인 이메일 알림 설정을 변경한 것은 아님**.
- 실패한 단일 자동 테스트에 대한 이메일은 계속 도착할 수 있음. 메일을 완전히 끄거나 웹으로만 받으려면 계정 소유자가 [GitHub 알림 설정](https://github.com/settings/notifications)의 **System > Actions**에서 `On GitHub` 또는 `Don't notify`를 선택해야 함.
- 오류에 대한 증거는 [GitHub Actions 실행 기록](https://github.com/jkd04255/flower-shop-preview/actions)에서 그대로 확인할 수 있음.

## 확인 사항

- 최신 `index.html` 및 사용자 시안 CSS·사진·가상 결제 체험 코드는 **일절 수정하지 않음**.
- 자동 QA가 모든 이전 테스트 스크립트와 Chromium 시나리오를 계속 실행하는지 확인.
- GitHub PR에서 새 통합 워크플로 **하나의 성공 실행**을 확인한 후 병합.
