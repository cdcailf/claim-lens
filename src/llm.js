/**
 * Optional natural-language explanation.
 * Works with any OpenAI-compatible endpoint; falls back to a local template.
 */
export async function explainResult(result) {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const fallback = localExplanation(result);
  if (!apiKey) return fallback;

  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const prompt = [
    '你是保险理赔审核助手。根据结构化结果写一段 120 字以内的中文说明。',
    '要求：先给结论，再说金额和依据，不要编造条款。',
    JSON.stringify({
      claimNo: result.claimNo,
      decision: result.decision,
      claimedAmount: result.claimedAmount,
      coveredAmount: result.coveredAmount,
      deductible: result.deductible,
      approvedAmount: result.approvedAmount,
      reasons: result.reasons,
      citations: result.citations
    })
  ].join('\n');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function localExplanation(result) {
  const labels = {
    approved: '可赔付',
    partial: '部分赔付',
    rejected: '拒赔',
    manual_review: '需人工复核'
  };
  const label = labels[result.decision] || result.decision;
  const money = (n) => `¥${(Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  const reasons = (result.reasons || []).map((item) => item.message).join('；') || '未发现异常';
  const clauses = (result.citations || []).map((item) => item.clauseId).join('、');
  return `${label}：报损 ${money(result.claimedAmount)}，保障内 ${money(result.coveredAmount)}，扣除免赔额 ${money(result.deductible)} 后核定 ${money(result.approvedAmount)}。依据：${reasons}${clauses ? `；条款 ${clauses}` : ''}。`;
}

export default explainResult;
