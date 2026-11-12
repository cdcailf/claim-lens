const LABELS = {
  approved: '可赔付',
  partial: '部分赔付',
  rejected: '拒赔',
  manual_review: '需人工复核'
};

const STATUS_ICON = { pass: '✓', fail: '✗', warn: '!' };

function money(value) {
  const n = Number(value) || 0;
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function decisionLabel(decision) {
  return LABELS[decision] || decision;
}

export function formatAssessment(result) {
  const lines = [];
  lines.push(`Claim Lens · ${result.claimNo || '(无理赔号)'}`);
  lines.push(`保单 ${result.policyNo || '-'} · ${result.product || '-'}`);
  lines.push('');
  lines.push(`结论：${decisionLabel(result.decision)}`);
  lines.push(`报损 ${money(result.claimedAmount)} · 保障内 ${money(result.coveredAmount)} · 免赔 ${money(result.deductible)} · 可赔 ${money(result.approvedAmount)}`);
  lines.push(`置信度 ${Math.round((result.confidence || 0) * 100)}%`);
  lines.push('');
  lines.push('检查项');
  for (const check of result.checks || []) {
    lines.push(`  ${STATUS_ICON[check.status] || '-'} ${check.label}：${check.detail}`);
  }
  if (result.reasons && result.reasons.length) {
    lines.push('');
    lines.push('原因');
    for (const reason of result.reasons) {
      lines.push(`  [${reason.severity}] ${reason.message}`);
    }
  }
  if (result.citations && result.citations.length) {
    lines.push('');
    lines.push('条款依据');
    for (const citation of result.citations) {
      lines.push(`  ${citation.clauseId}：${citation.quote}`);
    }
  }
  if (result.manualReviewReasons && result.manualReviewReasons.length) {
    lines.push('');
    lines.push(`人工复核：${result.manualReviewReasons.join('；')}`);
  }
  return lines.join('\n');
}

export default formatAssessment;
