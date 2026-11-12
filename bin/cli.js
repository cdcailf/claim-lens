#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessClaim } from '../src/assess.js';
import { formatAssessment, decisionLabel } from '../src/format.js';
import { renderReport } from '../src/report.js';
import { runEval } from '../src/eval.js';
import { explainResult } from '../src/llm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = true;
      }
    } else {
      options._.push(arg);
    }
  }
  return options;
}

function usage() {
  console.log(`Claim Lens — rules-first, clause-cited claim adjudication

Usage:
  claim-lens assess --policy data/policies/p1.json --claim data/claims/c1.json [--json] [--html out.html] [--explain]
  claim-lens eval [--json]
  claim-lens list

Environment:
  LLM_API_KEY / OPENAI_API_KEY   optional, for --explain narrative
  LLM_BASE_URL                   default https://api.openai.com/v1
  LLM_MODEL                      default gpt-4o-mini
`);
}

function listData() {
  const policies = fs.readdirSync(path.join(root, 'data/policies')).filter((f) => f.endsWith('.json'));
  const claims = fs.readdirSync(path.join(root, 'data/claims')).filter((f) => f.endsWith('.json'));
  console.log('Policies');
  for (const file of policies) {
    const policy = readJson(path.join(root, 'data/policies', file));
    console.log(`  ${file}  ${policy.policyNo}  ${policy.product}  (${policy.period.start} ~ ${policy.period.end})`);
  }
  console.log('\nClaims');
  for (const file of claims) {
    const claim = readJson(path.join(root, 'data/claims', file));
    console.log(`  ${file}  ${claim.claimNo}  ${claim.policyNo}  ${claim.incidentAt}  ¥${claim.damageItems.reduce((sum, item) => sum + Number(item.labor || 0) + Number(item.parts || 0), 0)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0] || 'help';

  if (command === 'help' || options.help) {
    usage();
    return;
  }

  if (command === 'list') {
    listData();
    return;
  }

  if (command === 'eval') {
    const result = runEval();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.failed ? 1 : 0;
      return;
    }
    console.log(`Claim Lens eval · ${result.passed}/${result.total} passed · accuracy ${result.accuracy}%`);
    console.log('');
    for (const row of result.rows) {
      const mark = row.passed ? '✓' : '✗';
      const expected = decisionLabel(row.expected.decision);
      const actual = decisionLabel(row.actual.decision);
      const amount = row.expected.approvedAmount === undefined ? '' : ` · expected ¥${row.expected.approvedAmount}`;
      console.log(`${mark} ${row.name} · expected ${expected}${amount} · got ${actual} ¥${row.actual.approvedAmount}`);
      if (!row.passed) {
        console.log(`    decisionOk=${row.decisionOk} amountOk=${row.amountOk}`);
      }
    }
    process.exitCode = result.failed ? 1 : 0;
    return;
  }

  if (command === 'assess') {
    if (!options.policy || !options.claim) {
      usage();
      process.exitCode = 1;
      return;
    }
    const policy = readJson(options.policy);
    const claim = readJson(options.claim);
    const result = assessClaim(policy, claim);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatAssessment(result));
    }

    if (options.html) {
      const out = path.resolve(options.html === true ? 'claim-lens-report.html' : options.html);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, renderReport(result));
      console.log(`\nHTML report: ${out}`);
    }

    if (options.explain) {
      const narrative = await explainResult(result);
      console.log(`\n说明：${narrative}`);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
