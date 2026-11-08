# 오후의 정원 · G3-18 관리자 초기화·캘린더 새로고침 접근성 QA

- 실행일: 2026-11-08 (KST)
- GitHub 기준: `jkd04255/flower-shop-preview` 최신 G3-17 정적 가상 시안 (이전 Actions 중복 실행 개선 PR #9 반영)
- 승인 기록: `docs/G3-17-filter-keyboard-QA.md`, `docs/GitHub-Actions-notification-policy.md`
- **G2 전체 Gate HOLD**, 실고객 정보·실예약·DB/Auth·은행/실계좌·메일/문자·과금·외부 연동 금지.

## 재현 및 최소 개선

기존 소스에서 **실제 가상 데이터 초기화**는 `renderAdminDemo()`로 목록을 갱신하지만, 별도 `role=status` 완료 안내를 제공하지 않습니다. 월간/일간 캘린더의 `calRefresh`, `calDayRefresh`는 버튼 글자만 `✓ 갱신됨`으로 변경하여, 새로고침 완료를 알리는 독립적인 live status 영역이 없습니다.

이에 다음 최소 수정만 적용했습니다.

1. 관리자 초기화 버튼 아래에 `#adminOperationStatus[role=status][aria-live=polite][aria-atomic=true]`를 추가. 초기화 후 "가상 예약 기록을 샘플 4건으로 초기화했습니다. 전체 상태 필터가 선택됐습니다."를 표시합니다.
2. 캘린더에 공통 `#calRefreshStatus[role=status][aria-live=polite][aria-atomic=true]`를 추가. 월간·일간 각각 구분되는 갱신 완료 문구를 표시합니다.
3. 메시지가 비어 있을 때만 CSS `:empty`로 숨겨 기존 시안의 기본 디자인과 공간을 유지하고, 메시지 이후에는 현재 기존 서체와 본문 스타일로 표시합니다.
4. 새로고침 버튼의 기존 문구 갱신, 키보드 초점, 캘린더 상태 필터, 저장 복원, 가상 정원 정책은 그대로 보존합니다.
5. **화면낭독기를 실제 구동한 것은 아니므로** ARIA 속성을 실제 DOM에 노출했고 live region 문구를 갱신한다는 사실까지만 확인했습니다. 보조기술의 실제 발화는 별도 검증이 필요합니다.

## 실행 환경 및 결과

| 검사 | 결과 | 방법 |
|---|---|---|
| G3-12 합성 저장·복원/정원 | **31/31 PASS** | `tests/g3-12-synthetic-qa.cjs` |
| G3-13·15 전체 JS 합성 DOM 통합 | **34/34 PASS** | `tests/g3-13-integrated-qa.cjs` |
| G3-14 예약 폼 접근성 합성 DOM | **38/38 PASS** | `tests/g3-14-form-a11y-qa.cjs` |
| G3-15 실제 Chrome 전체 예약 흐름 | **14/14 PASS** | `tests/g3-15-browser-qa.cjs` |
| G3-16 실제 Chrome 두 탭·Tab | **7/7 PASS** | `tests/g3-16-browser-qa.cjs` |
| G3-17 실제 Chrome 필터·역탭·다중 탭 | **10/10 PASS** | `tests/g3-17-browser-qa.cjs` |
| **G3-18 실제 Chrome 완료 안내·키보드** | **14/14 PASS** | `tests/g3-18-browser-qa.cjs` (이전 G3-17 10개 + 신규 4개 검증) |
| 인라인 JavaScript 구문 | **3/3 PASS** | `index.html` 변경 브랜치 구문 검사 |
| 실기기 iPhone·Android 및 VoiceOver/TalkBack | **미실행** | 실행 장비·사용자 환경 접근 없음 |
| 실제 은행·예약·서버·인증·개인정보·외부 API | **미구현·미검증** | G2 전체 Gate HOLD, 승인 범위 밖 |

### G3-18의 실제 Chromium 추가 4개 검증

- 월간 달력 새로고침 `role=status`/live 안내 표시 후 `#calRefresh` 버튼에 키보드 초점 유지.
- 일간 달력 새로고침 live 안내, `#calDayRefresh` 버튼에 초점 유지, Shift+Tab→Tab으로 이전/현재 버튼 이동 가능.
- 가상 예약 기록 초기화 시 `#adminOperationStatus` 안내, 샘플 4건과 버튼 초점 유지.
- 기존 관리자 상세 `aria-live=polite`와 새 상태 영역이 중복 노드 없이 존재하는지 확인.

**증거:** [GitHub Actions G3-18 성공 run #42450392883](https://github.com/jkd04255/flower-shop-preview/actions/runs/42450392883). 기존 중복 검사 방지 정책대로 **PR에서 통합 워크플로 1개**만 자동 실행되며, 모든 단계 success.

### 실제 브라우저 vs 공개 시안/실기기 구분

GitHub Actions의 실제 Chrome은 해당 기능 브랜치에 체크아웃된 **전체 `index.html` 및 저장소 자산**을 Node localhost HTTP 서버로 제공해 UI 버튼을 클릭하고 포커스·DOM 상태를 확인했습니다. 공개 GitHub Pages에서는 배포 반영 후 **읽기 전용 버전 확인만** 진행합니다. 실제 iPhone/Android·VoiceOver/TalkBack 검증 또는 공개 사이트 전체 예약 버튼의 실사용 QA로 포장하지 않습니다.

### 재현

```bash
node tests/g3-12-synthetic-qa.cjs
node tests/g3-13-integrated-qa.cjs
node tests/g3-14-form-a11y-qa.cjs
npm install --no-save --no-package-lock --ignore-scripts playwright-core
CHROME_BIN=/usr/bin/google-chrome node tests/g3-15-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-16-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-17-browser-qa.cjs
CHROME_BIN=/usr/bin/google-chrome node tests/g3-18-browser-qa.cjs
```

## 변경 파일과 Gate

- `index.html` — 기존 기능을 보존한 완료 상태 안내 추가 및 footer G3-18 버전 갱신.
- `tests/g3-18-browser-qa.cjs` — 실제 Chromium 테스트 14건.
- `.github/workflows/g3-17-browser-qa.yml` — 기존 단일 자동 통합 검사에 G3-18 브라우저 QA를 추가, 중복 실행 정책 보존.
- 본 보고서.

G2 전체 Gate **HOLD** 유지. 기존 공개 정적 가상 시안만 승인된 상태이며, 운영용 데이터/거래 기능은 추가하지 않았습니다.
