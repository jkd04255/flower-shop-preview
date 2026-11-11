# G3-67 · 모바일 매장 안내 운영 정보의 읽기 순서 개선

## 최신 기준 및 적용한 디자인 Skill
- 기준: `main` aa11357215588ec24b26804941c99f600b2b0bd7 (G3-66 뒤에 Human Web Design/Frontend Design Skill 문서만 추가한 커밋)
- `.agents/skills/human-web-design/SKILL.md`, `.agents/skills/frontend-design/SKILL.md`, `docs/HUMAN_WEB_DESIGN_ADOPTION.md` 확인.
- 꽃 사진·Pretendard·기존 편집형 레이아웃, 문구 및 Gate를 그대로 존중합니다.

## 진단과 단일 개선
매장 안내 하단의 운영 정보는 `ADDRESS`, `OPENING HOURS`, `CONTACT`, `PICKUP` 네 행으로 구성된 표입니다. 폭 320~440px에서도 왼쪽 영어 라벨에 32% 폭을 할당하므로, 오른쪽 한국어 설명이 좁은 칸에서 과도하게 줄바꿈되는 소스상의 위험이 있습니다.

### CSS 변경
- 440px 이하 **해당 매장 정보 표만** 각 행의 영어 라벨 위, 한국어 설명 아래인 단일열 편집형 목록으로 표시합니다.
- 행 경계의 기존 머리카락 실선, 색상·서체 계열은 유지하며 새 카드·아이콘·설명·버튼을 추가하지 않습니다.
- HTML `table`, `tr`, `td` 구조, 네 라벨과 모든 내용은 변경하지 않습니다.
- 441px 이상에서는 기존 2열 표 레이아웃이 유지됩니다.
- 꽃 사진·사진별 승인된 종횡비(4:3 포함), **‘오늘의 꽃 만나기 ↗’**, 가상 예약·조회·관리자·캘린더 기능을 보존합니다.

## 신규 브라우저 QA
`tests/g3-67-mobile-store-facts-qa.cjs`를 전체 통합 CI에 추가합니다.
- Chromium/Linux WebKit, 320·390·440·600·768·1280px: 4개 행·8개 셀의 라벨/설명 원문, 모바일 한 열·데스크톱 두 열, 가로 넘침 없음, 폰트 크기, 접근성 트리의 표 노출.
- 기존 매장 안내 가상 예약 조회(1002)와 별도 예약 현황 화면 이동, 합성 예약·localStorage 불변.
- WCAG 2.1 AA axe 위반 0, 실제 스크린샷과 JS 오류 점검.
- 전체 기존 Chromium/WebKit/axe 회귀는 생략·약화하지 않습니다.

## 병합 및 배포 Gate
정확한 최신 PR HEAD에서 **기존 전체 Chromium/WebKit/axe 회귀 + 신규 QA**가 모두 통과한 경우에만 squash 병합합니다. 이후 GitHub Pages 빌드·배포 성공과 최신 `main` SHA 일치를 확인합니다.

**G2 전체 Gate HOLD**, 실예약·실송금·실계좌·결제·개인정보 저장·DB/Auth/SMS/API 실서비스 연동 금지. 실제 iPhone Safari/Instagram WebView 실기기 QA는 **미완료**입니다.
