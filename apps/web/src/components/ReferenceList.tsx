import { useEffect, useId, useState } from 'react';
import type { KnowledgeEntry, Reference } from '@motorcycle-ai/shared';
import './ReferenceList.css';

export type KnowledgeLoader = (id: string, signal: AbortSignal) => Promise<KnowledgeEntry>;

export async function loadKnowledge(id: string, signal: AbortSignal): Promise<KnowledgeEntry> {
  const response = await fetch(`/api/rag/knowledge/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) throw new Error('SOURCE_EXPIRED');
  if (!response.ok) throw new Error('SOURCE_UNAVAILABLE');
  const entry = (await response.json()) as KnowledgeEntry;
  if (entry.id !== id || typeof entry.content !== 'string') throw new Error('SOURCE_UNAVAILABLE');
  return entry;
}

function ReferenceCard({ reference, loader }: { reference: Reference; loader: KnowledgeLoader }) {
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<KnowledgeEntry>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'expired' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setStatus('loading');
    setDetail(undefined);
    void loader(reference.knowledgeId, controller.signal)
      .then((entry) => {
        if (controller.signal.aborted) return;
        setDetail(entry);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(
          error instanceof Error && error.message === 'SOURCE_EXPIRED' ? 'expired' : 'error',
        );
      });
    return () => controller.abort();
  }, [open, reference.knowledgeId, loader, attempt]);

  const source = { manual: '维修手册', 'fault-case': '故障案例', 'part-catalog': '配件目录' }[
    reference.sourceType
  ];
  const location = [
    reference.section,
    reference.pageStart
      ? `第 ${reference.pageStart}${reference.pageEnd && reference.pageEnd !== reference.pageStart ? `–${reference.pageEnd}` : ''} 页`
      : '页码未提供',
  ]
    .filter(Boolean)
    .join(' · ');
  const url = detail?.sourceUrl ?? reference.url;
  const safeUrl = /^https?:\/\//iu.test(url) ? url : undefined;
  return (
    <article className="reference-card">
      <button
        className="reference-toggle"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen(!open)}
      >
        <span>
          <small>
            {source} · {location}
          </small>
          <strong>{reference.title}</strong>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={regionId} className="reference-body">
          {status === 'expired' ? (
            <p role="status">来源已失效，不能再作为当前维修依据。请重新检索。</p>
          ) : (
            <>
              <blockquote>{reference.excerpt}</blockquote>
              <p role="status">
                {status === 'loading'
                  ? '正在核查来源，以上为检索时的片段。'
                  : status === 'error'
                    ? '暂时无法核查来源，以上为历史片段，请重试。'
                    : '来源已核查'}
              </p>
              {detail && (
                <details>
                  <summary>查看完整原文</summary>
                  <pre>{detail.content}</pre>
                </details>
              )}
              {safeUrl && (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                  打开原始来源 ↗
                </a>
              )}
              {status === 'error' && (
                <button onClick={() => setAttempt(attempt + 1)}>重新核查</button>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** 展开片段无需等待 HTTP；每次重新展开核查来源，404 不当作网络错误。 */
export function ReferenceList({
  references,
  loader = loadKnowledge,
}: {
  references: readonly Reference[];
  loader?: KnowledgeLoader;
}) {
  return (
    <section className="reference-list" aria-label="引用来源">
      <h2>维修依据</h2>
      {references.length === 0 ? (
        <p>暂无可核查的引用，请勿将此结果作为维修依据。</p>
      ) : (
        references.map((reference) => (
          <ReferenceCard key={reference.knowledgeId} reference={reference} loader={loader} />
        ))
      )}
    </section>
  );
}
