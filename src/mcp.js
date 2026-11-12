import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { assessClaim } from './assess.js';
import { explainResult } from './llm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyDir = path.join(root, 'data/policies');

function loadPolicies() {
  return fs.readdirSync(policyDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(policyDir, file), 'utf8')));
}

function findPolicy(policyNo) {
  return loadPolicies().find((policy) => policy.policyNo === policyNo) || null;
}

function jsonContent(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

const claimSchema = z.object({
  claimNo: z.string().optional(),
  policyNo: z.string().optional(),
  incidentAt: z.string().optional(),
  mileage: z.number().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  priorClaims: z.number().optional(),
  damageItems: z.array(z.object({
    part: z.string(),
    category: z.string(),
    labor: z.number().optional(),
    parts: z.number().optional()
  })).optional()
}).passthrough();

export function createServer() {
  const server = new McpServer({
    name: 'claim-lens',
    version: '0.2.0'
  });

  server.tool(
    'list_policies',
    'List the synthetic policies bundled with Claim Lens.',
    {},
    async () => jsonContent(loadPolicies().map((policy) => ({
      policyNo: policy.policyNo,
      product: policy.product,
      period: policy.period,
      mileageLimit: policy.mileageLimit,
      coverage: (policy.coverage || []).map((item) => item.name)
    })))
  );

  server.tool(
    'get_policy',
    'Get one policy, including coverage categories, exclusions, limits and clause text.',
    { policyNo: z.string() },
    async ({ policyNo }) => {
      const policy = findPolicy(policyNo);
      if (!policy) {
        return { isError: true, content: [{ type: 'text', text: `Policy not found: ${policyNo}` }] };
      }
      return jsonContent(policy);
    }
  );

  server.tool(
    'assess_claim',
    'Assess a claim against a policy. Returns decision, amounts, checks, reasons and clause citations.',
    {
      policyNo: z.string().optional().describe('Bundled policy number, e.g. CTXP-2026-0001'),
      policy: z.record(z.string(), z.any()).optional().describe('Inline policy object, used instead of policyNo'),
      claim: claimSchema
    },
    async ({ policyNo, policy, claim }) => {
      const resolved = policy || (policyNo ? findPolicy(policyNo) : null);
      if (!resolved) {
        return { isError: true, content: [{ type: 'text', text: 'Pass policyNo of a bundled policy or an inline policy object.' }] };
      }
      const result = assessClaim(resolved, claim);
      return jsonContent(result);
    }
  );

  server.tool(
    'explain_claim',
    'Assess a claim and return a short natural-language explanation. Amounts and citations still come from the rules engine.',
    {
      policyNo: z.string().optional(),
      policy: z.record(z.any()).optional(),
      claim: claimSchema
    },
    async ({ policyNo, policy, claim }) => {
      const resolved = policy || (policyNo ? findPolicy(policyNo) : null);
      if (!resolved) {
        return { isError: true, content: [{ type: 'text', text: 'Pass policyNo of a bundled policy or an inline policy object.' }] };
      }
      const result = assessClaim(resolved, claim);
      const narrative = await explainResult(result);
      return {
        content: [
          { type: 'text', text: narrative },
          { type: 'text', text: JSON.stringify(result, null, 2) }
        ]
      };
    }
  );

  return server;
}

export async function startMcpServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('claim-lens MCP server ready on stdio');
}

export default startMcpServer;
