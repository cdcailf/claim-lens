import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/mcp.js';

test('MCP server exposes and runs assess_claim', { timeout: 20000 }, async () => {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'claim-lens-test', version: '0.0.1' });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes('list_policies'));
  assert.ok(names.includes('get_policy'));
  assert.ok(names.includes('assess_claim'));
  assert.ok(names.includes('explain_claim'));

  const result = await client.callTool({
    name: 'assess_claim',
    arguments: {
      policyNo: 'CTXP-2026-0001',
      claim: {
        claimNo: 'CLM-MCP-1',
        incidentAt: '2026-06-01',
        mileage: 42000,
        description: '动力电池模组故障，车辆无法行驶。',
        attachments: ['invoice.jpg'],
        damageItems: [{ part: '动力电池模组', category: '三电系统', labor: 1200, parts: 8600 }]
      }
    }
  });

  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.decision, 'approved');
  assert.equal(payload.approvedAmount, 9300);
  assert.ok(payload.citations.some((item) => item.clauseId === 'CL-A1'));

  await client.close();
  await server.close();
});
