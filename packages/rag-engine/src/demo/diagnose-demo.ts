import assert from 'node:assert/strict';
import type { LLMAdapter } from '../diagnosis-types.js';
import { diagnoseFault } from '../diagnosis-engine.js';
import { FALLBACK_DIAGNOSIS } from '../fallback.js';
import { HttpLLMAdapter, selectLLMAdapter } from '../llm-adapter.js';
import { isFaultDiagnosisResult } from '../validate.js';
import { diagnosisDemoKnowledge } from './sample-knowledge.js';

const symptoms = ['冷车启动困难，怠速容易熄火', '刹车手感变软，制动力下降', '水温过高且风扇不转'];

const invalidJsonFetch = (async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: '这不是 JSON' } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

const timeoutFetch = (async (_input: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const rejectAbort = (): void => reject(new DOMException('请求超时', 'AbortError'));
    if (signal?.aborted) rejectAbort();
    signal?.addEventListener('abort', rejectAbort, { once: true });
  })) as typeof fetch;

const forgedReferenceAdapter: LLMAdapter = {
  async generateDiagnosis() {
    return {
      diagnosis: '这份内容包含伪造引用，必须整体丢弃。',
      possibleCauses: [{ cause: '伪造原因', probability: 0.9, solution: '伪造方案' }],
      requiredParts: [],
      references: [{ knowledgeId: 'forged-knowledge-id' }],
    };
  },
};

async function main(): Promise<void> {
  const normalResults = [];
  const selection = selectLLMAdapter(process.env);
  const adapter = selection.adapter;
  for (const [index, symptom] of symptoms.entries()) {
    const outcome = await diagnoseFault(symptom, diagnosisDemoKnowledge, adapter, {
      queryId: `demo-query-${index + 1}`,
    });
    assert.equal(outcome.degraded, false);
    assert.equal(isFaultDiagnosisResult(outcome.result), true);
    normalResults.push({
      symptom,
      topFive: outcome.context.map(({ knowledgeId, sourceType, score }) => ({
        knowledgeId,
        sourceType,
        score,
      })),
      result: outcome.result,
    });
  }

  const invalidJson = await diagnoseFault(
    symptoms[0] as string,
    diagnosisDemoKnowledge,
    new HttpLLMAdapter({
      baseUrl: 'https://local.invalid/v1',
      apiKey: 'demo-key',
      model: 'invalid-json-fixture',
      fetchImpl: invalidJsonFetch,
    }),
    { queryId: 'demo-invalid-json' },
  );
  const timeout = await diagnoseFault(
    symptoms[1] as string,
    diagnosisDemoKnowledge,
    new HttpLLMAdapter({
      baseUrl: 'https://local.invalid/v1',
      apiKey: 'demo-key',
      model: 'timeout-fixture',
      timeoutMs: 20,
      fetchImpl: timeoutFetch,
    }),
    { queryId: 'demo-timeout' },
  );
  const forgedReference = await diagnoseFault(
    symptoms[2] as string,
    diagnosisDemoKnowledge,
    forgedReferenceAdapter,
    { queryId: 'demo-forged-reference' },
  );

  const fallbackResults = { invalidJson, timeout, forgedReference };
  for (const outcome of Object.values(fallbackResults)) {
    assert.equal(outcome.degraded, true);
    assert.equal(outcome.result.diagnosis, FALLBACK_DIAGNOSIS);
    assert.equal(outcome.result.possibleCauses.length, 0);
    assert.equal(outcome.result.requiredParts.length, 0);
    assert.equal(outcome.result.references.length, outcome.context.length);
    assert.equal(isFaultDiagnosisResult(outcome.result), true);
  }

  console.log(
    JSON.stringify(
      {
        mode: selection.mode,
        modeNote: selection.note,
        note: '所有知识与诊断内容均为工程测试数据，不可作为真实维修建议。',
        normal: {
          cases: normalResults.length,
          schemaValid: normalResults.length,
          results: normalResults,
        },
        fallback: {
          invalidJson,
          timeout,
          forgedReference,
        },
      },
      null,
      2,
    ),
  );
}

await main();
