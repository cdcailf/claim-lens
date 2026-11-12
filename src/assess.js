/**
 * Claim Lens — deterministic claim adjudication core.
 *
 * Rules first, LLM optional. Every decision is traceable to a policy clause.
 */

const DAY_MS = 86400000;

export const DECISIONS = {
  APPROVED: 'approved',
  PARTIAL: 'partial',
  REJECTED: 'rejected',
  MANUAL_REVIEW: 'manual_review'
};

function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / DAY_MS);
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeCategory(value) {
  return text(value).replace(/\s+/g, '').toLowerCase();
}

function findCoverage(policy, category) {
  const target = normalizeCategory(category);
  if (!target) return null;
  const list = Array.isArray(policy.coverage) ? policy.coverage : [];
  return list.find((item) => {
    const name = normalizeCategory(item.name);
    return name && (target === name || target.includes(name) || name.includes(target));
  }) || null;
}

function clauseText(policy, clauseId) {
  if (!clauseId || !policy.clauses) return '';
  return text(policy.clauses[clauseId]);
}

function buildResult(policy, claim) {
  return {
    claimNo: text(claim.claimNo),
    policyNo: text(claim.policyNo),
    product: text(policy.product),
    vehicle: policy.insured && policy.insured.vehicle ? policy.insured.vehicle : null,
    policyPeriod: policy.period || null,
    decision: DECISIONS.MANUAL_REVIEW,
    claimedAmount: 0,
    coveredAmount: 0,
    deductible: num(policy.deductible),
    approvedAmount: 0,
    payableAmount: 0,
    currency: 'CNY',
    checks: [],
    reasons: [],
    citations: [],
    items: [],
    manualReviewReasons: [],
    confidence: 0.9
  };
}

function addCheck(result, id, label, status, detail) {
  result.checks.push({ id, label, status, detail });
}

function addReason(result, code, severity, message, clauseId) {
  result.reasons.push({ code, severity, message, clauseId: clauseId || null });
}

function addCitation(result, policy, clauseId, appliesTo) {
  if (!clauseId) return;
  if (result.citations.some((c) => c.clauseId === clauseId)) return;
  const quote = clauseText(policy, clauseId);
  if (!quote) return;
  result.citations.push({ clauseId, quote, appliesTo: appliesTo || '' });
}

function reject(result, policy, code, message, clauseId) {
  addReason(result, code, 'error', message, clauseId);
  addCitation(result, policy, clauseId, code);
  result.decision = DECISIONS.REJECTED;
  result.approvedAmount = 0;
  result.payableAmount = 0;
  result.confidence = 0.96;
  return result;
}

/**
 * Assess one claim against one policy.
 *
 * @param {object} policy
 * @param {object} claim
 * @param {object} [options]
 * @returns {object}
 */
export function assessClaim(policy, claim, options = {}) {
  if (!policy) {
    return {
      claimNo: text(claim && claim.claimNo),
      policyNo: text(claim && claim.policyNo),
      decision: DECISIONS.REJECTED,
      approvedAmount: 0,
      payableAmount: 0,
      checks: [],
      reasons: [{ code: 'policy_not_found', severity: 'error', message: '未找到对应保单', clauseId: null }],
      citations: [],
      items: [],
      manualReviewReasons: [],
      confidence: 0.99
    };
  }

  const result = buildResult(policy, claim);

  if (!claim || typeof claim !== 'object') {
    return reject(result, policy, 'invalid_claim', '理赔材料为空或格式错误');
  }

  if (text(claim.policyNo) && text(claim.policyNo) !== text(policy.policyNo)) {
    addCheck(result, 'policy_match', '保单匹配', 'fail', `材料保单号 ${claim.policyNo} 与保单 ${policy.policyNo} 不一致`);
    return reject(result, policy, 'policy_mismatch', '理赔材料与保单号不匹配');
  }
  addCheck(result, 'policy_match', '保单匹配', 'pass', policy.policyNo);

  if (text(policy.status) !== 'active') {
    addCheck(result, 'policy_active', '保单有效', 'fail', `当前状态：${policy.status || '未知'}`);
    return reject(result, policy, 'policy_inactive', '保单当前不是有效状态');
  }
  addCheck(result, 'policy_active', '保单有效', 'pass', 'active');

  const incident = toDate(claim.incidentAt);
  if (!incident) {
    addCheck(result, 'incident_date', '事故日期', 'fail', '缺少或无法解析事故日期');
    result.manualReviewReasons.push('事故日期缺失');
    addReason(result, 'missing_incident_date', 'warn', '事故日期缺失，需人工确认');
  } else {
    const start = toDate((policy.period || {}).start);
    const end = toDate((policy.period || {}).end);
    if (start && incident < start) {
      addCheck(result, 'incident_window', '保障期', 'fail', `事故日期早于起保日 ${policy.period.start}`);
      return reject(result, policy, 'not_yet_effective', '事故发生在保障期开始之前');
    }
    if (end && incident > end) {
      addCheck(result, 'incident_window', '保障期', 'fail', `事故日期晚于止保日 ${policy.period.end}`);
      return reject(result, policy, 'policy_expired', '事故发生在保障期结束之后');
    }
    addCheck(result, 'incident_window', '保障期', 'pass', `${policy.period.start} ~ ${policy.period.end}`);
  }

  const waitingDays = num(policy.waitingDays);
  if (incident && waitingDays > 0) {
    const start = toDate((policy.period || {}).start);
    if (start && daysBetween(start, incident) < waitingDays) {
      addCheck(result, 'waiting_period', '等待期', 'fail', `等待期 ${waitingDays} 天，事故发生在第 ${daysBetween(start, incident)} 天`);
      return reject(result, policy, 'waiting_period', `事故发生在 ${waitingDays} 天等待期内`);
    }
    addCheck(result, 'waiting_period', '等待期', 'pass', `${waitingDays} 天，已过等待期`);
  } else {
    addCheck(result, 'waiting_period', '等待期', 'pass', waitingDays ? `${waitingDays} 天` : '无等待期');
  }

  const mileage = num(claim.mileage);
  const mileageLimit = num(policy.mileageLimit);
  if (mileageLimit > 0 && mileage > mileageLimit) {
    addCheck(result, 'mileage', '承保里程', 'fail', `${mileage} km 超出 ${mileageLimit} km`);
    return reject(result, policy, 'mileage_exceeded', `事故里程 ${mileage} km 超出承保里程 ${mileageLimit} km`);
  }
  addCheck(result, 'mileage', '承保里程', 'pass', mileage ? `${mileage} / ${mileageLimit || '不限'} km` : '未提供里程');

  const description = text(claim.description);
  const itemText = Array.isArray(claim.damageItems)
    ? claim.damageItems.map((item) => `${text(item.part)} ${text(item.category)}`).join(' ')
    : '';
  const haystack = `${description} ${itemText}`;
  const exclusions = Array.isArray(policy.exclusions) ? policy.exclusions : [];
  for (const exclusion of exclusions) {
    const hit = (exclusion.keywords || []).find((kw) => kw && haystack.includes(kw));
    if (hit) {
      addCheck(result, 'exclusions', '责任免除', 'fail', `命中免责关键词「${hit}」`);
      return reject(result, policy, 'exclusion', `属于责任免除范围：${hit}`, exclusion.clauseId);
    }
  }
  addCheck(result, 'exclusions', '责任免除', 'pass', '未命中免责条款');

  const items = Array.isArray(claim.damageItems) ? claim.damageItems : [];
  if (!items.length) {
    addCheck(result, 'coverage', '保障范围', 'warn', '未提供受损项目明细');
    result.manualReviewReasons.push('缺少受损项目明细');
    addReason(result, 'missing_damage_items', 'warn', '缺少受损项目明细，无法自动核定');
    result.claimedAmount = num(claim.claimedAmount);
    result.confidence = 0.62;
    return result;
  }

  let claimedAmount = 0;
  let coveredAmount = 0;
  const excludedItems = [];

  for (const item of items) {
    const labor = num(item.labor);
    const parts = num(item.parts);
    const amount = labor + parts;
    claimedAmount += amount;
    const coverage = findCoverage(policy, item.category);
    if (!coverage || coverage.covered === false) {
      excludedItems.push({
        part: text(item.part),
        category: text(item.category),
        amount,
        reason: coverage ? '条款标注为不保' : '险种未覆盖该类别'
      });
      result.items.push({
        part: text(item.part),
        category: text(item.category),
        labor,
        parts,
        amount,
        covered: false,
        clauseId: coverage ? coverage.clauseId : null
      });
      continue;
    }
    coveredAmount += amount;
    result.items.push({
      part: text(item.part),
      category: text(item.category),
      labor,
      parts,
      amount,
      covered: true,
      clauseId: coverage.clauseId
    });
    addCitation(result, policy, coverage.clauseId, coverage.name);
  }

  result.claimedAmount = round2(claimedAmount);
  result.coveredAmount = round2(coveredAmount);

  if (!coveredAmount) {
    addCheck(result, 'coverage', '保障范围', 'fail', '所有受损项目均不在保障范围');
    return reject(result, policy, 'not_covered', '受损项目均不属于保障范围');
  }

  if (excludedItems.length) {
    addCheck(result, 'coverage', '保障范围', 'warn', `${excludedItems.length} 项不在保障范围`);
    for (const item of excludedItems) {
      addReason(result, 'item_not_covered', 'warn', `${item.part}（${item.category}）不在保障范围：${item.reason}`);
    }
  } else {
    addCheck(result, 'coverage', '保障范围', 'pass', `${items.length} 项均在保障范围`);
  }

  const perClaimLimit = num(policy.perClaimLimit);
  const annualLimit = num(policy.annualLimit);
  const annualUsed = num(policy.annualUsed);
  const remainingAnnual = annualLimit > 0 ? Math.max(annualLimit - annualUsed, 0) : Infinity;

  let cap = coveredAmount;
  let limitedBy = '';
  if (perClaimLimit > 0 && cap > perClaimLimit) {
    cap = perClaimLimit;
    limitedBy = 'per_claim_limit';
  }
  if (Number.isFinite(remainingAnnual) && cap > remainingAnnual) {
    cap = remainingAnnual;
    limitedBy = 'annual_limit';
  }

  if (limitedBy) {
    addReason(
      result,
      limitedBy,
      'warn',
      limitedBy === 'per_claim_limit'
        ? `核定损失 ${round2(coveredAmount)} 超过单次限额 ${perClaimLimit}，按限额计算`
        : `核定损失 ${round2(coveredAmount)} 超过年度剩余额度 ${round2(remainingAnnual)}，按剩余额度计算`
    );
    addCitation(result, policy, 'CL-LIMIT', '赔付限额');
  }

  const deductible = Math.min(num(policy.deductible), cap);
  const approved = round2(Math.max(cap - deductible, 0));
  result.deductible = round2(deductible);
  result.approvedAmount = approved;
  result.payableAmount = approved;

  if (deductible > 0) addCitation(result, policy, 'CL-DEDUCT', '免赔额');

  if (approved <= 0) {
    addCheck(result, 'amount', '赔付金额', 'fail', `扣除免赔额 ${deductible} 后无可赔金额`);
    return reject(result, policy, 'deductible_exceeds', '扣除免赔额后无可赔付金额');
  }

  const parts = [`核定损失 ${round2(coveredAmount)}`, `免赔额 ${result.deductible}`, `可赔 ${approved}`];
  addCheck(result, 'amount', '赔付金额', 'pass', parts.join('，'));

  const attachments = Array.isArray(claim.attachments) ? claim.attachments.filter(Boolean) : [];
  if (policy.requireAttachments !== false && !attachments.length) {
    addCheck(result, 'documents', '材料完整性', 'warn', '未提供维修工单或发票');
    result.manualReviewReasons.push('缺少维修工单/发票');
    addReason(result, 'missing_attachments', 'warn', '未提供维修工单或发票，需人工核验');
  } else {
    addCheck(result, 'documents', '材料完整性', 'pass', attachments.length ? `${attachments.length} 份材料` : '不要求材料');
  }

  const threshold = num(policy.manualReviewThreshold);
  if (threshold > 0 && result.claimedAmount > threshold) {
    result.manualReviewReasons.push(`报损 ${result.claimedAmount} 超过人工复核阈值 ${threshold}`);
    addReason(result, 'amount_over_threshold', 'warn', `报损金额超过人工复核阈值 ${threshold}`);
  }
  if (num(claim.priorClaims) >= 3) {
    result.manualReviewReasons.push('历史理赔次数 ≥ 3');
    addReason(result, 'frequent_claims', 'warn', '近一年理赔次数较多，建议人工复核');
  }
  if (description.length > 0 && description.length < 10) {
    result.manualReviewReasons.push('事故描述过短');
    addReason(result, 'short_description', 'warn', '事故描述过短，信息不足');
  }

  addCheck(
    result,
    'manual_review',
    '人工复核',
    result.manualReviewReasons.length ? 'warn' : 'pass',
    result.manualReviewReasons.length ? result.manualReviewReasons.join('；') : '无需人工复核'
  );

  if (result.manualReviewReasons.length) {
    result.decision = DECISIONS.MANUAL_REVIEW;
  } else if (excludedItems.length || limitedBy || approved < coveredAmount - deductible) {
    result.decision = DECISIONS.PARTIAL;
  } else {
    result.decision = DECISIONS.APPROVED;
  }

  let confidence = 0.97;
  confidence -= Math.min(result.manualReviewReasons.length * 0.08, 0.3);
  confidence -= Math.min(excludedItems.length * 0.03, 0.12);
  if (limitedBy) confidence -= 0.02;
  result.confidence = Math.max(Math.round(confidence * 100) / 100, 0.5);

  return result;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export default assessClaim;
