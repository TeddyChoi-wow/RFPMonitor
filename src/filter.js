/**
 * filter.js - 1차 필터 + 통계. AI 호출 금지.
 *
 * 수집된 공고에 4단계 필터를 적용하고 단계별 통계를 누적한다.
 * 결과: 메인 후보(AI 평가 대상) + 참고용(예산 미달) + 아까운 공고 후보 + 통계
 */

import dotenv from 'dotenv';
import { calcDday, parseKeywords, deduplicateBids } from './utils.js';

dotenv.config();

/**
 * 공고명 또는 기관명에 키워드가 1개 이상 포함되는지 검사한다. (OR 매칭)
 * @param {string} text - 검사 대상 텍스트
 * @param {Array<string>} keywords - 키워드 배열
 * @returns {Array<string>} 매칭된 키워드 목록
 */
function matchKeywords(text, keywords) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  return keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
}

/**
 * 수집된 공고 배열에 4단계 필터를 적용한다.
 *
 * 1단계: 마감 D-14 이내
 * 2단계: 키워드 OR 매칭
 * 3단계: 예산 분기 (메인 vs 참고용)
 * 4단계: 대상 범위 OR 매칭 (메인 후보에만 적용)
 *
 * @param {Array} bids - 수집된 공고 배열 (9개 필드)
 * @param {Object} options - 필터 옵션
 * @param {Array<string>} options.keywords - 키워드 배열
 * @param {Array<string>} options.targetScope - 대상 범위 키워드 배열
 * @param {number} options.minBudget - 최소 예산 (원)
 * @param {number} options.deadlineWindowDays - 마감 윈도우 (일)
 * @returns {Object} { mainCandidates, referenceBids, nearMissBids, stats }
 */
export function filterBids(bids, options) {
  const { keywords, targetScope, minBudget, deadlineWindowDays } = options;

  // 통계 누적 객체
  const stats = {
    total: bids.length,
    afterDeadline: 0,
    afterKeyword: 0,
    mainBudget: 0,
    referenceBudget: 0,
    afterTargetScope: 0,
    keywordHits: {},
  };

  // 키워드별 히트 카운터 초기화
  for (const kw of keywords) {
    stats.keywordHits[kw] = 0;
  }

  // 1단계: 마감 D-14 이내
  const withinDeadline = bids.filter((bid) => {
    const dday = calcDday(bid.bidClseDt);
    if (dday === null) return false;
    return dday >= 0 && dday <= deadlineWindowDays;
  });
  stats.afterDeadline = withinDeadline.length;

  // 2단계: 키워드 OR 매칭
  const keywordMatched = [];
  for (const bid of withinDeadline) {
    const matched = matchKeywords(bid.bidNtceNm, keywords);
    if (matched.length > 0) {
      // 키워드별 히트 카운트
      for (const kw of matched) {
        stats.keywordHits[kw] = (stats.keywordHits[kw] || 0) + 1;
      }
      keywordMatched.push({ ...bid, matchedKeywords: matched });
    }
  }
  stats.afterKeyword = keywordMatched.length;

  // 3단계: 예산·대상 범위 태깅 (탈락시키지 않고 태그만 붙임)
  // 키워드 매칭된 공고가 소수이므로 전부 AI 평가 대상으로 올린다.
  const mainCandidates = [];
  const referenceBids = []; // 참고용 (예산 미달)

  for (const bid of keywordMatched) {
    const price = Number(bid.presmptPrce);
    const tags = [];

    // 예산 태그
    if (!bid.presmptPrce || isNaN(price) || price <= 0) {
      tags.push('예산 미공개');
    } else if (price < minBudget) {
      tags.push('예산 미달');
    }

    // 대상 범위 태그
    const searchText = [bid.bidNtceNm, bid.ntceInsttNm, bid.dminsttNm]
      .filter(Boolean)
      .join(' ');
    const scopeMatched = matchKeywords(searchText, targetScope);

    if (scopeMatched.length === 0) {
      tags.push('대상 범위 밖');
    }

    // 태그 유무와 관계없이 전부 메인 후보로 올림
    mainCandidates.push({
      ...bid,
      matchedScope: scopeMatched,
      filterTags: tags,
    });
  }

  stats.mainBudget = keywordMatched.filter((bid) => {
    const price = Number(bid.presmptPrce);
    return price >= minBudget;
  }).length;
  stats.referenceBudget = keywordMatched.length - stats.mainBudget;
  stats.afterTargetScope = mainCandidates.filter((b) => b.matchedScope.length > 0).length;

  // 아까운 공고 선정 (0건 케이스용): 키워드 매칭 전 단계에서 탈락한 공고 중
  // 마감 D-14 이내인데 키워드에 아슬하게 안 걸린 공고는 여기서 선정할 수 없으므로
  // 키워드 매칭된 공고 중 태그가 있는 것으로 대체
  const nearMissBids = mainCandidates
    .filter((b) => b.filterTags.length > 0)
    .sort((a, b) => {
      const priceA = Number(a.presmptPrce) || 0;
      const priceB = Number(b.presmptPrce) || 0;
      if (priceB !== priceA) return priceB - priceA;
      const ddayA = calcDday(a.bidClseDt) ?? 999;
      const ddayB = calcDday(b.bidClseDt) ?? 999;
      return ddayA - ddayB;
    })
    .slice(0, 3);

  console.log('[filter] 필터링 통계:');
  console.log(`  ⓐ 전체 수집: ${stats.total}건`);
  console.log(`  ⓑ 마감 D-${deadlineWindowDays} 이내: ${stats.afterDeadline}건`);
  console.log(`  ⓒ 키워드 매칭: ${stats.afterKeyword}건 → 전부 AI 평가 대상`);
  console.log(`  ⓓ 그 중 예산 ${(minBudget / 10000).toLocaleString()}만원 이상: ${stats.mainBudget}건`);
  console.log(`  ⓔ 그 중 대상 범위 매칭: ${stats.afterTargetScope}건`);
  console.log(`  ⓕ 키워드별 히트:`, stats.keywordHits);

  return { mainCandidates, referenceBids, nearMissBids, stats };
}

// 단독 실행 시 더미 데이터로 테스트 (npm run test:filter)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const dummyBids = [
    {
      bidNtceNo: 'TEST001',
      bidNtceNm: '2026년 디자인씽킹 기반 혁신교육 용역',
      ntceInsttNm: '한국산업인력공단',
      dminsttNm: '기업교육팀',
      presmptPrce: '50000000',
      bidNtceDt: '2026/05/15 00:00:00',
      bidClseDt: '2026/05/28 18:00:00',
      bidNtceDtlUrl: 'https://example.com/bid/TEST001',
      ntceKindNm: '신규',
    },
    {
      bidNtceNo: 'TEST002',
      bidNtceNm: 'AI교육 플랫폼 구축 용역',
      ntceInsttNm: '서울특별시교육청',
      dminsttNm: '대학교육지원과',
      presmptPrce: '15000000',
      bidNtceDt: '2026/05/16 00:00:00',
      bidClseDt: '2026/05/25 18:00:00',
      bidNtceDtlUrl: 'https://example.com/bid/TEST002',
      ntceKindNm: '신규',
    },
    {
      bidNtceNo: 'TEST003',
      bidNtceNm: '리빙랩 운영 지원 용역',
      ntceInsttNm: '과학기술정보통신부',
      dminsttNm: '공공혁신과',
      presmptPrce: '80000000',
      bidNtceDt: '2026/05/10 00:00:00',
      bidClseDt: '2026/05/30 18:00:00',
      bidNtceDtlUrl: 'https://example.com/bid/TEST003',
      ntceKindNm: '신규',
    },
    {
      bidNtceNo: 'TEST004',
      bidNtceNm: '소프트웨어 개발 용역',
      ntceInsttNm: '행정안전부',
      dminsttNm: '정보화담당관',
      presmptPrce: '200000000',
      bidNtceDt: '2026/05/14 00:00:00',
      bidClseDt: '2026/05/27 18:00:00',
      bidNtceDtlUrl: 'https://example.com/bid/TEST004',
      ntceKindNm: '신규',
    },
  ];

  const deduplicated = deduplicateBids(dummyBids);
  const keywords = parseKeywords(process.env.KEYWORDS || '디자인씽킹,AI교육,리빙랩');
  const targetScope = parseKeywords(process.env.TARGET_SCOPE || '기업,공공,대학');
  const minBudget = Number(process.env.MIN_BUDGET) || 20000000;
  const deadlineWindowDays = Number(process.env.DEADLINE_WINDOW_DAYS) || 14;

  const result = filterBids(deduplicated, { keywords, targetScope, minBudget, deadlineWindowDays });

  console.log(`\n[test:filter] 메인 후보: ${result.mainCandidates.length}건`);
  console.log(`[test:filter] 참고용: ${result.referenceBids.length}건`);
  console.log(`[test:filter] 아까운 공고: ${result.nearMissBids.length}건`);

  if (result.mainCandidates.length > 0) {
    console.log('\n[test:filter] 메인 후보 샘플:');
    console.log(JSON.stringify(result.mainCandidates[0], null, 2));
  }
}
