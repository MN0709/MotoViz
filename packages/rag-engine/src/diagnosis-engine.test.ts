import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Part } from '@motorcycle-ai/shared';
import type { LLMAdapter } from './diagnosis-types.js';
import { diagnoseFault } from './diagnosis-engine.js';
import { FALLBACK_DIAGNOSIS } from './fallback.js';
import {
  HttpLLMAdapter,
  MockLLMAdapter,
  resolveLLMTimeoutMs,
  selectLLMAdapter,
} from './llm-adapter.js';
import type { KnowledgeDocument } from './knowledge-search.js';
import { searchKnowledge } from './knowledge-search.js';
import { buildDiagnosisMessages } from './prompts.js';
import { bindReferences } from './reference-binder.js';
import { isFaultDiagnosisResult } from './validate.js';
import { diagnosisDemoKnowledge } from './demo/sample-knowledge.js';

test('knowledge search returns up to five positive manual/fault-case hits', () => {
  const hits = searchKnowledge('冷车启动困难，怠速熄火', diagnosisDemoKnowledge);
  assert.ok(hits.length > 0 && hits.length <= 5);
  assert.equal(
    hits.every((hit) => hit.score > 0),
    true,
  );
  assert.equal(
    hits.some((hit) => hit.sourceType === 'part-catalog'),
    false,
  );
  for (let index = 1; index < hits.length; index += 1) {
    assert.ok((hits[index - 1]?.score ?? 0) >= (hits[index]?.score ?? 0));
  }
});

test('fault-case receives a 1.2 ranking boost', () => {
  const documents: KnowledgeDocument[] = [
    {
      knowledgeId: 'manual-a',
      title: '冷车启动',
      sourceType: 'manual',
      sourceUrl: 'https://example.com/manual-a',
      content: '冷车启动困难',
    },
    {
      knowledgeId: 'case-b',
      title: '冷车启动',
      sourceType: 'fault-case',
      sourceUrl: 'https://example.com/case-b',
      content: '冷车启动困难',
    },
  ];
  const hits = searchKnowledge('冷车启动困难', documents);
  assert.equal(hits[0]?.knowledgeId, 'case-b');
  assert.equal(hits[0]?.score, Number(((hits[1]?.score ?? 0) * 1.2).toFixed(4)));
});

test('prompt injects knowledge IDs and constrains references', () => {
  const context = searchKnowledge('冷车启动', diagnosisDemoKnowledge);
  const messages = buildDiagnosisMessages('冷车启动', context);
  // 组长的prompt包含 system + 2轮few-shot(各2条) + 最终user，共6条消息
  assert.equal(messages.length, 6);
  assert.match(messages[0]?.content ?? '', /references/);
  // 最后一条是user消息，包含references数组（注入的知识条目）
  const lastMessage = messages[messages.length - 1];
  const userPayload = JSON.parse(lastMessage?.content ?? '{}') as { references?: { knowledgeId: string }[] };
  assert.equal(userPayload.references?.length, context.length);
  assert.match(lastMessage?.content ?? '', new RegExp(context[0]?.knowledgeId ?? 'missing'));
});

test('reference binder uses trusted metadata and rejects one forged ID entirely', () => {
  const context = searchKnowledge('冷车启动', diagnosisDemoKnowledge);
  const first = context[0];
  assert.ok(first);
  const bound = bindReferences(
    [{ knowledgeId: first.knowledgeId }, { knowledgeId: first.knowledgeId }],
    context,
  );
  assert.equal(bound.length, 1);
  assert.equal(bound[0]?.title, first.title);
  assert.throws(
    () =>
      bindReferences([{ knowledgeId: first.knowledgeId }, { knowledgeId: 'forged-id' }], context),
    /上下文之外/,
  );
});

test('three mock symptoms produce valid complete results', async () => {
  const cases = [
    { symptom: '冷车启动困难，怠速熄火', expectedTopId: 'case-ninja400-cold-start' },
    { symptom: '刹车手感变软', expectedTopId: 'case-brake-hose-leak' },
    // 同义词扩展后，"水温过高"匹配到"冷却风扇"案例，排到第一
    { symptom: '水温过高且风扇不转', expectedTopId: 'case-cooling-fan' },
  ];
  for (const [index, testCase] of cases.entries()) {
    const { symptom, expectedTopId } = testCase;
    const outcome = await diagnoseFault(symptom, diagnosisDemoKnowledge, new MockLLMAdapter(), {
      queryId: `test-normal-${index + 1}`,
    });
    assert.equal(outcome.degraded, false);
    assert.equal(isFaultDiagnosisResult(outcome.result), true);
    assert.equal(outcome.context.length, 5);
    assert.equal(outcome.context[0]?.knowledgeId, expectedTopId);
    const trustedIds = new Set(outcome.context.map((hit) => hit.knowledgeId));
    assert.equal(
      outcome.result.references.every((reference) => trustedIds.has(reference.knowledgeId)),
      true,
    );
  }
});

test('empty knowledge corpus returns no-context fallback instead of fabricating', async () => {
  const outcome = await diagnoseFault('任意症状', [], new MockLLMAdapter(), {
    queryId: 'empty-context',
  });
  assert.equal(outcome.degraded, true);
  assert.equal(outcome.fallbackReason, 'no-context');
  assert.equal(outcome.context.length, 0);
  assert.equal(outcome.result.references.length, 0);
  assert.match(outcome.result.diagnosis, /未找到/);
});

test('unmatched symptom returns no-context fallback instead of zero-score diagnosis', async () => {
  const outcome = await diagnoseFault(
    '完全未知的 xyz 症状',
    diagnosisDemoKnowledge,
    new MockLLMAdapter(),
  );
  assert.equal(outcome.degraded, true);
  assert.equal(outcome.fallbackReason, 'no-context');
  assert.equal(outcome.context.length, 0);
  assert.equal(outcome.result.references.length, 0);
  assert.match(outcome.result.diagnosis, /未找到/);
});

test('duplicate or incomplete knowledge records are rejected', () => {
  const first = diagnosisDemoKnowledge[0];
  assert.ok(first);
  assert.throws(() => searchKnowledge('冷车', [first, { ...first }]), /ID 重复/);
  assert.throws(() => searchKnowledge('冷车', [{ ...first, sourceUrl: '' }]), /均不能为空/);
});

function assertFallback(
  outcome: Awaited<ReturnType<typeof diagnoseFault>>,
  expectedReason: string,
): void {
  assert.equal(outcome.degraded, true);
  assert.equal(outcome.fallbackReason, expectedReason);
  assert.equal(outcome.result.diagnosis, FALLBACK_DIAGNOSIS);
  assert.deepEqual(outcome.result.possibleCauses, []);
  assert.deepEqual(outcome.result.requiredParts, []);
  assert.ok(outcome.context.length > 0 && outcome.context.length <= 5);
  assert.equal(outcome.result.references.length, outcome.context.length);
  assert.equal(isFaultDiagnosisResult(outcome.result), true);
}

test('invalid JSON causes whole-result fallback', async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  const adapter = new HttpLLMAdapter({
    baseUrl: 'https://local.invalid/v1',
    apiKey: 'test',
    model: 'invalid-json',
    fetchImpl,
  });
  const outcome = await diagnoseFault('冷车启动困难', diagnosisDemoKnowledge, adapter, {
    queryId: 'invalid-json',
  });
  assertFallback(outcome, 'invalid-json');
});

test('AbortController timeout causes whole-result fallback', async () => {
  let observedAbort = false;
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const rejectAbort = (): void => {
        observedAbort = true;
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (init?.signal?.aborted) rejectAbort();
      init?.signal?.addEventListener('abort', rejectAbort, { once: true });
    });
  }) as typeof fetch;
  const adapter = new HttpLLMAdapter({
    baseUrl: 'https://local.invalid/v1',
    apiKey: 'test',
    model: 'timeout',
    timeoutMs: 20,
    fetchImpl,
  });
  const outcome = await diagnoseFault('刹车手感变软', diagnosisDemoKnowledge, adapter, {
    queryId: 'timeout',
  });
  assert.equal(observedAbort, true);
  assertFallback(outcome, 'timeout');
});

test('HTTP timeout is always capped at 2000ms', () => {
  assert.equal(resolveLLMTimeoutMs(), 2000);
  assert.equal(resolveLLMTimeoutMs(9000), 2000);
  assert.equal(resolveLLMTimeoutMs(20), 20);
});

test('one forged knowledge ID causes whole-result fallback', async () => {
  const adapter: LLMAdapter = {
    async generateDiagnosis(_symptom, context) {
      return {
        diagnosis: '不应返回的诊断',
        possibleCauses: [{ cause: '原因', probability: 0.8, solution: '方案' }],
        requiredParts: [],
        references: [{ knowledgeId: context[0]?.knowledgeId }, { knowledgeId: 'forged-id' }],
      };
    },
  };
  const outcome = await diagnoseFault('水温过高', diagnosisDemoKnowledge, adapter, {
    queryId: 'forged',
  });
  assertFallback(outcome, 'invalid-reference');
});

test('untrusted required parts cause whole-result fallback', async () => {
  const adapter: LLMAdapter = {
    async generateDiagnosis(_symptom, context) {
      return {
        diagnosis: '包含未绑定库存的诊断',
        possibleCauses: [{ cause: '原因', probability: 0.8, solution: '方案' }],
        requiredParts: [{ partId: 'fake', name: '伪造配件', brand: '伪造品牌', stock: 99 }],
        references: [{ knowledgeId: context[0]?.knowledgeId }],
      };
    },
  };
  const outcome = await diagnoseFault('冷车启动困难', diagnosisDemoKnowledge, adapter);
  assertFallback(outcome, 'invalid-structure');
});

test('blank supplied queryId is replaced before fallback', async () => {
  const adapter: LLMAdapter = {
    async generateDiagnosis() {
      throw new Error('fixture error');
    },
  };
  const outcome = await diagnoseFault('冷车启动困难', diagnosisDemoKnowledge, adapter, {
    queryId: '   ',
  });
  assert.match(outcome.result.queryId, /^query-/u);
  assertFallback(outcome, 'llm-error');
});

test('HTTP adapter sends json_object request and accepts valid JSON', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const context = searchKnowledge('冷车启动', diagnosisDemoKnowledge);
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                diagnosis: '结构化诊断',
                possibleCauses: [{ cause: '原因', probability: 0.5, solution: '方案' }],
                requiredParts: [],
                references: [{ knowledgeId: context[0]?.knowledgeId }],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
  const adapter = new HttpLLMAdapter({
    baseUrl: 'https://local.invalid/v1',
    apiKey: 'test',
    model: 'valid-json',
    fetchImpl,
  });
  const outcome = await diagnoseFault('冷车启动', diagnosisDemoKnowledge, adapter, {
    queryId: 'valid-http',
  });
  assert.equal(outcome.degraded, false);
  assert.deepEqual(requestBody?.response_format, { type: 'json_object' });
});

test('LLM_MODE selects mock or configured HTTP safely', () => {
  assert.equal(selectLLMAdapter({}).mode, 'mock');
  assert.equal(selectLLMAdapter({ LLM_MODE: 'http' }).mode, 'mock');
  assert.equal(
    selectLLMAdapter({
      LLM_MODE: 'http',
      LLM_BASE_URL: 'https://example.com/v1',
      LLM_API_KEY: 'key',
      LLM_MODEL: 'model',
    }).mode,
    'http',
  );
});

// 大组长实测发现的问题：编造配件也能通过（stock=0但partId不存在）
test('forged partId causes invalid-part fallback', async () => {
  const partsCatalog: Part[] = [
    {
      partId: 'part-1',
      name: '真实排气',
      brand: '真实品牌',
      partType: 'exhaust',
      fitModels: ['春风250SR'],
      price: 1000,
      source: '测试',
      sourceUrl: 'https://example.com/part-1',
    },
  ];
  const adapter: LLMAdapter = {
    async generateDiagnosis(_symptom, context) {
      return {
        diagnosis: '包含伪造配件的诊断',
        possibleCauses: [{ cause: '原因', probability: 0.8, solution: '方案' }],
        requiredParts: [{ partId: 'fake-part', name: '伪造配件', brand: '伪造品牌', stock: 0 }],
        references: [{ knowledgeId: context[0]?.knowledgeId }],
      };
    },
  };
  const outcome = await diagnoseFault('冷车启动困难', diagnosisDemoKnowledge, adapter, {
    partsCatalog,
  });
  assert.equal(outcome.degraded, true);
  assert.equal(outcome.fallbackReason, 'invalid-part');
});

// 大组长实测发现的问题：车型不匹配仍推荐
test('parts not fitting motorcycle model are filtered out', async () => {
  const partsCatalog: Part[] = [
    {
      partId: 'part-1',
      name: '适配春风250SR的排气',
      brand: '品牌A',
      partType: 'exhaust',
      fitModels: ['春风250SR'],
      price: 1000,
      source: '测试',
      sourceUrl: 'https://example.com/part-1',
    },
    {
      partId: 'part-2',
      name: '适配雅马哈R3的排气',
      brand: '品牌B',
      partType: 'exhaust',
      fitModels: ['雅马哈R3'],
      price: 2000,
      source: '测试',
      sourceUrl: 'https://example.com/part-2',
    },
  ];
  const adapter: LLMAdapter = {
    async generateDiagnosis(_symptom, context) {
      return {
        diagnosis: '推荐两个配件',
        possibleCauses: [{ cause: '原因', probability: 0.8, solution: '方案' }],
        requiredParts: [
          { partId: 'part-1', name: '随便写', brand: '随便写', stock: 0 },
          { partId: 'part-2', name: '随便写', brand: '随便写', stock: 0 },
        ],
        references: [{ knowledgeId: context[0]?.knowledgeId }],
      };
    },
  };
  const outcome = await diagnoseFault('冷车启动困难', diagnosisDemoKnowledge, adapter, {
    partsCatalog,
    motorcycleModel: '春风250SR',
  });
  assert.equal(outcome.degraded, false);
  // 只返回适配春风250SR的配件，雅马哈R3的被过滤掉
  assert.equal(outcome.result.requiredParts.length, 1);
  assert.equal(outcome.result.requiredParts[0]?.partId, 'part-1');
  // 用配件库真实数据替换AI返回的数据
  assert.equal(outcome.result.requiredParts[0]?.name, '适配春风250SR的排气');
  assert.equal(outcome.result.requiredParts[0]?.brand, '品牌A');
});
