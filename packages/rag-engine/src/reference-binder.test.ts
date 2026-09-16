import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindPartReferences, bindReferences } from './reference-binder.js';
import { diagnoseFault } from './diagnosis-engine.js';
import { MockLLMAdapter } from './llm-adapter.js';
import type { KnowledgeSearchHit } from './knowledge-search.js';

const hit: KnowledgeSearchHit = {
  knowledgeId: 'chunk-1',
  documentId: 'fixture-manual',
  title: '合成维修手册',
  sourceType: 'manual',
  sourceUrl: 'https://example.com/manual.pdf',
  content: '冷车启动困难，检查电池。',
  pageStart: 12,
  pageEnd: 13,
  section: '启动系统',
  score: 1,
  parts: [{ partId: 'battery-1', name: '电池', brand: 'fixture', stock: 1 }],
};

test('location and excerpt come only from trusted source, not LLM metadata', () => {
  const draft = { knowledgeId: hit.knowledgeId, title: '伪造标题', pageStart: 999 };
  const [reference] = bindReferences([draft], [hit]);
  assert.equal(reference?.title, hit.title);
  assert.equal(reference?.excerpt, hit.content);
  assert.equal(reference?.documentId, hit.documentId);
  assert.equal(reference?.pageStart, 12);
  assert.equal(reference?.pageEnd, 13);
  assert.equal(reference?.section, '启动系统');
});

test('deleted or changed chunks cannot be bound', () => {
  assert.throws(() => bindReferences([{ knowledgeId: hit.knowledgeId }], [hit], []), /删除或变更/);
  assert.throws(
    () =>
      bindReferences([{ knowledgeId: hit.knowledgeId }], [hit], [{ ...hit, content: '已修改' }]),
    /删除或变更/,
  );
});

test('unsafe links and invalid page ranges are rejected; absent pages stay absent', () => {
  assert.throws(
    () =>
      bindReferences(
        [{ knowledgeId: hit.knowledgeId }],
        [{ ...hit, sourceUrl: 'javascript:alert(1)' }],
      ),
    /HTTP/,
  );
  assert.throws(
    () => bindReferences([{ knowledgeId: hit.knowledgeId }], [{ ...hit, pageEnd: 11 }]),
    /页码/,
  );
  const withoutPages = { ...hit };
  delete withoutPages.pageStart;
  delete withoutPages.pageEnd;
  assert.equal(
    'pageStart' in bindReferences([{ knowledgeId: hit.knowledgeId }], [withoutPages])[0]!,
    false,
  );
});

test('part evidence requires an explicit trusted part ID association', () => {
  assert.equal(bindPartReferences('battery-1', [hit]).length, 1);
  assert.deepEqual(bindPartReferences('fake-battery', [hit]), []);
});

test('chunk deletion during LLM call falls back without stale references', async () => {
  const outcome = await diagnoseFault('冷车启动困难', [hit], new MockLLMAdapter(), {
    getCurrentDocuments: () => [],
  });
  assert.equal(outcome.degraded, true);
  assert.equal(outcome.fallbackReason, 'invalid-reference');
  assert.deepEqual(outcome.result.references, []);
  assert.deepEqual(outcome.result.possibleCauses, []);
});

test('LLM failure after chunk deletion also excludes stale fallback sources', async () => {
  const outcome = await diagnoseFault(
    '冷车启动困难',
    [hit],
    {
      async generateDiagnosis() {
        throw new Error('LLM unavailable');
      },
    },
    { getCurrentDocuments: () => [] },
  );
  assert.equal(outcome.degraded, true);
  assert.deepEqual(outcome.result.references, []);
});
