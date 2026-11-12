import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePolicyText, importPolicyFromPdf } from '../src/pdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parses policy fields from plain text', () => {
  const text = fs.readFileSync(path.join(root, 'examples/policy-sample.txt'), 'utf8');
  const result = parsePolicyText(text);
  assert.equal(result.policy.policyNo, 'CTXP-2026-0001');
  assert.deepEqual(result.policy.period, { start: '2026-01-01', end: '2029-01-01' });
  assert.equal(result.policy.mileageLimit, 100000);
  assert.equal(result.policy.deductible, 500);
  assert.equal(result.policy.perClaimLimit, 50000);
  assert.deepEqual(result.policy.coverage.map((item) => item.name), ['三电系统', '电控系统', '车身结构件']);
  assert.ok(result.policy.exclusions.some((item) => item.keywords.includes('营运')));
  assert.ok(Object.keys(result.policy.clauses).length >= 4);
});

test('extracts text from a digital PDF and builds a draft', async () => {
  const result = await importPolicyFromPdf(path.join(root, 'examples/policy-sample.pdf'));
  assert.equal(result.totalPages, 1);
  assert.equal(result.policy.policyNo, 'CTXP-2026-0001');
  assert.deepEqual(result.policy.period, { start: '2026-01-01', end: '2029-01-01' });
  assert.equal(result.policy.mileageLimit, 100000);
  assert.deepEqual(result.policy.coverage.map((item) => item.name), ['三电系统', '电控系统', '车身结构件']);
  assert.ok(result.policy.exclusions.length >= 3);
});

test('draft policy can be assessed end to end', async () => {
  const { assessClaim } = await import('../src/assess.js');
  const { policy } = await importPolicyFromPdf(path.join(root, 'examples/policy-sample.pdf'));
  const claim = {
    claimNo: 'CLM-PDF-1',
    policyNo: policy.policyNo,
    incidentAt: '2026-06-01',
    mileage: 42000,
    description: '动力电池模组故障，车辆无法行驶。',
    attachments: ['invoice.jpg'],
    damageItems: [{ part: '动力电池模组', category: '三电系统', labor: 1200, parts: 8600 }]
  };
  const result = assessClaim(policy, claim);
  assert.equal(result.decision, 'approved');
  assert.equal(result.approvedAmount, 9300);
});
