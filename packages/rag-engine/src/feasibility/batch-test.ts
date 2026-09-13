import { selectAdapter } from './llm-adapter.js';
import { sampleKnowledge } from './sample-data.js';
import type { KnowledgeSnippet } from './types.js';

const symptoms = ['冷车启动困难，怠速容易熄火', '刹车手感变软，制动力下降', '水温过高且风扇不转'];

const context: readonly KnowledgeSnippet[] = sampleKnowledge;
const selection = selectAdapter(process.env);
const adapter = selection.adapter;

if (selection.mode !== 'real') {
  console.error('不是真实模式，无法测延迟。请设置 LLM_MODE=real + LLM_BASE_URL/LLM_API_KEY/LLM_MODEL');
  process.exit(1);
}

const ROUNDS = Number(process.env.LLM_ROUNDS ?? '20');
const results: number[] = [];
let success = 0;
let degradedCount = 0;
let schemaFail = 0;
const failures: string[] = [];

for (let i = 0; i < ROUNDS; i++) {
  const symptom = symptoms[i % symptoms.length];
  const start = performance.now();
  try {
    const gen = await adapter.generateDiagnosis(symptom, context);
    const elapsed = performance.now() - start;
    results.push(elapsed);
    if (gen.degraded) {
      degradedCount++;
      continue;
    }
    const causesOk =
      Array.isArray(gen.possibleCauses) &&
      gen.possibleCauses.every(
        (c) =>
          typeof c.cause === 'string' &&
          typeof c.solution === 'string' &&
          typeof c.probability === 'number' &&
          c.probability >= 0 &&
          c.probability <= 1,
      );
    const refsOk =
      Array.isArray(gen.references) &&
      gen.references.length > 0 &&
      gen.references.every((r) => context.some((k) => k.knowledgeId === r.knowledgeId));
    const diagOk = typeof gen.diagnosis === 'string' && gen.diagnosis.trim().length > 0;
    if (causesOk && refsOk && diagOk) {
      success++;
    } else {
      schemaFail++;
      failures.push(`#${i + 1} 结构不合法(causes=${causesOk}, refs=${refsOk}, diag=${diagOk})`);
    }
  } catch (e) {
    results.push(performance.now() - start);
    failures.push(`#${i + 1} 异常: ${(e as Error).message}`);
  }
}

const sorted = [...results].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
const avg = results.reduce((a, b) => a + b, 0) / results.length;
const p50 = pct(0.5);
const p95 = pct(0.95);
const p99 = pct(0.99);

console.log(
  JSON.stringify(
    {
      mode: selection.mode,
      note: selection.note,
      rounds: ROUNDS,
      success,
      degradedCount,
      schemaFail,
      structureRate: Number((success / ROUNDS).toFixed(4)),
      latencyMs: {
        avg: Number(avg.toFixed(1)),
        p50: Number(p50.toFixed(1)),
        p95: Number(p95.toFixed(1)),
        p99: Number(p99.toFixed(1)),
        min: Number(sorted[0].toFixed(1)),
        max: Number(sorted[sorted.length - 1].toFixed(1)),
      },
      failures,
    },
    null,
    2,
  ),
);
