# 오후의 정원 — Human Web Design 도입 기록

- 기준점: 2026-11-11 main 0ecd711d63efd56a4e6b8e32a2f551da9821b062 (G3-66).
- 작업: 디자인 검토용 Skill 및 적용 지침만 추가. 기존 HTML, CSS, JS, 꽃 사진, 테스트, 배포 설정은 수정하지 않음.
- 적용: .agents/skills/human-web-design/SKILL.md 를 읽고 최신 G3 QA 문서가 우선하는 범위에서 활용.
- 고정 자산: 메인 "오늘의 꽃 만나기 ↗", 모든 꽃 사진 원본, 적용 중인 사진별 4:5/4:3 등 비율, Pretendard, 사용자 예약→조회→관리자→캘린더 흐름.
- 점검 기준: 장식보다 사진 우선, 불필요한 선택지 감소, 모바일 버튼·입력 가독성, 한국어 위계, Safari 초기 스크롤·키보드 초점.
- 적용 절차: 단일 UI 문제 선정 → 변경/보존 범위 정의 → 기능 브랜치와 전용 QA → 최신 PR HEAD 전체 Chromium/WebKit/axe + 새 QA 성공 → Gate 승인 후 병합/Pages 배포.
- 기존 G2 전체 Gate HOLD와 실서비스/개인정보/결제/계좌 연동 금지 지속.
- QA: 문서 전용 PR이므로 HTML·assets·tests·workflow 경로만 감시하는 G3-66 CI는 실행되지 않을 수 있다. 이 경우 QA 미실행으로 보고. 과거 CI PASS를 새로운 실행으로 주장하지 않는다.
- 실제 iPhone Safari/Instagram 인앱 브라우저 검증은 여전히 별개 미완료 항목.
- 다음 후보: 모바일 화면에서 실제로 중복되거나 동작을 방해하는 안내 한 군데만 선정하여 별도 G3 변경으로 검토.
