import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import type {
  FaultDiagnosisResult,
  FeedbackRequest,
  FeedbackResponse,
  KnowledgeEntry,
} from '@motorcycle-ai/shared';
import { searchParts, textOverlapScore } from './keyword-search.js';
import { HttpLLMAdapter, selectAdapter } from './llm-adapter.js';
import { sampleKnowledge, sampleParts } from './sample-data.js';
import type { KnowledgeSnippet } from './types.js';
import { isFaultDiagnosisResult, isKnowledgeEntry } from './validate.js';

const partCases = [
  { query: '川崎 Ninja 400 排气', expectedTopId: 'demo-part-01' },
  { query: '本田 CBR500R R-11', expectedTopId: 'demo-part-02' },
  { query: 'KTM Duke 390 排气', expectedTopId: 'demo-part-03' },
  { query: 'Ninja 400 双泡风挡', expectedTopId: 'demo-part-04' },
  { query: 'CB500X SH36 边箱', expectedTopId: 'demo-part-08' },
] as const;

const faultQueries = ['冷车启动困难且怠速熄火', '高转顿挫并且加速无力', '刹车手感变软'] as const;

function selectContexts(query: string, limit = 2): KnowledgeSnippet[] {
  return sampleKnowledge
    .map((snippet) => ({
      snippet,
      score: textOverlapScore(query, `${snippet.title} ${snippet.content}`),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.snippet);
}

async function verifyMalformedJsonFallback(): Promise<{ degraded: boolean; schemaValid: boolean }> {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '这不是 JSON' } }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  try {
    const adapter = new HttpLLMAdapter({
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'local-fixture-key',
      model: 'malformed-json-fixture',
      timeoutMs: 1000,
    });
    const generated = await adapter.generateDiagnosis('冷车启动困难', [
      sampleKnowledge[0] as KnowledgeSnippet,
    ]);
    const payload: FaultDiagnosisResult = {
      queryId: 'fallback-test',
      diagnosis: generated.diagnosis,
      possibleCauses: generated.possibleCauses,
      requiredParts: generated.requiredParts,
      references: generated.references,
    };
    return { degraded: generated.degraded, schemaValid: isFaultDiagnosisResult(payload) };
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function main(): Promise<void> {
  assert.equal(sampleParts.length, 10);
  assert.equal(sampleKnowledge.length, 5);

  const partResults = partCases.map((testCase) => {
    const hits = searchParts(testCase.query, sampleParts, 3);
    assert.equal(hits[0]?.partId, testCase.expectedTopId, `${testCase.query} 首条未命中预期配件`);
    return {
      query: testCase.query,
      expectedTopId: testCase.expectedTopId,
      topHitCorrect: true,
      hits: hits.map(({ partId, name, score }) => ({ partId, name, score })),
    };
  });

  const selection = selectAdapter(process.env);
  const malformedJsonFallback = await verifyMalformedJsonFallback();
  assert.deepEqual(malformedJsonFallback, { degraded: true, schemaValid: true });
  const firstKnowledge = sampleKnowledge[0] as KnowledgeSnippet;
  const knowledgeEntry: KnowledgeEntry = {
    id: firstKnowledge.knowledgeId,
    title: firstKnowledge.title,
    content: firstKnowledge.content,
    sourceType: firstKnowledge.sourceType,
    sourceUrl: firstKnowledge.sourceUrl,
    models: [],
    updatedAt: '2026-09-12T09:00:00.000Z',
  };
  const knowledgeFormatValid = isKnowledgeEntry(knowledgeEntry);
  assert.equal(knowledgeFormatValid, true);
  const feedbackContract: { request: FeedbackRequest; response: FeedbackResponse } = {
    request: { queryId: 'feasibility-query-1', rating: 'up', comment: '验证样例' },
    response: { success: true },
  };
  const diagnosisResults = [];
  for (const [index, symptom] of faultQueries.entries()) {
    const context = selectContexts(symptom);
    assert.ok(context.length > 0, `${symptom} 未召回上下文`);
    const startedAt = performance.now();
    const generated = await selection.adapter.generateDiagnosis(symptom, context);
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    const payload: FaultDiagnosisResult = {
      queryId: `feasibility-query-${index + 1}`,
      diagnosis: generated.diagnosis,
      possibleCauses: generated.possibleCauses,
      requiredParts: generated.requiredParts,
      references: generated.references,
    };
    const schemaValid = isFaultDiagnosisResult(payload);
    const trustedIds = new Set(context.map((item) => item.knowledgeId));
    const referencesTraceable = payload.references.every((reference) =>
      trustedIds.has(reference.knowledgeId),
    );
    assert.equal(schemaValid, true, `${symptom} 结构校验失败`);
    assert.equal(referencesTraceable, true, `${symptom} 存在上下文外引用`);
    diagnosisResults.push({
      symptom,
      contextIds: [...trustedIds],
      schemaValid,
      referencesTraceable,
      degraded: generated.degraded,
      elapsedMs,
      result: payload,
    });
  }

  const output = {
    mode: selection.mode,
    modeNote: selection.note,
    realLatency: selection.realLatencyTested
      ? { tested: true, samplesMs: diagnosisResults.map((item) => item.elapsedMs) }
      : { tested: false, reason: '未提供完整真实 LLM 配置，未测真实延迟' },
    dataset: { parts: sampleParts.length, knowledgeSnippets: sampleKnowledge.length },
    partSearch: {
      cases: partResults.length,
      top1Correct: partResults.filter((item) => item.topHitCorrect).length,
      results: partResults,
    },
    diagnosis: {
      cases: diagnosisResults.length,
      schemaValid: diagnosisResults.filter((item) => item.schemaValid).length,
      referencesTraceable: diagnosisResults.filter((item) => item.referencesTraceable).length,
      results: diagnosisResults,
    },
    malformedJsonFallback,
    knowledgeFormat: { valid: knowledgeFormatValid, sample: knowledgeEntry },
    feedbackContract,
  };
  console.log(JSON.stringify(output, null, 2));
}

await main();
