const LABELS = {
  approved: '可赔付',
  partial: '部分赔付',
  rejected: '拒赔',
  manual_review: '需人工复核'
};

const COLORS = {
  approved: '#0f9d58',
  partial: '#f29900',
  rejected: '#d93025',
  manual_review: '#1a73e8'
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value) {
  const n = Number(value) || 0;
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadge(status) {
  const map = { pass: ['通过', '#0f9d58'], fail: ['不通过', '#d93025'], warn: ['提示', '#f29900'] };
  const [label, color] = map[status] || ['未知', '#5f6368'];
  return `<span class="badge" style="background:${color}1a;color:${color}">${label}</span>`;
}

export function renderReport(result) {
  const decision = result.decision || 'manual_review';
  const color = COLORS[decision] || '#5f6368';
  const checks = (result.checks || []).map((check) => `
    <tr>
      <td>${escapeHtml(check.label)}</td>
      <td>${statusBadge(check.status)}</td>
      <td>${escapeHtml(check.detail)}</td>
    </tr>`).join('');
  const reasons = (result.reasons || []).map((reason) => `
    <li class="reason-${escapeHtml(reason.severity)}">${escapeHtml(reason.message)}</li>`).join('');
  const citations = (result.citations || []).map((citation) => `
    <blockquote>
      <div class="clause-id">${escapeHtml(citation.clauseId)}</div>
      <div>${escapeHtml(citation.quote)}</div>
    </blockquote>`).join('');
  const items = (result.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.part)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${money(item.labor)}</td>
      <td>${money(item.parts)}</td>
      <td>${item.covered ? '保障内' : '不保'}</td>
      <td>${money(item.amount)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claim Lens · ${escapeHtml(result.claimNo)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 18px; background: #f6f8fa; color: #1f2328; font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #d8dee4; border-radius: 12px; padding: 22px 24px; margin-bottom: 14px; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #656d76; font-size: 12px; }
  .decision { display: inline-block; padding: 4px 12px; border-radius: 999px; color: ${color}; background: ${color}14; font-weight: 700; }
  .amounts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
  .amount { background: #f6f8fa; border-radius: 8px; padding: 10px 12px; }
  .amount b { display: block; font-size: 18px; }
  .amount span { color: #656d76; font-size: 12px; }
  h2 { font-size: 14px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eaeef2; vertical-align: top; }
  th { color: #656d76; font-weight: 600; background: #f6f8fa; }
  .badge { padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 4px 0; }
  .reason-error { color: #d93025; }
  .reason-warn { color: #9a6700; }
  blockquote { margin: 0 0 10px; padding: 10px 12px; background: #f6f8fa; border-left: 3px solid #d0d7de; border-radius: 0 6px 6px 0; }
  .clause-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #656d76; margin-bottom: 2px; }
  .foot { text-align: center; color: #8c959f; font-size: 12px; margin-top: 18px; }
  @media (max-width: 640px) { .amounts { grid-template-columns: repeat(2, 1fr); } }
  @media print { body { background: #fff; padding: 0; } .card { border: none; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="top">
      <div>
        <h1>${escapeHtml(result.claimNo || '理赔评估')}</h1>
        <div class="muted">保单 ${escapeHtml(result.policyNo)} · ${escapeHtml(result.product)} · 置信度 ${Math.round((result.confidence || 0) * 100)}%</div>
      </div>
      <div class="decision">${escapeHtml(LABELS[decision] || decision)}</div>
    </div>
    <div class="amounts">
      <div class="amount"><b>${money(result.claimedAmount)}</b><span>报损金额</span></div>
      <div class="amount"><b>${money(result.coveredAmount)}</b><span>保障内金额</span></div>
      <div class="amount"><b>${money(result.deductible)}</b><span>免赔额</span></div>
      <div class="amount"><b>${money(result.approvedAmount)}</b><span>可赔金额</span></div>
    </div>
  </div>

  ${items ? `<div class="card"><h2>受损项目</h2><table><thead><tr><th>项目</th><th>类别</th><th>工时</th><th>材料</th><th>保障</th><th>金额</th></tr></thead><tbody>${items}</tbody></table></div>` : ''}

  <div class="card">
    <h2>检查项</h2>
    <table><thead><tr><th>检查</th><th>结果</th><th>说明</th></tr></thead><tbody>${checks}</tbody></table>
  </div>

  ${reasons ? `<div class="card"><h2>原因</h2><ul>${reasons}</ul></div>` : ''}
  ${citations ? `<div class="card"><h2>条款依据</h2>${citations}</div>` : ''}

  <div class="foot">Generated by Claim Lens · rules-first, clause-cited claim adjudication</div>
</div>
</body>
</html>`;
}

export default renderReport;
