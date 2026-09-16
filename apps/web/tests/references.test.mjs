import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';

test('reference panel opens without waiting for HTTP, expires on 404, and retries network errors', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const vite = await createServer({
    server: { hmr: false, watch: null },
    plugins: [
      {
        name: 'unit-test-style-stub',
        enforce: 'pre',
        resolveId(id) {
          if (id.endsWith('.css')) return '\0unit-test-style';
        },
        load(id) {
          if (id === '\0unit-test-style') return 'export {}';
        },
      },
    ],
  });
  const root = createRoot(document.getElementById('root'));
  try {
    const { ReferenceList, loadKnowledge } = await vite.ssrLoadModule(
      '/src/components/ReferenceList.tsx',
    );
    const reference = {
      knowledgeId: 'chunk-ui',
      title: '测试维修手册',
      sourceType: 'manual',
      excerpt: '合成原文片段',
      url: 'https://example.com/manual',
      pageStart: 12,
      section: '启动系统',
    };
    const entry = { id: reference.knowledgeId, content: '合成完整原文', sourceUrl: reference.url };
    let resolve;
    const pendingLoader = () =>
      new Promise((done) => {
        resolve = done;
      });
    await act(async () =>
      root.render(createElement(ReferenceList, { references: [reference], loader: pendingLoader })),
    );
    const button = document.querySelector('button');
    const start = performance.now();
    await act(async () => button.click());
    const elapsedMs = performance.now() - start;
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(document.querySelector('blockquote').textContent, reference.excerpt);
    assert.match(document.body.textContent, /正在核查来源/);
    assert.ok(elapsedMs < 200, `DOM 展开耗时 ${elapsedMs}ms`);
    await act(async () => resolve(entry));
    assert.match(document.body.textContent, /合成完整原文/);
    assert.equal(document.querySelector('a').getAttribute('href'), reference.url);

    const expiredLoader = async () => {
      throw new Error('SOURCE_EXPIRED');
    };
    await act(async () =>
      root.render(createElement(ReferenceList, { references: [reference], loader: expiredLoader })),
    );
    assert.match(document.body.textContent, /来源已失效/);
    assert.equal(document.querySelector('blockquote'), null);
    assert.equal(document.querySelector('a'), null);

    let attempts = 0;
    const retryLoader = async () => {
      if (++attempts === 1) throw new Error('network');
      return entry;
    };
    await act(async () =>
      root.render(createElement(ReferenceList, { references: [reference], loader: retryLoader })),
    );
    assert.match(document.body.textContent, /暂时无法核查来源/);
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((item) => item.textContent === '重新核查')
        .click(),
    );
    assert.match(document.body.textContent, /来源已核查/);

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('{}', { status: 404 });
      await assert.rejects(
        () => loadKnowledge('deleted', new AbortController().signal),
        /SOURCE_EXPIRED/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    await act(async () =>
      root.render(createElement(ReferenceList, { references: [], loader: retryLoader })),
    );
    assert.match(document.body.textContent, /暂无可核查的引用/);
    console.log(`DOM 展开 ${elapsedMs.toFixed(2)}ms（不代表真实浏览器性能验收）`);
  } finally {
    await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
