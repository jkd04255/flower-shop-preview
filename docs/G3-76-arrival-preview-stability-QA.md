# G3-76 · 최근 입고 고객 미리보기 재렌더링 안정화 / 비동기 사진 QA

## 기준
- 최신 main: `3800fe208235499158b5ea5490ac1db6085d24f5` (G3-75).
- GitHub Pages 배포: Actions #43177229197 성공, 정확한 main 커밋 일치.
- iPad Safari 사용자 제공 기존 화면의 가로 분할·예약 안내 글자 압축 문제는 G3-75에서 미리보기 iframe 한정으로 보정됨.
- G2 전체 Gate HOLD, 실제 iPhone Safari 및 Instagram WebView 실기기 QA 미확인 유지.

## 결함 원인 및 제한된 수정
- `assets/owner-preview.js`는 G3-75부터 최근 입고 입력 초안을 받을 때마다 `#arrivalList.replaceChildren(...)`로 **기존 꽃 이름·사진 요소까지 전부 제거 후 재생성**했음. 이는 반복 입력 시 같은 사진을 다시 할당하고 이미지 로딩 상태 및 iframe 내부 스크롤 앵커를 불필요하게 무효화할 수 있음.
- G3-76에서는 안전한 `data-owner-arrival-id`별 기존 DOM/사진 요소를 **유지**하면서 변경된 텍스트와 `src`만 수정함. 순서 또는 개수가 바뀐 경우에만 DOM을 추가·이동·삭제하며, 변경이 없으면 목록 구조를 건드리지 않음.
- 최근 입고 0건 빈 상태도 불필요하게 제거·재생성하지 않음.
- 0→1, 3→0, 삭제/복구, 사진 교체 및 원본 사진 반환을 포함한 기존 합성 입고 모델은 유지. 문의 전용 소식을 판매 예약 상품으로 바꾸지 않음.
- `owner-studio.js`, `owner-studio.css`, `owner-studio.html`, `index.html`과 원본 사진은 수정하지 않음. 기존 사진 선택 경합 방지(`draftEpoch`, `photoRequests`, 티켓 무효화) 코드는 검증만 추가.

## 신규 Chromium/WebKit/axe 회귀
- `tests/g3-76-arrival-preview-stability-qa.cjs`: 같은 입고 사진/행 DOM을 8회 연속 입력 후에도 재사용하는지, iframe 내부와 좌측 편집 패널의 스크롤이 독립 유지되는지 확인.
- 실제 FileReader를 지연된 callback으로 감싸 두 선택 파일의 **완료 순서를 뒤집어** 마지막 선택만 적용되는지 확인. 사진 복원·삭제 후 undo·초기화 후에 도착한 오래된 callback이 화면을 오염시키지 않는지 확인.
- 최근 입고 3→0건, 0건 빈 상태의 재렌더링, 최근 삭제 취소/초기화, 독립 고객 페이지 원본 불변, iPad 가로 화면과 320·390 모바일 가로 넘침 방지, WCAG 2.1 AA axe 검사.
- 전체 통합 워크플로에서 G3-69~75 기존 테스트 및 고객 예약·관리자·캘린더 회귀를 **삭제하지 않고 그대로 유지**.

## 게이트
- PR은 최신 정확한 HEAD의 전체 Chromium/WebKit/axe 회귀와 신규 테스트가 모두 성공한 경우에만 main에 병합한다.
- 배포 시 동일한 병합 main SHA에 대한 Pages build/report/deploy 성공과 실제 배포 URL 확인.
- G2 전체 HOLD, 실서비스 로그인·영속 저장·실예약/결제/사진 서버 업로드·개인정보 저장/연동 금지 유지.
- Linux WebKit은 실제 iPhone Safari/Instagram WebView 실기기 검증이 아님.
