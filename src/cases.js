import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

const p1 = load('data/policies/p1.json');
const p2 = load('data/policies/p2.json');
const p3 = load('data/policies/p3.json');
const c1 = load('data/claims/c1.json');
const c2 = load('data/claims/c2.json');
const c3 = load('data/claims/c3.json');
const c4 = load('data/claims/c4.json');
const c5 = load('data/claims/c5.json');
const c6 = load('data/claims/c6.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withPolicy(base, patch) {
  const policy = clone(base);
  Object.assign(policy, patch);
  if (patch.period) policy.period = { ...base.period, ...patch.period };
  return policy;
}

function withClaim(base, patch) {
  return { ...clone(base), ...patch };
}

export function buildCases() {
  return [
    {
      name: '电池故障，正常赔付',
      policy: p1,
      claim: c1,
      expected: { decision: 'approved', approvedAmount: 9300 }
    },
    {
      name: '事故发生在保障期结束之后',
      policy: p1,
      claim: withClaim(c1, { incidentAt: '2030-01-01' }),
      expected: { decision: 'rejected' }
    },
    {
      name: '里程超出承保上限',
      policy: p1,
      claim: withClaim(c1, { mileage: 120000 }),
      expected: { decision: 'rejected' }
    },
    {
      name: '营运车辆，命中免责',
      policy: p1,
      claim: withClaim(c1, { description: '该车为网约车，动力电池故障。' }),
      expected: { decision: 'rejected' }
    },
    {
      name: '仅更换轮胎，不在保障范围',
      policy: p1,
      claim: withClaim(c1, {
        description: '右前轮胎鼓包，申请更换。',
        damageItems: [{ part: '右前轮胎', category: '轮胎', labor: 0, parts: 800 }]
      }),
      expected: { decision: 'rejected' }
    },
    {
      name: '电池可赔、轮胎不保，部分赔付',
      policy: p1,
      claim: c4,
      expected: { decision: 'partial', approvedAmount: 5500 }
    },
    {
      name: '扣免赔后无可赔金额',
      policy: p1,
      claim: c5,
      expected: { decision: 'rejected' }
    },
    {
      name: '超过单次限额，按限额赔付',
      policy: withPolicy(p1, { perClaimLimit: 30000, manualReviewThreshold: 100000 }),
      claim: c6,
      expected: { decision: 'partial', approvedAmount: 29500 }
    },
    {
      name: '年度剩余额度不足',
      policy: withPolicy(p1, { annualUsed: 98000 }),
      claim: c1,
      expected: { decision: 'partial', approvedAmount: 1500 }
    },
    {
      name: '等待期内出险',
      policy: p2,
      claim: withClaim(c2, { incidentAt: '2026-03-10' }),
      expected: { decision: 'rejected' }
    },
    {
      name: '材料保单号不匹配',
      policy: p1,
      claim: withClaim(c1, { policyNo: 'CTXP-OTHER' }),
      expected: { decision: 'rejected' }
    },
    {
      name: '保单已失效',
      policy: withPolicy(p1, { status: 'cancelled' }),
      claim: c1,
      expected: { decision: 'rejected' }
    },
    {
      name: '缺少维修材料，转人工',
      policy: p1,
      claim: withClaim(c1, { attachments: [] }),
      expected: { decision: 'manual_review', approvedAmount: 9300 }
    },
    {
      name: '大额报损，转人工',
      policy: p1,
      claim: c6,
      expected: { decision: 'manual_review' }
    },
    {
      name: '历史理赔次数过多，转人工',
      policy: p1,
      claim: withClaim(c1, { priorClaims: 3 }),
      expected: { decision: 'manual_review' }
    },
    {
      name: '事故描述过短，转人工',
      policy: p1,
      claim: withClaim(c1, { description: '电池坏了' }),
      expected: { decision: 'manual_review' }
    },
    {
      name: '事故早于起保日',
      policy: p1,
      claim: withClaim(c1, { incidentAt: '2025-12-01' }),
      expected: { decision: 'rejected' }
    },
    {
      name: '未知受损类别',
      policy: p1,
      claim: withClaim(c1, {
        damageItems: [{ part: '前挡风玻璃', category: '玻璃', labor: 0, parts: 2000 }]
      }),
      expected: { decision: 'rejected' }
    },
    {
      name: '变速箱故障，燃油车延保',
      policy: p2,
      claim: c2,
      expected: { decision: 'approved', approvedAmount: 8700 }
    },
    {
      name: '空气悬架故障，豪华车保障',
      policy: p3,
      claim: c3,
      expected: { decision: 'approved', approvedAmount: 14000 }
    }
  ];
}

export default buildCases;
