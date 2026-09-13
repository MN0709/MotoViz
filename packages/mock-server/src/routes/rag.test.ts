import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../http-error.js';
import { ragRouter } from './rag.js';
import { partModelRegistrations } from '../data/part-models.js';
import { parts } from '../data/parts.js';
import { models } from '../data/models.js';

interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
}

async function postJson(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test('feedback accepts query IDs from both part and fault searches', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rag', ragRouter);
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    response.status(500).json({ code: 'INTERNAL_ERROR', message: '测试服务内部错误' });
  };
  app.use(errorHandler);

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const partSearch = await postJson(baseUrl, '/api/rag/search/parts', { query: '排气' });
    assert.equal(partSearch.status, 200);
    assert.equal(typeof partSearch.body.queryId, 'string');
    const partResults = partSearch.body.results as Array<Record<string, unknown>>;
    assert.equal(
      partResults.every(
        (part) => typeof part.partId === 'string' && typeof part.thumbnailUrl === 'string',
      ),
      true,
    );

    const mismatched = await postJson(baseUrl, '/api/rag/search/parts', {
      query: '排气',
      motorcycleModel: '宝马 R 1250 GS 2019-2024',
    });
    assert.equal(mismatched.status, 200);
    assert.deepEqual(mismatched.body.results, []);

    const unrelated = await postJson(baseUrl, '/api/rag/search/parts', {
      query: '完全不存在的商品',
    });
    assert.equal(unrelated.status, 200);
    assert.deepEqual(unrelated.body.results, []);

    const partFeedback = await postJson(baseUrl, '/api/rag/feedback', {
      queryId: partSearch.body.queryId,
      rating: 'up',
    });
    assert.deepEqual(partFeedback, { status: 201, body: { success: true } });

    const faultSearch = await postJson(baseUrl, '/api/rag/search/fault', {
      symptom: '冷车启动困难',
    });
    assert.equal(faultSearch.status, 200);
    assert.equal(typeof faultSearch.body.queryId, 'string');

    const faultFeedback = await postJson(baseUrl, '/api/rag/feedback', {
      queryId: faultSearch.body.queryId,
      rating: 'down',
    });
    assert.deepEqual(faultFeedback, { status: 201, body: { success: true } });

    const missingFeedback = await postJson(baseUrl, '/api/rag/feedback', {
      queryId: 'query-does-not-exist',
      rating: 'down',
    });
    assert.equal(missingFeedback.status, 404);
    assert.equal(missingFeedback.body.code, 'QUERY_NOT_FOUND');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('part search HTTP keeps controlled synonyms and model year ranges aligned', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rag', ragRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const exhaust = await postJson(baseUrl, '/api/rag/search/parts', {
      query: '排气',
      motorcycleModel: '川崎 Ninja 400 2021',
    });
    const muffler = await postJson(baseUrl, '/api/rag/search/parts', {
      query: '消音器',
      motorcycleModel: '川崎 Ninja 400 2021',
    });
    assert.equal(exhaust.status, 200);
    assert.equal(muffler.status, 200);
    assert.deepEqual(
      (muffler.body.results as Array<{ partId: string }>).map((part) => part.partId),
      (exhaust.body.results as Array<{ partId: string }>).map((part) => part.partId),
    );

    for (const year of [2018, 2023]) {
      const boundary = await postJson(baseUrl, '/api/rag/search/parts', {
        query: '消音器',
        motorcycleModel: `川崎 Ninja 400 ${year}`,
      });
      assert.equal((boundary.body.results as unknown[]).length > 0, true);
    }
    for (const year of [2017, 2024]) {
      const outside = await postJson(baseUrl, '/api/rag/search/parts', {
        query: '消音器',
        motorcycleModel: `川崎 Ninja 400 ${year}`,
      });
      assert.deepEqual(outside.body.results, []);
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('3D registration references existing part and model IDs only', () => {
  const partIds = new Set(parts.map((part) => part.partId));
  const modelIds = new Set(models.map((model) => model.modelId));
  assert.equal(
    partModelRegistrations.every((item) => partIds.has(item.partId) && modelIds.has(item.modelId)),
    true,
  );
  assert.equal(
    new Set(partModelRegistrations.map((item) => item.partId)).size,
    partModelRegistrations.length,
  );
});
