/**
 * 故障诊断Prompt效果测试脚本
 *
 * 用真实DeepSeek API调用，验证prompt的输出质量。
 * 跑多个测试用例，检查：JSON格式、knowledgeId是否编造、probability是否合理、兜底是否正确。
 *
 * 运行方式：
 * LLM_MODE=real LLM_BASE_URL=https://api.deepseek.com LLM_API_KEY=sk-xxx LLM_MODEL=deepseek-chat npx tsx packages/rag-engine/src/feasibility/test-prompt.ts
 */

import { buildDiagnosisMessages } from '../prompts.js';
import { sampleKnowledge } from './sample-data.js';
import type { KnowledgeSnippet } from './types.js';

const DEEPSEEK_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.LLM_API_KEY || '';
const DEEPSEEK_MODEL = process.env.LLM_MODEL || 'deepseek-chat';

interface TestCase {
  name: string;
  symptom: string;
  context: KnowledgeSnippet[];
  motorcycleModel?: string;
  mileage?: number;
  expected: {
    shouldHaveCauses: boolean; // 是否应该有possibleCauses
    shouldHaveReferences: boolean; // 是否应该有references
    allowedKnowledgeIds?: string[]; // 允许出现的knowledgeId
    shouldReject?: boolean; // 是否应该拒绝（非摩托车问题）
  };
}

const testCases: TestCase[] = [
  {
    name: '测试1：冷启动困难（资料充足）',
    symptom: '冷车启动困难，有时候要打好几次火',
    context: [sampleKnowledge[0]], // demo-kn-01
    expected: {
      shouldHaveCauses: true,
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-01'],
    },
  },
  {
    name: '测试2：刹车变软（资料充足）',
    symptom: '刹车手感变软，捏下去行程变长',
    context: [sampleKnowledge[2]], // demo-kn-03
    expected: {
      shouldHaveCauses: true,
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-03'],
    },
  },
  {
    name: '测试3：链条异响（资料充足）',
    symptom: '链条异响，收油的时候顿挫',
    context: [sampleKnowledge[3]], // demo-kn-04
    expected: {
      shouldHaveCauses: true,
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-04'],
    },
  },
  {
    name: '测试4：水温过高（资料充足）',
    symptom: '水温过高，风扇不转',
    context: [sampleKnowledge[4]], // demo-kn-05
    expected: {
      shouldHaveCauses: true,
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-05'],
    },
  },
  {
    name: '测试5：加速无力（资料充足）',
    symptom: '加速无力，高转的时候顿挫',
    context: [sampleKnowledge[1]], // demo-kn-02
    expected: {
      shouldHaveCauses: true,
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-02'],
    },
  },
  {
    name: '测试6：资料不足（问题跟提供的资料无关）',
    symptom: '仪表盘显示故障码P0500，车速表不动',
    context: [sampleKnowledge[4]], // demo-kn-05（冷却系统，跟车速表无关）
    expected: {
      shouldHaveCauses: false, // 资料不足，possibleCauses应该为空
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-05'],
    },
  },
  {
    name: '测试7：非摩托车问题（应该拒绝）',
    symptom: '我家冰箱不制冷怎么办',
    context: [sampleKnowledge[0]],
    expected: {
      shouldHaveCauses: false,
      shouldHaveReferences: false, // 非摩托车问题，references应该为空
      shouldReject: true,
    },
  },
  {
    name: '测试8：多资料混合（给5条资料）',
    symptom: '冷车启动困难，怠速也不稳',
    context: sampleKnowledge, // 全部5条
    expected: {
      shouldHaveCauses: true,
      shouldHaveReferences: true,
      allowedKnowledgeIds: ['demo-kn-01', 'demo-kn-02', 'demo-kn-03', 'demo-kn-04', 'demo-kn-05'],
    },
  },
];

interface TestResult {
  name: string;
  success: boolean;
  errors: string[];
  rawOutput?: string;
  parsedOutput?: unknown;
  latencyMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function callDeepSeek(
  messages: { role: string; content: string }[],
): Promise<{ content: string; latencyMs: number }> {
  const startTime = Date.now();
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const payload: unknown = await response.json();
  const firstChoice =
    isRecord(payload) && Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const message =
    isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : undefined;
  const content = message?.content;
  if (typeof content !== 'string' || !content) throw new Error('响应缺少content');
  return { content, latencyMs };
}

function parseJson(content: string): unknown {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(withoutFence);
}

function validateOutput(output: unknown, testCase: TestCase): string[] {
  const errors: string[] = [];

  if (!isRecord(output)) return ['输出不是 JSON 对象'];

  // 检查diagnosis
  if (typeof output.diagnosis !== 'string' || output.diagnosis.trim() === '') {
    errors.push('diagnosis 不是非空字符串');
  }

  // 检查possibleCauses
  if (!Array.isArray(output.possibleCauses)) {
    errors.push('possibleCauses 不是数组');
  } else {
    if (testCase.expected.shouldHaveCauses && output.possibleCauses.length === 0) {
      errors.push('possibleCauses 应该有内容但为空');
    }
    if (!testCase.expected.shouldHaveCauses && output.possibleCauses.length > 0) {
      errors.push(`possibleCauses 应该为空但有 ${output.possibleCauses.length} 条`);
    }
    for (const cause of output.possibleCauses) {
      if (!isRecord(cause)) {
        errors.push('possibleCauses[] 不是对象');
        continue;
      }
      if (typeof cause.cause !== 'string') errors.push('possibleCauses[].cause 不是字符串');
      if (typeof cause.solution !== 'string') errors.push('possibleCauses[].solution 不是字符串');
      const prob = cause.probability;
      if (typeof prob !== 'number' || prob < 0 || prob > 1) {
        errors.push(`probability ${prob} 不在0-1范围内`);
      }
      // 检查是否两位小数
      if (typeof prob === 'number' && !Number.isInteger(prob * 100)) {
        errors.push(`probability ${prob} 不是两位小数`);
      }
    }
  }

  // 检查requiredParts
  if (!Array.isArray(output.requiredParts)) {
    errors.push('requiredParts 不是数组');
  }

  // 检查references
  if (!Array.isArray(output.references)) {
    errors.push('references 不是数组');
  } else {
    if (testCase.expected.shouldHaveReferences && output.references.length === 0) {
      errors.push('references 应该有内容但为空');
    }
    if (!testCase.expected.shouldHaveReferences && output.references.length > 0) {
      errors.push(`references 应该为空但有 ${output.references.length} 条`);
    }
    // 检查knowledgeId是否编造
    for (const ref of output.references) {
      if (!isRecord(ref)) {
        errors.push('references[] 不是对象');
        continue;
      }
      if (typeof ref.knowledgeId !== 'string') {
        errors.push('references[].knowledgeId 不是字符串');
      } else if (
        testCase.expected.allowedKnowledgeIds &&
        !testCase.expected.allowedKnowledgeIds.includes(ref.knowledgeId)
      ) {
        errors.push(`knowledgeId "${ref.knowledgeId}" 是编造的，不在提供的资料中`);
      }
    }
  }

  // 检查是否拒绝（非摩托车问题）
  if (testCase.expected.shouldReject) {
    if (
      typeof output.diagnosis === 'string' &&
      !output.diagnosis.includes('仅支持') &&
      !output.diagnosis.includes('摩托车')
    ) {
      errors.push('非摩托车问题应该拒绝，但diagnosis没有拒绝提示');
    }
  }

  return errors;
}

async function runTest(testCase: TestCase, runIndex: number): Promise<TestResult> {
  const errors: string[] = [];
  let rawOutput: string | undefined;
  let parsedOutput: unknown;
  let latencyMs = 0;

  try {
    const messages = buildDiagnosisMessages(
      testCase.symptom,
      testCase.context,
      testCase.motorcycleModel,
      testCase.mileage,
    );
    const result = await callDeepSeek(messages);
    rawOutput = result.content;
    latencyMs = result.latencyMs;
    parsedOutput = parseJson(rawOutput);
    errors.push(...validateOutput(parsedOutput, testCase));
  } catch (error: unknown) {
    errors.push(`调用或解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    name: `${testCase.name}（第${runIndex}次）`,
    success: errors.length === 0,
    errors,
    rawOutput,
    parsedOutput,
    latencyMs,
  };
}

async function main() {
  if (!DEEPSEEK_API_KEY) {
    console.error('错误：未设置LLM_API_KEY环境变量');
    process.exit(1);
  }

  console.log('========================================');
  console.log('故障诊断Prompt效果测试');
  console.log(`模型: ${DEEPSEEK_MODEL}`);
  console.log(`测试用例: ${testCases.length}个，每个跑2次，共${testCases.length * 2}次调用`);
  console.log('========================================\n');

  const allResults: TestResult[] = [];
  const RUNS_PER_CASE = 2;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n--- ${testCase.name} ---`);

    for (let run = 1; run <= RUNS_PER_CASE; run++) {
      process.stdout.write(`  第${run}次调用... `);
      const result = await runTest(testCase, run);
      allResults.push(result);

      if (result.success) {
        console.log(`✅ 通过 (${result.latencyMs}ms)`);
      } else {
        console.log(`❌ 失败 (${result.latencyMs}ms)`);
        for (const error of result.errors) {
          console.log(`     - ${error}`);
        }
        if (result.rawOutput) {
          console.log(`     原始输出: ${result.rawOutput.slice(0, 200)}`);
        }
      }
    }
  }

  // 汇总
  console.log('\n========================================');
  console.log('测试汇总');
  console.log('========================================');
  const passed = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;
  const avgLatency = allResults.reduce((sum, r) => sum + r.latencyMs, 0) / allResults.length;

  console.log(`总调用次数: ${allResults.length}`);
  console.log(`通过: ${passed} (${((passed / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`失败: ${failed} (${((failed / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`平均延迟: ${avgLatency.toFixed(0)}ms`);

  // 按错误类型统计
  const errorCounts: Record<string, number> = {};
  for (const result of allResults) {
    for (const error of result.errors) {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    }
  }
  if (Object.keys(errorCounts).length > 0) {
    console.log('\n错误统计:');
    for (const [error, count] of Object.entries(errorCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}次: ${error}`);
    }
  }

  // 展示一个成功的输出样例
  const successResult = allResults.find((r) => r.success);
  if (successResult && successResult.parsedOutput) {
    console.log('\n========================================');
    console.log('成功输出样例:');
    console.log('========================================');
    console.log(JSON.stringify(successResult.parsedOutput, null, 2));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('测试运行失败:', e);
  process.exit(1);
});
