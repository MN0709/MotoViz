import { useEffect, useState } from 'react';
import type { FaultDiagnosisResult, Reference, SearchResponse } from '@motorcycle-ai/shared';
import { ReferenceList } from './ReferenceList';

export function ReferenceDemo() {
  const [references, setReferences] = useState<Reference[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const responses = await Promise.all([
        fetch('/api/rag/search/fault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symptom: '冷车启动困难' }),
          signal: controller.signal,
        }),
        fetch('/api/rag/search/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '排气', limit: 1 }),
          signal: controller.signal,
        }),
      ]);
      if (responses.some((response) => !response.ok))
        throw new Error('请先启动 Mock Server，再刷新页面。');
      const diagnosis = (await responses[0]!.json()) as FaultDiagnosisResult;
      const parts = (await responses[1]!.json()) as SearchResponse;
      if (!controller.signal.aborted)
        setReferences([
          ...diagnosis.references,
          ...parts.results.flatMap((part) => part.references ?? []),
        ]);
    }
    void load().catch((reason: unknown) => {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : '加载失败');
    });
    return () => controller.abort();
  }, []);
  return (
    <>
      <h1>引用溯源联调</h1>
      <p>展示故障诊断与配件查询的引用。以下均为 Mock 数据，不可作为真实维修依据。</p>
      {error && <p role="alert">{error}</p>}
      <ReferenceList references={references} />
      <ReferenceList
        references={[
          {
            knowledgeId: 'deleted-demo-chunk',
            title: '已删除来源测试',
            sourceType: 'manual',
            excerpt: '这是一条历史片段，用于验证 404 提示。',
            url: 'https://example.com/deleted',
          },
        ]}
      />
    </>
  );
}
