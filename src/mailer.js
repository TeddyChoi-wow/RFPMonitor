/**
 * mailer.js - Nodemailer + HTML 빌드. 데이터 로직 금지.
 *
 * 평가 완료된 공고 데이터를 받아 HTML 메일을 빌드하고 Gmail SMTP로 발송한다.
 * 0건 케이스와 1건 이상 케이스를 분기 처리한다.
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { formatPrice, calcDday, isNewBid, getTodayString } from './utils.js';

dotenv.config();

/** 공통 폰트 스택 */
const FONT = `'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;

/** 브랜드 컬러 */
const C = {
  primary: '#50676A',
  primaryLight: '#6B8386',
  accent: '#F29B2F',
  accentLight: '#FFF5E9',
  dark: '#1A1A1A',
  body: '#3D3D3D',
  muted: '#8C8C8C',
  border: '#E8E8E8',
  bgPage: '#F0F2F4',
  bgCard: '#FFFFFF',
  bgSection: '#F8FAFB',
  success: '#2D8F5E',
  warning: '#D97706',
  danger: '#DC3545',
};

/**
 * Gmail SMTP 트랜스포터를 생성한다.
 * @param {string} user - Gmail 주소
 * @param {string} appPassword - Gmail 앱 비밀번호
 * @returns {Object} Nodemailer 트랜스포터
 */
function createTransporter(user, appPassword) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });
}

/**
 * 적합도에 따른 라벨 색상을 반환한다.
 * @param {string} score - "상", "중", "하"
 * @returns {{bg: string, text: string, label: string}}
 */
function scoreStyle(score) {
  const map = {
    '상': { bg: '#E8F5E9', text: '#2D8F5E', label: 'A 적합' },
    '중': { bg: '#FFF8E1', text: '#D97706', label: 'B 검토' },
    '하': { bg: '#F3F4F6', text: '#8C8C8C', label: 'C 참고' },
  };
  return map[score] || map['하'];
}

/**
 * D-day에 따른 긴급도 뱃지를 반환한다.
 * @param {number|null} dday
 * @returns {{bg: string, text: string, label: string}}
 */
function urgencyStyle(dday) {
  if (dday === null) return { bg: '#F3F4F6', text: '#8C8C8C', label: '확인필요' };
  if (dday <= 3) return { bg: '#FDE8E8', text: '#DC3545', label: `D-${dday} 긴급` };
  if (dday <= 7) return { bg: '#FFF3E0', text: '#D97706', label: `D-${dday}` };
  return { bg: '#E3F2FD', text: '#1976D2', label: `D-${dday}` };
}

/**
 * 공고 카드 HTML을 생성한다.
 * @param {Object} bid - 평가된 공고 객체
 * @param {number} index - 카드 순번
 * @returns {string} HTML 문자열
 */
function buildBidCard(bid, index) {
  const dday = calcDday(bid.bidClseDt);
  const isNew = isNewBid(bid.bidNtceDt);
  const price = formatPrice(bid.presmptPrce);
  const detailUrl = bid.bidNtceDtlUrl || '#';
  const ss = scoreStyle(bid.aiScore);
  const us = urgencyStyle(dday);
  const filterWarning = bid.filterTags?.length
    ? `<tr><td style="padding:0 24px 16px; font-family:${FONT};">
        <div style="font-size:12px; color:${C.warning}; background:${C.accentLight}; padding:6px 10px; border-radius:4px; display:inline-block;">
          &#9888; ${escapeHtml(bid.filterTags.join(' / '))}
        </div>
       </td></tr>`
    : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px; border-radius:12px; overflow:hidden; border:1px solid ${C.border};">
      <!-- 카드 상단 바 -->
      <tr>
        <td style="padding:16px 24px 12px; background:${C.bgCard}; font-family:${FONT};">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              ${isNew ? `<span style="display:inline-block; font-size:11px; font-weight:600; color:#1976D2; background:#E3F2FD; padding:3px 8px; border-radius:10px; margin-right:6px;">NEW</span>` : ''}
              <span style="display:inline-block; font-size:11px; font-weight:600; color:${ss.text}; background:${ss.bg}; padding:3px 8px; border-radius:10px; margin-right:6px;">${ss.label}</span>
              <span style="display:inline-block; font-size:11px; font-weight:600; color:${us.text}; background:${us.bg}; padding:3px 8px; border-radius:10px;">${us.label}</span>
            </td>
          </tr></table>
        </td>
      </tr>
      <!-- 공고명 -->
      <tr>
        <td style="padding:0 24px 10px; font-family:${FONT};">
          <a href="${escapeHtml(detailUrl)}" style="font-size:16px; font-weight:700; color:${C.dark}; text-decoration:none; line-height:1.5;">
            ${escapeHtml(bid.bidNtceNm)}
          </a>
        </td>
      </tr>
      <!-- 기관 / 예산 / 마감 -->
      <tr>
        <td style="padding:0 24px 14px; font-family:${FONT};">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; color:${C.body}; line-height:1.8;">
            <tr>
              <td width="60" style="color:${C.muted}; font-size:12px; vertical-align:top;">기관</td>
              <td>${escapeHtml(bid.ntceInsttNm || '')}${bid.dminsttNm && bid.dminsttNm !== bid.ntceInsttNm ? ` &middot; ${escapeHtml(bid.dminsttNm)}` : ''}</td>
            </tr>
            <tr>
              <td style="color:${C.muted}; font-size:12px; vertical-align:top;">예산</td>
              <td style="font-weight:600;">${price}</td>
            </tr>
            <tr>
              <td style="color:${C.muted}; font-size:12px; vertical-align:top;">마감</td>
              <td>${bid.bidClseDt ? bid.bidClseDt.substring(0, 16) : '미정'}</td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- AI 한 줄 평 -->
      <tr>
        <td style="padding:0 24px 16px; font-family:${FONT};">
          <div style="font-size:13px; color:${C.primary}; background:${C.bgSection}; padding:10px 14px; border-radius:8px; border-left:3px solid ${C.accent}; line-height:1.5;">
            ${escapeHtml(bid.aiReason || '')}
          </div>
        </td>
      </tr>
      ${filterWarning}
      <!-- CTA -->
      <tr>
        <td style="padding:0 24px 20px; font-family:${FONT};">
          <a href="${escapeHtml(detailUrl)}"
             style="display:inline-block; padding:10px 24px; background:${C.accent}; color:#fff; text-decoration:none; border-radius:6px; font-size:13px; font-weight:600;">
            원문 보러 가기 &rarr;
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * 참고용 공고 목록 HTML을 생성한다.
 * @param {Array} bids - 참고용 공고 배열
 * @returns {string} HTML 문자열
 */
function buildReferenceSection(bids) {
  if (bids.length === 0) return '';

  const items = bids.map((bid) => {
    const price = formatPrice(bid.presmptPrce);
    const dday = calcDday(bid.bidClseDt);
    const ddayText = dday !== null ? `D-${dday}` : '';
    const url = bid.bidNtceDtlUrl || '#';
    return `
      <tr>
        <td style="padding:10px 16px; border-bottom:1px solid ${C.border}; font-family:${FONT};">
          <a href="${escapeHtml(url)}" style="font-size:13px; color:${C.primary}; text-decoration:none; font-weight:600; line-height:1.4;">
            ${escapeHtml(bid.bidNtceNm)}
          </a>
          <div style="font-size:12px; color:${C.muted}; margin-top:3px;">
            ${price} &middot; 마감 ${ddayText}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px; border-radius:12px; overflow:hidden; border:1px solid ${C.border};">
      <tr>
        <td style="padding:14px 16px; background:${C.bgSection}; font-size:13px; font-weight:700; color:${C.primary}; font-family:${FONT};">
          &#128206; 참고용 &middot; 기준 미달이지만 키워드 적합 (${bids.length}건)
        </td>
      </tr>
      ${items}
    </table>`;
}

/**
 * 요약 통계 바를 생성한다.
 * @param {Array} evaluated - 평가된 공고 배열
 * @param {number} urgentCount - 마감 임박 건수
 * @returns {string} HTML
 */
function buildSummaryBar(evaluated, urgentCount) {
  const scoreA = evaluated.filter((b) => b.aiScore === '상').length;
  const scoreB = evaluated.filter((b) => b.aiScore === '중').length;
  const scoreC = evaluated.filter((b) => b.aiScore === '하').length;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px; border-radius:12px; overflow:hidden; background:${C.primary};">
      <tr>
        <td style="padding:20px 24px; font-family:${FONT};">
          <div style="font-size:13px; color:rgba(255,255,255,0.7); margin-bottom:6px;">이번 주 매칭 결과</div>
          <div style="font-size:28px; font-weight:800; color:#fff; margin-bottom:12px;">${evaluated.length}건</div>
          <table cellpadding="0" cellspacing="0"><tr>
            ${scoreA ? `<td style="padding-right:12px;"><span style="display:inline-block; font-size:12px; font-weight:600; color:${C.success}; background:rgba(255,255,255,0.95); padding:4px 10px; border-radius:10px;">A 적합 ${scoreA}</span></td>` : ''}
            ${scoreB ? `<td style="padding-right:12px;"><span style="display:inline-block; font-size:12px; font-weight:600; color:${C.warning}; background:rgba(255,255,255,0.95); padding:4px 10px; border-radius:10px;">B 검토 ${scoreB}</span></td>` : ''}
            ${scoreC ? `<td style="padding-right:12px;"><span style="display:inline-block; font-size:12px; font-weight:600; color:${C.muted}; background:rgba(255,255,255,0.95); padding:4px 10px; border-radius:10px;">C 참고 ${scoreC}</span></td>` : ''}
            ${urgentCount ? `<td><span style="display:inline-block; font-size:12px; font-weight:600; color:${C.danger}; background:rgba(255,255,255,0.95); padding:4px 10px; border-radius:10px;">&#128680; 긴급 ${urgentCount}</span></td>` : ''}
          </tr></table>
        </td>
      </tr>
    </table>`;
}

/**
 * 적합 공고가 1건 이상일 때의 메일 HTML을 빌드한다.
 * @param {Array} evaluated - AI 평가 완료된 공고 배열
 * @param {Array} referenceBids - 참고용 공고 배열
 * @param {number} urgentCount - 마감 임박 건수
 * @returns {string} HTML 문자열
 */
function buildMainMailHtml(evaluated, referenceBids, urgentCount) {
  const summaryHtml = buildSummaryBar(evaluated, urgentCount);

  let cardsHtml = '';
  evaluated.forEach((bid, i) => {
    cardsHtml += buildBidCard(bid, i);
  });

  const referenceHtml = buildReferenceSection(referenceBids);

  return wrapHtml(summaryHtml + cardsHtml + referenceHtml);
}

/**
 * 0건 케이스의 안내 메일 HTML을 빌드한다.
 * @param {Object} stats - 필터링 통계
 * @param {Array} nearMissBids - 아까운 공고 배열
 * @returns {string} HTML 문자열
 */
function buildZeroMailHtml(stats, nearMissBids) {
  const deadlineWindow = Number(process.env.DEADLINE_WINDOW_DAYS) || 14;
  const minBudget = Number(process.env.MIN_BUDGET) || 20000000;

  // 키워드별 히트 통계
  const keywordRows = Object.entries(stats.keywordHits || {}).map(([kw, count]) => {
    const barWidth = stats.afterDeadline > 0 ? Math.max(Math.round((count / stats.afterDeadline) * 100), count > 0 ? 8 : 0) : 0;
    return `
      <tr>
        <td style="padding:4px 0; font-size:13px; color:${C.body}; font-family:${FONT}; width:80px;">${escapeHtml(kw)}</td>
        <td style="padding:4px 8px;">
          <div style="background:${C.border}; border-radius:4px; height:18px; width:100%;">
            <div style="background:${C.accent}; border-radius:4px; height:18px; width:${barWidth}%; min-width:${count > 0 ? '20px' : '0'};"></div>
          </div>
        </td>
        <td style="padding:4px 0; font-size:13px; color:${C.muted}; font-family:${FONT}; width:40px; text-align:right;">${count}건</td>
      </tr>`;
  }).join('');

  // 필터 퍼널
  const funnelSteps = [
    { label: '전체 수집 (용역)', value: stats.total },
    { label: `마감 D-${deadlineWindow} 이내`, value: stats.afterDeadline },
    { label: '키워드 매칭', value: stats.afterKeyword },
  ];
  const funnelHtml = funnelSteps.map((step, i) => {
    const widthPct = stats.total > 0 ? Math.max(Math.round((step.value / stats.total) * 100), 5) : 5;
    return `
      <tr>
        <td style="padding:3px 0; font-family:${FONT};">
          <div style="font-size:12px; color:${C.muted}; margin-bottom:2px;">${step.label}</div>
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="${widthPct}%"><div style="background:${i < 2 ? C.primaryLight : C.accent}; height:22px; border-radius:4px; line-height:22px; padding-left:8px; font-size:12px; font-weight:700; color:#fff;">${step.value.toLocaleString()}</div></td>
            <td></td>
          </tr></table>
        </td>
      </tr>`;
  }).join('');

  // 아까운 공고 미리보기
  let nearMissHtml = '';
  if (nearMissBids.length > 0) {
    const items = nearMissBids.map((bid) => {
      const price = formatPrice(bid.presmptPrce);
      const dday = calcDday(bid.bidClseDt);
      const ddayText = dday !== null ? `D-${dday}` : '';
      const url = bid.bidNtceDtlUrl || '#';
      const dropReason = bid.filterTags?.length ? bid.filterTags.join(', ') : (bid.dropReason || '기준 미달');
      return `
        <tr>
          <td style="padding:12px 16px; border-bottom:1px solid ${C.border}; font-family:${FONT};">
            <a href="${escapeHtml(url)}" style="font-size:13px; color:${C.primary}; text-decoration:none; font-weight:600; line-height:1.4;">
              ${escapeHtml(bid.bidNtceNm)}
            </a>
            <div style="font-size:12px; color:${C.muted}; margin-top:3px;">
              ${price} &middot; 마감 ${ddayText}
            </div>
            <div style="font-size:12px; color:${C.warning}; margin-top:2px;">
              &#10140; ${escapeHtml(bid.matchedKeywords?.join(', ') || '')} 키워드 매칭, 단 ${escapeHtml(dropReason)}
            </div>
          </td>
        </tr>`;
    }).join('');

    nearMissHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px; border-radius:12px; overflow:hidden; border:1px solid ${C.border};">
        <tr>
          <td style="padding:14px 16px; background:${C.accentLight}; font-size:13px; font-weight:700; color:${C.accent}; font-family:${FONT};">
            &#128142; 아까운 공고 미리보기
          </td>
        </tr>
        ${items}
      </table>`;
  }

  const contentHtml = `
    <!-- 0건 헤더 -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px; border-radius:12px; overflow:hidden; background:${C.bgSection}; border:1px solid ${C.border};">
      <tr>
        <td style="padding:24px; text-align:center; font-family:${FONT};">
          <div style="font-size:36px; margin-bottom:8px;">&#128173;</div>
          <div style="font-size:16px; font-weight:700; color:${C.dark}; margin-bottom:4px;">이번 주는 적합 공고가 없습니다</div>
          <div style="font-size:13px; color:${C.muted};">아래 통계를 참고해주세요</div>
        </td>
      </tr>
    </table>

    <!-- 필터 퍼널 -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px; border-radius:12px; overflow:hidden; border:1px solid ${C.border};">
      <tr>
        <td style="padding:16px 20px 4px; font-size:13px; font-weight:700; color:${C.primary}; font-family:${FONT};">
          &#128202; 필터링 퍼널
        </td>
      </tr>
      <tr>
        <td style="padding:4px 20px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${funnelHtml}
          </table>
        </td>
      </tr>
    </table>

    <!-- 키워드 히트 -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px; border-radius:12px; overflow:hidden; border:1px solid ${C.border};">
      <tr>
        <td style="padding:16px 20px 4px; font-size:13px; font-weight:700; color:${C.primary}; font-family:${FONT};">
          &#128295; 키워드별 히트
        </td>
      </tr>
      <tr>
        <td style="padding:4px 20px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${keywordRows}
          </table>
        </td>
      </tr>
    </table>

    ${nearMissHtml}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td style="padding:16px; text-align:center; font-size:13px; color:${C.muted}; font-family:${FONT};">
          다음 주에 다시 확인해드릴게요 &#128075;
        </td>
      </tr>
    </table>`;

  return wrapHtml(contentHtml);
}

/**
 * HTML 콘텐츠를 공통 레이아웃 래퍼로 감싼다.
 * @param {string} innerHtml - 본문 HTML
 * @returns {string} 완성된 HTML
 */
function wrapHtml(innerHtml) {
  const dateStr = getTodayString();
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:${C.bgPage};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bgPage};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
          <!-- 헤더 -->
          <tr>
            <td style="padding:28px 32px 24px; background:${C.primary}; border-radius:16px 16px 0 0; font-family:${FONT};">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td>
                  <div style="font-size:22px; font-weight:800; color:#fff; letter-spacing:-0.5px;">G2B Bid Scout</div>
                  <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-top:4px;">나라장터 입찰공고 자동 큐레이션</div>
                </td>
                <td align="right" style="vertical-align:bottom;">
                  <div style="font-size:12px; color:rgba(255,255,255,0.5);">${dateStr}</div>
                </td>
              </tr></table>
            </td>
          </tr>
          <!-- 본문 -->
          <tr>
            <td style="padding:24px; background:${C.bgCard};">
              ${innerHtml}
            </td>
          </tr>
          <!-- 푸터 -->
          <tr>
            <td style="padding:20px 32px; background:${C.bgSection}; border-radius:0 0 16px 16px; border-top:1px solid ${C.border}; font-family:${FONT};">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:11px; color:${C.muted}; line-height:1.6;">
                  G2B Bid Scout &middot; Powered by Claude AI<br>
                  이 메일은 자동 발송되었습니다
                </td>
                <td align="right" style="font-size:11px; color:${C.muted};">
                  WOWD.LAB
                </td>
              </tr></table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * HTML 특수문자를 이스케이프한다.
 * @param {string} str - 원본 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 메일 제목을 생성한다.
 * @param {number} count - 적합 공고 수
 * @param {number} urgentCount - 마감 임박(D-3 이내) 공고 수
 * @returns {string} 메일 제목
 */
function buildSubject(count, urgentCount) {
  const dateStr = getTodayString();
  if (count === 0) {
    return `📭 이번 주 적합 공고 없음 | ${dateStr}`;
  }
  return `🎯 이번 주 입찰공고 ${count}건 (마감 임박 ${urgentCount}건) | ${dateStr}`;
}

/**
 * 평가 결과를 기반으로 HTML 메일을 빌드하고 Gmail로 발송한다.
 * @param {Object} data - 메일 발송에 필요한 전체 데이터
 * @param {Array} data.evaluated - AI 평가 완료된 공고 배열
 * @param {Array} data.referenceBids - 참고용 공고 배열
 * @param {Array} data.nearMissBids - 아까운 공고 배열 (0건 케이스용)
 * @param {Object} data.stats - 필터링 통계
 * @param {Object} mailOptions - 메일 발송 옵션
 * @param {string} mailOptions.gmailUser - Gmail 주소
 * @param {string} mailOptions.gmailAppPassword - 앱 비밀번호
 * @param {string} mailOptions.mailTo - 수신자
 * @returns {Promise<Object>} 발송 결과
 */
export async function sendMail(data, mailOptions) {
  const { evaluated, referenceBids, nearMissBids, stats } = data;
  const { gmailUser, gmailAppPassword, mailTo } = mailOptions;

  if (!gmailUser) throw new Error('GMAIL_USER가 .env에 설정되지 않았습니다.');
  if (!gmailAppPassword) throw new Error('GMAIL_APP_PASSWORD가 .env에 설정되지 않았습니다.');
  if (!mailTo) throw new Error('MAIL_TO가 .env에 설정되지 않았습니다.');

  const hasResults = evaluated.length > 0;

  // 마감 임박(D-3 이내) 건수 계산
  const urgentCount = evaluated.filter((bid) => {
    const dday = calcDday(bid.bidClseDt);
    return dday !== null && dday <= 3;
  }).length;

  const subject = buildSubject(hasResults ? evaluated.length : 0, urgentCount);
  const html = hasResults
    ? buildMainMailHtml(evaluated, referenceBids, urgentCount)
    : buildZeroMailHtml(stats, nearMissBids);

  const transporter = createTransporter(gmailUser, gmailAppPassword);

  console.log(`[mailer] 메일 발송 중... (To: ${mailTo})`);
  console.log(`[mailer] 제목: ${subject}`);

  try {
    const info = await transporter.sendMail({
      from: gmailUser,
      to: mailTo,
      subject,
      html,
    });

    console.log(`[mailer] 발송 성공: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`[mailer] 발송 실패: ${error.message}`);
    throw error;
  }
}

// 단독 실행 시 더미 데이터로 메일 발송 테스트 (npm run test:mail)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const dummyEvaluated = [
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
      aiScore: '상',
      aiReason: '17년 디자인씽킹·퍼실리테이션 경험 직접 매칭',
      filterTags: [],
      matchedKeywords: ['디자인씽킹'],
    },
    {
      bidNtceNo: 'TEST003',
      bidNtceNm: '리빙랩 운영 지원 용역',
      ntceInsttNm: '과학기술정보통신부',
      dminsttNm: '공공혁신과',
      presmptPrce: '80000000',
      bidNtceDt: '2026/05/10 00:00:00',
      bidClseDt: '2026/05/20 18:00:00',
      bidNtceDtlUrl: 'https://example.com/bid/TEST003',
      ntceKindNm: '신규',
      aiScore: '중',
      aiReason: '리빙랩 전문성 매칭, 단 운영 지원 범위 확인 필요',
      filterTags: ['대상 범위 밖'],
      matchedKeywords: ['리빙랩'],
    },
  ];

  const dummyReference = [
    {
      bidNtceNo: 'TEST002',
      bidNtceNm: 'AI교육 플랫폼 구축 용역',
      ntceInsttNm: '서울특별시교육청',
      dminsttNm: '대학교육지원과',
      presmptPrce: '15000000',
      bidClseDt: '2026/05/25 18:00:00',
      bidNtceDtlUrl: 'https://example.com/bid/TEST002',
    },
  ];

  const dummyStats = {
    total: 412,
    afterDeadline: 287,
    afterKeyword: 8,
    mainBudget: 3,
    referenceBudget: 5,
    afterTargetScope: 2,
    keywordHits: { '디자인씽킹': 2, 'AI교육': 6, '리빙랩': 0 },
  };

  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const mailTo = process.env.MAIL_TO;

  if (!gmailUser || !gmailAppPassword || !mailTo) {
    console.error('[test:mail] .env에 GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO를 설정해주세요.');
    process.exit(1);
  }

  sendMail(
    { evaluated: dummyEvaluated, referenceBids: dummyReference, nearMissBids: [], stats: dummyStats },
    { gmailUser, gmailAppPassword, mailTo }
  )
    .then(() => console.log('[test:mail] 테스트 메일 발송 완료'))
    .catch((error) => {
      console.error(`[test:mail] 실패: ${error.message}`);
      process.exit(1);
    });
}
