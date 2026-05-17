/**
 * evaluator.js - Claude API만. 메일·필터 금지.
 *
 * 1차 필터를 통과한 메인 후보 공고에 대해 Claude API로 적합도를 평가한다.
 * 강사 프로필 대비 상/중/하 + 한 줄 이유를 반환한다.
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

/** 한 번에 평가할 최대 공고 수 */
const MAX_BATCH_SIZE = 30;

/** API 호출 타임아웃 (ms) */
const API_TIMEOUT_MS = 60000;

/** 시스템 프롬프트 */
const SYSTEM_PROMPT = `당신은 기업교육 강사의 입찰공고 적합도를 평가하는 어시스턴트입니다.

강사 프로필:
{INSTRUCTOR_PROFILE}

각 공고에 대해 강사 프로필 대비 적합도를 상/중/하로 평가하고
한 줄 이유를 제시하세요. 키워드 매칭은 이미 완료되었습니다.
의미적 적합성만 판단하세요.`;

/** 유저 프롬프트 */
const USER_PROMPT = `다음은 평가할 공고 목록입니다.
각 공고를 {"bidNtceNo": "...", "score": "상|중|하", "reason": "..."} 형태로 평가하세요.

응답은 JSON 배열만 출력하세요. 다른 설명 금지.

공고 목록:
{BIDS_JSON}`;

/**
 * Claude API를 호출하여 공고 적합도를 평가한다.
 * @param {Object} client - Anthropic 클라이언트
 * @param {string} model - 모델 이름
 * @param {string} instructorProfile - 강사 프로필
 * @param {Array} bids - 평가할 공고 배열
 * @returns {Promise<Array>} 평가 결과 배열 [{bidNtceNo, score, reason}]
 */
async function callClaudeAPI(client, model, instructorProfile, bids) {
  // AI에 전달할 정보만 추출
  const bidsForAI = bids.map((bid) => ({
    bidNtceNo: bid.bidNtceNo,
    bidNtceNm: bid.bidNtceNm,
    ntceInsttNm: bid.ntceInsttNm,
    dminsttNm: bid.dminsttNm,
    presmptPrce: bid.presmptPrce,
    bidClseDt: bid.bidClseDt,
  }));

  const systemPrompt = SYSTEM_PROMPT.replace('{INSTRUCTOR_PROFILE}', instructorProfile);
  const userPrompt = USER_PROMPT.replace('{BIDS_JSON}', JSON.stringify(bidsForAI, null, 2));

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // 텍스트 응답에서 JSON 파싱
  const text = response.content[0]?.text ?? '';
  return parseJsonResponse(text);
}

/**
 * Claude 응답 텍스트에서 JSON 배열을 파싱한다.
 * JSON 모드가 아닌 경우 텍스트에서 JSON 배열을 추출한다.
 * @param {string} text - Claude 응답 텍스트
 * @returns {Array} 파싱된 평가 결과 배열
 */
function parseJsonResponse(text) {
  // 직접 JSON 파싱 시도
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 텍스트에서 JSON 배열 추출 시도
  }

  // 코드 블록 안의 JSON 추출
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 다음 방법 시도
    }
  }

  // 대괄호로 시작하는 JSON 배열 추출
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // 파싱 실패
    }
  }

  throw new Error(`Claude 응답을 JSON으로 파싱할 수 없습니다: ${text.substring(0, 200)}`);
}

/**
 * 메인 후보 공고에 대해 Claude API로 적합도를 평가한다.
 * 30건 초과 시 분할 호출한다. 파싱 실패 시 1회 재시도한다.
 * @param {Array} candidates - 메인 후보 공고 배열
 * @param {Object} options - 옵션
 * @param {string} options.apiKey - Anthropic API 키
 * @param {string} options.model - Claude 모델명
 * @param {string} options.instructorProfile - 강사 프로필
 * @returns {Promise<Array>} 평가 결과가 병합된 공고 배열
 */
export async function evaluateBids(candidates, options) {
  const { apiKey, model, instructorProfile } = options;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 .env에 설정되지 않았습니다.');
  }
  if (!instructorProfile) {
    throw new Error('INSTRUCTOR_PROFILE이 .env에 설정되지 않았습니다.');
  }
  if (candidates.length === 0) {
    console.log('[evaluator] 평가할 후보 0건. AI 호출 생략.');
    return [];
  }

  const client = new Anthropic({ apiKey, timeout: API_TIMEOUT_MS });
  const modelName = model || 'claude-haiku-4-5';

  console.log(`[evaluator] ${candidates.length}건 평가 시작 (모델: ${modelName})`);

  // 30건 단위로 분할
  const batches = [];
  for (let i = 0; i < candidates.length; i += MAX_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + MAX_BATCH_SIZE));
  }

  const allResults = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[evaluator] 배치 ${i + 1}/${batches.length} (${batch.length}건) 호출 중...`);

    let results;
    let retried = false;

    try {
      results = await callClaudeAPI(client, modelName, instructorProfile, batch);
    } catch (error) {
      console.error(`[evaluator] 배치 ${i + 1} 첫 시도 실패: ${error.message}`);
      // 1회 재시도
      try {
        console.log('[evaluator] 1회 재시도...');
        results = await callClaudeAPI(client, modelName, instructorProfile, batch);
        retried = true;
      } catch (retryError) {
        console.error(`[evaluator] 재시도도 실패: ${retryError.message}`);
        // 폴백: 평가 없이 "하"로 기본값 설정
        results = batch.map((bid) => ({
          bidNtceNo: bid.bidNtceNo,
          score: '하',
          reason: 'AI 평가 실패 (수동 확인 필요)',
        }));
      }
    }

    if (retried) {
      console.log(`[evaluator] 배치 ${i + 1} 재시도 성공`);
    }

    allResults.push(...results);
  }

  // 평가 결과를 원본 공고에 병합
  const resultMap = new Map();
  for (const result of allResults) {
    resultMap.set(result.bidNtceNo, result);
  }

  const evaluated = candidates.map((bid) => {
    const evaluation = resultMap.get(bid.bidNtceNo);
    return {
      ...bid,
      aiScore: evaluation?.score ?? '하',
      aiReason: evaluation?.reason ?? 'AI 평가 누락',
    };
  });

  // 정렬: 적합도(상>중>하) → 마감 임박
  const scoreOrder = { '상': 0, '중': 1, '하': 2 };
  evaluated.sort((a, b) => {
    const scoreDiff = (scoreOrder[a.aiScore] ?? 2) - (scoreOrder[b.aiScore] ?? 2);
    if (scoreDiff !== 0) return scoreDiff;
    // 마감일 오름차순
    const dateA = new Date(a.bidClseDt || '9999');
    const dateB = new Date(b.bidClseDt || '9999');
    return dateA - dateB;
  });

  const scoreCounts = { '상': 0, '중': 0, '하': 0 };
  for (const bid of evaluated) {
    scoreCounts[bid.aiScore] = (scoreCounts[bid.aiScore] || 0) + 1;
  }
  console.log(`[evaluator] 평가 완료: 상 ${scoreCounts['상']}건, 중 ${scoreCounts['중']}건, 하 ${scoreCounts['하']}건`);

  return evaluated;
}
