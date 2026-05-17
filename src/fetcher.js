/**
 * fetcher.js - 공공데이터 API 호출만. 변환·필터 금지.
 *
 * 나라장터검색조건(PPSSrch) 엔드포인트를 사용하여 키워드별로 용역 공고를 수집한다.
 * 키워드별 병렬 호출로 필요한 공고만 정확히 가져온다.
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { getTodayKST, parseKeywords } from './utils.js';

dotenv.config();

/** 한 페이지당 가져올 건수 (API 최대 999) */
const NUM_OF_ROWS = 999;

/** API 호출 실패 시 최대 재시도 횟수 */
const MAX_RETRIES = 3;

/** 재시도 간 대기 시간 (ms) */
const RETRY_DELAY_MS = 2000;

/** 응답에서 추출할 9개 필드 */
const EXTRACT_FIELDS = [
  'bidNtceNo',      // 입찰공고번호
  'bidNtceNm',      // 공고명
  'ntceInsttNm',    // 공고기관
  'dminsttNm',      // 수요기관
  'presmptPrce',    // 추정가격
  'bidNtceDt',      // 공고일시
  'bidClseDt',      // 입찰마감일시
  'bidNtceDtlUrl',  // 원문 상세 URL
  'ntceKindNm',     // 공고종류 (등록공고/재공고/변경공고)
];

/**
 * 지정된 시간만큼 대기한다.
 * @param {number} ms - 대기 시간 (밀리초)
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 공고 객체에서 9개 필드만 추출한다.
 * @param {Object} rawBid - API 원본 공고 객체
 * @returns {Object} 9개 필드만 포함된 객체
 */
function extractFields(rawBid) {
  const extracted = {};
  for (const field of EXTRACT_FIELDS) {
    extracted[field] = rawBid[field] ?? null;
  }
  return extracted;
}

/**
 * 날짜를 API 파라미터 형식(YYYYMMDDHHMM)으로 변환한다.
 * @param {Date} d - Date 객체
 * @returns {string} 예: "202605170000"
 */
function formatDateParam(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}0000`;
}

/**
 * PPSSrch 엔드포인트로 키워드 1개에 대한 공고를 페이징 수집한다.
 * @param {string} apiKey - 디코딩된 API 키
 * @param {string} baseUrl - API 기본 URL
 * @param {string} keyword - 검색 키워드
 * @param {string} inqryBgnDt - 조회 시작일 (YYYYMMDDHHMM)
 * @param {string} inqryEndDt - 조회 종료일 (YYYYMMDDHHMM)
 * @returns {Promise<Array>} 공고 객체 배열 (9개 필드)
 */
async function fetchByKeyword(apiKey, baseUrl, keyword, inqryBgnDt, inqryEndDt) {
  const url = `${baseUrl}/getBidPblancListInfoServcPPSSrch`;

  let pageNo = 1;
  const allItems = [];

  while (true) {
    const params = {
      serviceKey: apiKey,
      pageNo,
      numOfRows: NUM_OF_ROWS,
      type: 'json',
      inqryDiv: '1',       // 공고게시일시 기준
      inqryBgnDt,
      inqryEndDt,
      bidNtceNm: keyword,  // 공고명 부분 매칭 검색
    };

    let lastError;
    let result;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get(url, { params, timeout: 30000 });
        const data = response.data;

        // 에러 응답 체크
        const errorResponse = data?.['nkoneps.com.response.ResponseError'];
        if (errorResponse) {
          const code = errorResponse.header?.resultCode ?? 'unknown';
          const msg = errorResponse.header?.resultMsg ?? 'unknown';
          throw new Error(`API 응답 오류: ${code} - ${msg}`);
        }

        const header = data?.response?.header;
        if (!header || header.resultCode !== '00') {
          const code = header?.resultCode ?? 'unknown';
          const msg = header?.resultMsg ?? 'unknown';
          throw new Error(`API 응답 오류: ${code} - ${msg}`);
        }

        const body = data?.response?.body;
        const totalCount = body?.totalCount ?? 0;

        if (totalCount === 0 || !body?.items) {
          result = { items: [], totalCount: 0 };
          break;
        }

        let itemList = body.items.item ?? body.items;
        if (!Array.isArray(itemList)) {
          itemList = [itemList];
        }

        result = { items: itemList, totalCount };
        break;
      } catch (error) {
        lastError = error;
        console.error(`[fetcher] '${keyword}' 페이지 ${pageNo} 실패 (시도 ${attempt}/${MAX_RETRIES}): ${error.message}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    if (!result) {
      throw new Error(`[fetcher] '${keyword}' 페이지 ${pageNo} ${MAX_RETRIES}회 실패: ${lastError.message}`);
    }

    if (result.items.length === 0) break;

    allItems.push(...result.items.map(extractFields));

    // 모든 페이지 수집 완료 체크
    if (allItems.length >= result.totalCount) break;
    pageNo++;
  }

  return allItems;
}

/**
 * 키워드별로 PPSSrch 엔드포인트를 병렬 호출하여 용역 공고를 수집한다.
 * @param {string} apiKey - 디코딩된 API 키
 * @param {string} baseUrl - API 기본 URL
 * @param {Array<string>} keywords - 검색 키워드 배열
 * @returns {Promise<Array>} 공고 객체 배열 (9개 필드, 중복 포함 가능)
 */
export async function fetchAllServiceBids(apiKey, baseUrl, keywords) {
  if (!apiKey) {
    throw new Error('G2B_API_KEY가 .env에 설정되지 않았습니다.');
  }
  if (!baseUrl) {
    throw new Error('G2B_BASE_URL이 .env에 설정되지 않았습니다.');
  }
  if (!keywords || keywords.length === 0) {
    throw new Error('KEYWORDS가 .env에 설정되지 않았습니다.');
  }

  // 조회 기간: 공고일 기준 14일
  const QUERY_WINDOW_DAYS = 14;
  const today = getTodayKST();
  const beginDate = new Date(today.getTime() - QUERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const inqryBgnDt = formatDateParam(beginDate);
  const inqryEndDt = formatDateParam(today);

  console.log(`[fetcher] 키워드별 용역 공고 수집 시작 (PPSSrch)`);
  console.log(`[fetcher] 조회 기간: ${inqryBgnDt.substring(0, 8)} ~ ${inqryEndDt.substring(0, 8)}`);
  console.log(`[fetcher] 키워드: ${keywords.join(', ')}`);

  // 키워드별 병렬 호출
  const results = await Promise.all(
    keywords.map(async (kw) => {
      const bids = await fetchByKeyword(apiKey, baseUrl, kw, inqryBgnDt, inqryEndDt);
      console.log(`[fetcher] '${kw}': ${bids.length}건`);
      return bids;
    })
  );

  // 전체 합치기
  const allBids = results.flat();
  console.log(`[fetcher] 수집 완료: 총 ${allBids.length}건 (중복 포함)`);
  return allBids;
}

// 단독 실행 시 테스트 (npm run test:fetch)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const apiKey = process.env.G2B_API_KEY;
  const baseUrl = process.env.G2B_BASE_URL;
  const keywords = parseKeywords(process.env.KEYWORDS);
  fetchAllServiceBids(apiKey, baseUrl, keywords)
    .then((bids) => {
      console.log(`\n[test:fetch] 총 ${bids.length}건 수집 완료`);
      if (bids.length > 0) {
        console.log('[test:fetch] 첫 번째 공고 샘플:');
        console.log(JSON.stringify(bids[0], null, 2));
      }
    })
    .catch((error) => {
      console.error(`[test:fetch] 실패: ${error.message}`);
      process.exit(1);
    });
}
