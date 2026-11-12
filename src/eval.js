import { assessClaim } from './assess.js';
import { buildCases } from './cases.js';

export function runEval() {
  const cases = buildCases();
  const rows = cases.map((testCase) => {
    const result = assessClaim(testCase.policy, testCase.claim);
    const decisionOk = result.decision === testCase.expected.decision;
    const amountOk = testCase.expected.approvedAmount === undefined
      || result.approvedAmount === testCase.expected.approvedAmount;
    return {
      name: testCase.name,
      expected: testCase.expected,
      actual: {
        decision: result.decision,
        approvedAmount: result.approvedAmount,
        confidence: result.confidence
      },
      passed: decisionOk && amountOk,
      decisionOk,
      amountOk
    };
  });
  const passed = rows.filter((row) => row.passed).length;
  return {
    total: rows.length,
    passed,
    failed: rows.length - passed,
    accuracy: rows.length ? Math.round((passed / rows.length) * 10000) / 100 : 0,
    rows
  };
}

export default runEval;
