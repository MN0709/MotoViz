const baseUrl = process.env.MOCK_BASE_URL ?? 'http://localhost:3001';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value, path) {
  assert(typeof value === 'string' && value.length > 0, `${path} 应为非空字符串`);
}

function assertReference(value, path) {
  assert(isRecord(value), `${path} 应为对象`);
  assertString(value.title, `${path}.title`);
  assert(['manual', 'case', 'catalog'].includes(value.sourceType), `${path}.sourceType 枚举不合法`);
  assertString(value.excerpt, `${path}.excerpt`);
  assertString(value.url, `${path}.url`);
}

async function requestJson(name, path, init, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  assert(
    response.status === expectedStatus,
    `${name} 预期 HTTP ${expectedStatus}，实际 ${response.status}`,
  );
  assert(isRecord(body), `${name} 响应应为 JSON 对象`);
  return { response, body };
}

const jsonHeaders = { 'content-type': 'application/json' };
const report = [];

const parts = await requestJson(
  '配件检索',
  '/api/rag/search/parts',
  {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ query: '排气', motorcycleModel: '川崎 Ninja 400', limit: 5 }),
  },
  200,
);
assertString(parts.body.queryId, 'parts.queryId');
assert(parts.body.queryId.startsWith('query-'), 'parts.queryId 应以 query- 开头');
assert(Array.isArray(parts.body.results), 'parts.results 应为数组');
assert(Number.isInteger(parts.body.total) && parts.body.total >= 0, 'parts.total 应为非负整数');
for (const [index, item] of parts.body.results.entries()) {
  const path = `parts.results[${index}]`;
  assert(isRecord(item), `${path} 应为对象`);
  for (const key of ['partId', 'name', 'brand', 'source'])
    assertString(item[key], `${path}.${key}`);
  assert(
    ['exhaust', 'windshield', 'saddlebag', 'other'].includes(item.partType),
    `${path}.partType 枚举不合法`,
  );
  assert(
    Array.isArray(item.fitModels) && item.fitModels.every((model) => typeof model === 'string'),
    `${path}.fitModels 应为字符串数组`,
  );
  assert(typeof item.price === 'number', `${path}.price 应为数字`);
  assert(
    typeof item.score === 'number' && item.score >= 0 && item.score <= 1,
    `${path}.score 应在 0-1`,
  );
}
report.push({
  api: 'POST /api/rag/search/parts',
  status: parts.response.status,
  queryId: parts.body.queryId,
  total: parts.body.total,
});

const fault = await requestJson(
  '故障诊断',
  '/api/rag/search/fault',
  {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      symptom: '冷车启动困难，怠速容易熄火',
      motorcycleModel: '川崎 Ninja 400',
      mileage: 18500,
    }),
  },
  200,
);
assertString(fault.body.queryId, 'fault.queryId');
assert(fault.body.queryId.startsWith('query-'), 'fault.queryId 应以 query- 开头');
assertString(fault.body.diagnosis, 'fault.diagnosis');
assert(Array.isArray(fault.body.possibleCauses), 'fault.possibleCauses 应为数组');
for (const [index, item] of fault.body.possibleCauses.entries()) {
  const path = `fault.possibleCauses[${index}]`;
  assert(isRecord(item), `${path} 应为对象`);
  assertString(item.cause, `${path}.cause`);
  assert(
    typeof item.probability === 'number' && item.probability >= 0 && item.probability <= 1,
    `${path}.probability 应在 0-1`,
  );
  assertString(item.solution, `${path}.solution`);
}
assert(
  Array.isArray(fault.body.references) && fault.body.references.length > 0,
  'fault.references 应为非空数组',
);
fault.body.references.forEach((item, index) => assertReference(item, `fault.references[${index}]`));
report.push({
  api: 'POST /api/rag/search/fault',
  status: fault.response.status,
  queryId: fault.body.queryId,
  references: fault.body.references.length,
});

const knowledge = await requestJson('知识详情', '/api/rag/knowledge/fault-001', undefined, 200);
assert(knowledge.body.id === 'fault-001', 'knowledge.id 应为 fault-001');
for (const key of ['title', 'content', 'sourceUrl', 'updatedAt'])
  assertString(knowledge.body[key], `knowledge.${key}`);
assert(
  ['manual', 'case', 'catalog'].includes(knowledge.body.sourceType),
  'knowledge.sourceType 枚举不合法',
);
assert(
  !Number.isNaN(Date.parse(knowledge.body.updatedAt)),
  'knowledge.updatedAt 应为 ISO 日期字符串',
);
report.push({
  api: 'GET /api/rag/knowledge/fault-001',
  status: knowledge.response.status,
  id: knowledge.body.id,
});

const feedback = await requestJson(
  '结果反馈',
  '/api/rag/feedback',
  {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      queryId: fault.body.queryId,
      rating: 'up',
      comment: 'Mock API 契约验证通过',
    }),
  },
  201,
);
assert(feedback.body.success === true, 'feedback.success 应为 true');
report.push({
  api: 'POST /api/rag/feedback',
  status: feedback.response.status,
  success: feedback.body.success,
  queryId: fault.body.queryId,
});

console.log(
  JSON.stringify({ baseUrl, contract: 'docs/api-contract.md §3', results: report }, null, 2),
);
