import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessClaim } from '../src/assess.js';
import { buildCases } from '../src/cases.js';
import { runEval } from '../src/eval.js';
import { renderReport } from '../src/report.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const p1 = readJson('data/policies/p1.json');
const c1 = readJson('data/claims/c1.json');

test('clean battery claim is approved after deductible', () => {
  const result = assessClaim(p1, c1);
  assert.equal(result.decision, 'approved');
  assert.equal(result.claimedAmount, 9800);
  assert.equal(result.coveredAmount, 9800);
  assert.equal(result.deductible, 500);
  assert.equal(result.approvedAmount, 9300);
  assert.ok(result.citations.some((item) => item.clauseId === 'CL-A1'));
  assert.ok(result.citations.some((item) => item.clauseId === 'CL-DEDUCT'));
});

test('expired policy is rejected with clause-less reason', () => {
  const result = assessClaim(p1, { ...c1, incidentAt: '2030-01-01' });
  assert.equal(result.decision, 'rejected');
  assert.equal(result.approvedAmount, 0);
  assert.ok(result.reasons.some((item) => item.code === 'policy_expired'));
});

test('mileage over limit is rejected', () => {
  const result = assessClaim(p1, { ...c1, mileage: 120000 });
  assert.equal(result.decision, 'rejected');
  assert.ok(result.reasons.some((item) => item.code === 'mileage_exceeded'));
});

test('operating vehicle hits exclusion clause', () => {
  const result = assessClaim(p1, { ...c1, description: '该车为网约车，电池故障。' });
  assert.equal(result.decision, 'rejected');
  assert.ok(result.reasons.some((item) => item.code === 'exclusion' && item.clauseId === 'CL-EX-01'));
});

test('uncovered part yields partial payment', () => {
  const claim = readJson('data/claims/c4.json');
  const result = assessClaim(p1, claim);
  assert.equal(result.decision, 'partial');
  assert.equal(result.claimedAmount, 6800);
  assert.equal(result.coveredAmount, 6000);
  assert.equal(result.approvedAmount, 5500);
});

test('deductible larger than loss is rejected', () => {
  const claim = readJson('data/claims/c5.json');
  const result = assessClaim(p1, claim);
  assert.equal(result.decision, 'rejected');
  assert.ok(result.reasons.some((item) => item.code === 'deductible_exceeds'));
});

test('per-claim limit caps the payout', () => {
  const policy = { ...p1, perClaimLimit: 30000, manualReviewThreshold: 100000 };
  const claim = readJson('data/claims/c6.json');
  const result = assessClaim(policy, claim);
  assert.equal(result.decision, 'partial');
  assert.equal(result.approvedAmount, 29500);
  assert.ok(result.reasons.some((item) => item.code === 'per_claim_limit'));
});

test('annual remaining cap applies', () => {
  const policy = { ...p1, annualUsed: 98000 };
  const result = assessClaim(policy, c1);
  assert.equal(result.decision, 'partial');
  assert.equal(result.approvedAmount, 1500);
});

test('missing attachments triggers manual review but keeps amount', () => {
  const result = assessClaim(p1, { ...c1, attachments: [] });
  assert.equal(result.decision, 'manual_review');
  assert.equal(result.approvedAmount, 9300);
  assert.ok(result.manualReviewReasons.length > 0);
});

test('eval suite is fully green', () => {
  const result = runEval();
  assert.equal(result.total, 20);
  assert.equal(result.failed, 0);
  assert.equal(result.accuracy, 100);
});

test('html report includes decision, amounts, and clause quote', () => {
  const result = assessClaim(p1, c1);
  const html = renderReport(result);
  assert.match(html, /可赔付/);
  assert.match(html, /9,300\.00/);
  assert.match(html, /动力电池/);
  assert.match(html, /CL-A1/);
});

test('all eval cases are resolvable', () => {
  for (const testCase of buildCases()) {
    const result = assessClaim(testCase.policy, testCase.claim);
    assert.ok(result.decision, `${testCase.name} has a decision`);
  }
});
