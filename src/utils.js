/**
 * utils.js - 순수 함수만. 부수효과 금지.
 *
 * 날짜 계산, 중복 제거, 통화 포맷 등 프로젝트 전역에서 사용하는 헬퍼 함수 모음.
 */

/**
 * 오늘 날짜를 KST 기준 Date 객체로 반환한다.
 * @returns {Date} KST 기준 오늘 00:00:00
 */
export function getTodayKST() {
  const now = new Date();
  // UTC + 9시간 = KST
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstTime = new Date(now.getTime() + kstOffset);
  // 시간을 00:00:00으로 리셋
  kstTime.setUTCHours(0, 0, 0, 0);
  return kstTime;
}

/**
 * 날짜 문자열을 Date 객체로 파싱한다.
 * 공공데이터 API 응답 형식: "2026/05/28 00:00:00" 또는 "2026-05-28 00:00:00"
 * @param {string} dateStr - 날짜 문자열
 * @returns {Date|null} 파싱된 Date 객체. 실패 시 null
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // 슬래시를 하이픈으로 통일
  const normalized = dateStr.replace(/\//g, '-').trim();
  const parsed = new Date(normalized);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * 오늘 기준 마감일까지 남은 일수(D-day)를 계산한다.
 * @param {string} bidClseDt - 마감일 문자열
 * @returns {number|null} 남은 일수 (음수면 이미 마감). 파싱 실패 시 null
 */
export function calcDday(bidClseDt) {
  const deadline = parseDate(bidClseDt);
  if (!deadline) return null;
  const today = getTodayKST();
  const diffMs = deadline.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 공고일이 최근 N일 이내인지 판정한다. (신규 배지용)
 * @param {string} bidNtceDt - 공고일 문자열
 * @param {number} windowDays - 윈도우 일수 (기본 7)
 * @returns {boolean} 신규 여부
 */
export function isNewBid(bidNtceDt, windowDays = 7) {
  const noticeDate = parseDate(bidNtceDt);
  if (!noticeDate) return false;
  const today = getTodayKST();
  const diffMs = today.getTime() - noticeDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}

/**
 * 입찰공고 배열에서 bidNtceNo 기준으로 중복을 제거한다.
 * 동일 공고번호가 여러 개면 첫 번째만 유지한다.
 * @param {Array} bids - 공고 객체 배열
 * @returns {Array} 중복 제거된 배열
 */
export function deduplicateBids(bids) {
  const seen = new Set();
  return bids.filter((bid) => {
    if (seen.has(bid.bidNtceNo)) return false;
    seen.add(bid.bidNtceNo);
    return true;
  });
}

/**
 * 추정가격(원)을 읽기 쉬운 한글 금액 문자열로 변환한다.
 * 예: 50000000 → "5,000만원", 150000000 → "1억 5,000만원"
 * @param {number|string|null} price - 추정가격 (원 단위)
 * @returns {string} 포맷된 금액 문자열
 */
export function formatPrice(price) {
  const num = Number(price);
  if (!price || isNaN(num) || num <= 0) return '예산 미공개';

  const eok = Math.floor(num / 100000000); // 억
  const man = Math.floor((num % 100000000) / 10000); // 만

  if (eok > 0 && man > 0) {
    return `${eok}억 ${man.toLocaleString()}만원`;
  } else if (eok > 0) {
    return `${eok}억원`;
  } else if (man > 0) {
    return `${man.toLocaleString()}만원`;
  } else {
    return `${num.toLocaleString()}원`;
  }
}

/**
 * 오늘 날짜를 YYYY-MM-DD 형식 문자열로 반환한다.
 * @returns {string} 예: "2026-05-17"
 */
export function getTodayString() {
  const today = getTodayKST();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, '0');
  const d = String(today.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 환경변수에서 쉼표로 구분된 키워드 목록을 배열로 파싱한다.
 * 공백을 제거하고 빈 문자열은 필터링한다.
 * @param {string} envValue - 쉼표로 구분된 문자열 (예: "디자인씽킹,AI교육,리빙랩")
 * @returns {Array<string>} 키워드 배열
 */
export function parseKeywords(envValue) {
  if (!envValue || typeof envValue !== 'string') return [];
  return envValue.split(',').map((k) => k.trim()).filter(Boolean);
}
