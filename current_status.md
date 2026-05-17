# current_status.md - 세션 메모리

> 새 세션 시작 시 이 파일을 가장 먼저 읽고, 마지막 세션이 어디서 끝났는지 확인한다.
> 작업 종료 시 반드시 이 파일을 업데이트한다.

---

## 📌 프로젝트 한 줄 요약

나라장터 입찰공고를 자동 수집·큐레이션해 매주 월요일 17시 KST에 Gmail로 발송하는 봇. Node.js + GitHub Actions + Claude Haiku.

---

## 🗓 최근 업데이트

**2026-05-17 (1차 세션)**

### [완료된 작업]
- ✅ PRD.md v0.2 확정
- ✅ CLAUDE.md v0.1 작성
- ✅ README.md v0.1 작성
- ✅ current_status.md v0.1 작성

**2026-05-17 (2차 세션)**

### [완료된 작업]
- ✅ `package.json` 초기화 (name: g2b-bid-scout, type: module)
  - 의존성: @anthropic-ai/sdk, nodemailer, dotenv, axios
  - 스크립트: start, test:fetch, test:filter, test:mail
- ✅ `.env.example` 작성 (11개 환경변수)
- ✅ `.gitignore` 보완 (.DS_Store 추가)
- ✅ `src/utils.js` 구현 (순수 헬퍼 8개 함수)
  - getTodayKST, parseDate, calcDday, isNewBid, deduplicateBids, formatPrice, getTodayString, parseKeywords
- ✅ `src/fetcher.js` 구현
  - 페이징 수집, 9개 필드 추출, 3회 재시도, 단독 실행 테스트 지원
- ✅ `src/filter.js` 구현
  - 4단계 필터(마감 D-14, 키워드 OR, 예산 분기, 대상 범위 OR)
  - 단계별 통계, 아까운 공고 선정(최대 3건), 더미 데이터 테스트 지원
- ✅ `src/evaluator.js` 구현
  - Claude API 배치 호출, 30건 분할, JSON 파싱(3가지 방식), 1회 재시도, 폴백
  - 정렬: 적합도(상>중>하) → 마감 임박 순
- ✅ `src/mailer.js` 구현
  - HTML 메일 빌드 (인라인 CSS, WOWD.LAB 브랜드 컬러, 모바일 대응)
  - 1건 이상 케이스: 적합도별 그룹핑 + 카드 + 참고용 섹션
  - 0건 케이스: 통계 + 아까운 공고 미리보기
  - Gmail SMTP 발송, 더미 데이터 테스트 지원
- ✅ `src/index.js` 구현 (진입점)
  - 환경변수 검증 → fetch → dedup → filter → evaluate → mail
- ✅ `.github/workflows/weekly.yml` 작성
  - cron: 매주 월요일 KST 17:00 (UTC 08:00)
  - workflow_dispatch로 수동 실행 허용

**2026-05-17 (3차 세션)**

### [완료된 작업]
- ✅ API Base URL 수정: `/ad/BidPublicInfoService` 경로 확정
- ✅ API 응답 구조 검증 완료
  - `presmptPrce`: **원 단위** 확인 (60909091 = 약 6,091만원)
  - `bidNtceDtlUrl`: 응답에 항상 포함 확인
  - `ntceKindNm`: "등록공고", "재공고", "변경공고" 등으로 표기 확인
  - `inqryBgnDt`/`inqryEndDt` 필수 파라미터 확인 (형식: YYYYMMDDHHMM)
- ✅ API 수집 최적화
  - `numOfRows`: 100 → 999 (API 최대값)
  - 조회 기간: 28일 → 14일
  - 페이지 병렬 호출 적용 (5페이지 동시)
- ✅ 필터 정책 변경: 키워드 매칭 공고 전부 AI 평가 대상
  - 예산/대상 범위는 탈락이 아닌 `⚠️ 태그`로 표시
- ✅ 메일 디자인 전면 리뉴얼
  - 요약 바 (A적합/B검토/C참고/긴급 뱃지)
  - 카드 디자인 (적합도·긴급도 컬러 뱃지, AI 한 줄 평 악센트 바)
  - 0건 케이스: 필터링 퍼널 시각화 + 키워드별 히트 바 차트
- ✅ 전체 파이프라인 통합 테스트 성공 (실제 API → AI 평가 → 메일 발송)
- ✅ 문서 업데이트: CLAUDE.md v0.3, PRD.md v0.3, README.md, current_status.md

**2026-05-17 (4차 세션)**

### [완료된 작업]
- ✅ API 문서 분석: `조달청_OpenAPI참고자료_나라장터_입찰공고정보서비스_1.2.docx`
- ✅ 엔드포인트 전환: `getBidPblancListInfoServc` → `getBidPblancListInfoServcPPSSrch`
  - `bidNtceNm` 부분 매칭 검색 지원 → 키워드별 병렬 호출로 수집량 99.9% 감소
  - 8,332건 → **11건** (API 3회 호출)
- ✅ 문서 최종 업데이트: CLAUDE.md v0.4, PRD.md v0.4, README.md, current_status.md

### [진행 중 작업]
- (없음)

### [다음 단계]
1. ⏭ GitHub Secrets 등록 후 Actions 수동 실행 테스트
2. ⏭ 4주 운영 후 성공 기준 검증 (PRD 섹션 10)
3. ⏭ v1.1 검토: 키워드 유사어 사전, 정정공고 자동 매칭

### [미결정 이슈]
- (없음 — PPSSrch 전환으로 기존 API 제약 해소됨)

---

## 📂 파일 상태

| 파일 | 상태 | 버전 | 비고 |
|------|------|------|------|
| PRD.md | ✅ 완료 | v0.4 | 요구사항 확정, PPSSrch 반영 |
| CLAUDE.md | ✅ 완료 | v0.4 | 작업 규칙 정의 |
| README.md | ✅ 완료 | v0.4 | 사용자 가이드 |
| current_status.md | ✅ 완료 | v0.4 | 이 파일 |
| .env.example | ✅ 완료 | v0.2 | 11개 환경변수, Base URL 수정 |
| .gitignore | ✅ 완료 | v0.1 | .DS_Store 추가 |
| package.json | ✅ 완료 | v0.1 | ES Modules, 4개 의존성 |
| src/utils.js | ✅ 완료 | v0.1 | 순수 헬퍼 8개 함수 |
| src/fetcher.js | ✅ 완료 | v0.3 | PPSSrch 키워드별 병렬 호출 |
| src/filter.js | ✅ 완료 | v0.2 | 키워드매칭→전부AI평가+태깅 |
| src/evaluator.js | ✅ 완료 | v0.1 | Claude API 배치 |
| src/mailer.js | ✅ 완료 | v0.2 | 리뉴얼 디자인+발송 |
| src/index.js | ✅ 완료 | v0.1 | 진입점 오케스트레이션 |
| .github/workflows/weekly.yml | ✅ 완료 | v0.1 | 매주 월 KST 17시 |

---

## 🔑 주요 결정 사항 (영구 기록)

세션이 바뀌어도 잊지 말아야 할 결정들:

1. **AI는 의미 판단만 한다**
   - 키워드 매칭, 예산 필터, 마감일 계산은 모두 코드에서 끝낸다
   - AI에는 "강사 프로필 대비 적합도"만 묻는다
   - 이유: 비용 절감 + 정확도 향상

2. **키워드 매칭 공고는 전부 AI 평가 대상**
   - 예산/대상 범위는 탈락이 아닌 태그로 표시 (v0.3 변경)
   - 키워드 매칭 건수가 보통 10건 미만이라 전부 보여주는 게 유리
   - 이유: 강사가 제목이라도 보고 판단할 수 있어야 함

3. **0건일 때도 메일을 보낸다 (봇 침묵 방지)**
   - 전체 수집 / 단계별 필터 / 키워드별 히트 통계 포함
   - 아까운 공고 미리보기 최대 3건 (탈락 사유 자동 표시)
   - 이유: 강사가 "왜 0건인지" 납득할 수 있어야 봇을 신뢰

4. **수집은 월요일 1회만**
   - 매일 수집해서 누적하는 방식 안 씀 (저장소 없음)
   - 마감 D-14 윈도우라 주 1회로도 누락 없음

5. **다른 강사 이식성 우선**
   - 모든 개인 설정은 `.env` (또는 GitHub Secrets)로
   - Teddy 전용 분기 로직 절대 금지

---

## 🚨 주의 사항

- `.env`는 절대 커밋 금지 (`.gitignore`에 포함)
- Gmail 앱 비밀번호 공백 제거 후 입력
- 공공데이터 API 키는 **디코딩 키** 사용 (인코딩 키 X)
- Claude 모델은 `claude-haiku-4-5` (환경변수 `CLAUDE_MODEL`로 변경 가능)

---

## 📊 다음 세션 시작 시 체크리스트

새 세션을 시작하면 다음을 순서대로:

1. 이 파일(`current_status.md`) 읽기
2. `CLAUDE.md` 작업 규칙 확인
3. "[다음 단계]"의 1번 항목부터 시작
4. 모르겠으면 PRD.md 해당 섹션 참조

---

## 변경 이력

| 버전 | 일자 | 변경 |
|------|------|------|
| v0.1 | 2026-05-17 | 초안. PRD/CLAUDE/README 완료 시점 스냅샷 |
| v0.2 | 2026-05-17 | 전체 코드 구현 완료. 테스트 단계 진입 |
| v0.3 | 2026-05-17 | API 검증·최적화 완료. 필터 정책 변경. 메일 디자인 리뉴얼. 문서 업데이트 |
| v0.4 | 2026-05-17 | PPSSrch 엔드포인트 전환. 수집량 99.9% 감소. 문서 최종 업데이트 |
