/**
 * index.js - 진입점 only. 비즈니스 로직 금지.
 *
 * 환경변수를 검증하고, 각 모듈을 순차 호출하여 전체 파이프라인을 실행한다.
 * fetch → deduplicate → filter → evaluate → mail
 */

import dotenv from 'dotenv';
import { fetchAllServiceBids } from './fetcher.js';
import { filterBids } from './filter.js';
import { evaluateBids } from './evaluator.js';
import { sendMail } from './mailer.js';
import { deduplicateBids, parseKeywords } from './utils.js';

dotenv.config();

/**
 * 필수 환경변수를 검증한다. 누락 시 명확한 에러로 종료한다.
 * @returns {Object} 검증된 환경변수 모음
 */
function validateEnv() {
  const required = [
    'G2B_API_KEY',
    'G2B_BASE_URL',
    'ANTHROPIC_API_KEY',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'MAIL_TO',
    'KEYWORDS',
    'INSTRUCTOR_PROFILE',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 누락되었습니다: ${missing.join(', ')}\n.env.example을 참고하여 .env를 작성해주세요.`);
  }

  return {
    g2bApiKey: process.env.G2B_API_KEY,
    g2bBaseUrl: process.env.G2B_BASE_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    claudeModel: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    gmailUser: process.env.GMAIL_USER,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
    mailTo: process.env.MAIL_TO,
    keywords: parseKeywords(process.env.KEYWORDS),
    targetScope: parseKeywords(process.env.TARGET_SCOPE || '기업,공공,대학'),
    minBudget: Number(process.env.MIN_BUDGET) || 20000000,
    deadlineWindowDays: Number(process.env.DEADLINE_WINDOW_DAYS) || 14,
    instructorProfile: process.env.INSTRUCTOR_PROFILE,
  };
}

/**
 * 전체 파이프라인을 실행한다.
 */
async function main() {
  console.log('=== G2B Bid Scout 실행 시작 ===\n');

  // Step 0. 환경변수 검증
  const env = validateEnv();
  console.log(`[config] 키워드: ${env.keywords.join(', ')}`);
  console.log(`[config] 대상 범위: ${env.targetScope.join(', ')}`);
  console.log(`[config] 최소 예산: ${(env.minBudget / 10000).toLocaleString()}만원`);
  console.log(`[config] 마감 윈도우: D-${env.deadlineWindowDays}`);
  console.log(`[config] Claude 모델: ${env.claudeModel}\n`);

  // Step 1. API 호출 (키워드별 PPSSrch 병렬 호출)
  const rawBids = await fetchAllServiceBids(env.g2bApiKey, env.g2bBaseUrl, env.keywords);

  // Step 2. 중복 제거
  const uniqueBids = deduplicateBids(rawBids);
  console.log(`[dedup] 중복 제거: ${rawBids.length} → ${uniqueBids.length}건\n`);

  // Step 3. 1차 필터 (코드)
  const filterResult = filterBids(uniqueBids, {
    keywords: env.keywords,
    targetScope: env.targetScope,
    minBudget: env.minBudget,
    deadlineWindowDays: env.deadlineWindowDays,
  });

  const { mainCandidates, referenceBids, nearMissBids, stats } = filterResult;
  console.log(`\n[pipeline] 메인 후보: ${mainCandidates.length}건, 참고용: ${referenceBids.length}건\n`);

  // Step 4. AI 적합도 평가 (메인 후보가 있을 때만)
  let evaluated = [];
  if (mainCandidates.length > 0) {
    evaluated = await evaluateBids(mainCandidates, {
      apiKey: env.anthropicApiKey,
      model: env.claudeModel,
      instructorProfile: env.instructorProfile,
    });
  } else {
    console.log('[pipeline] 메인 후보 0건 → AI 호출 생략\n');
  }

  // Step 5-7. HTML 메일 빌드 + 발송
  await sendMail(
    { evaluated, referenceBids, nearMissBids, stats },
    {
      gmailUser: env.gmailUser,
      gmailAppPassword: env.gmailAppPassword,
      mailTo: env.mailTo,
    }
  );

  console.log('\n=== G2B Bid Scout 실행 완료 ===');
}

// 실행
main().catch((error) => {
  console.error(`\n[FATAL] ${error.message}`);
  process.exit(1);
});
