/**
 * 双API兜底自动测试
 * 跑三个场景：1.两个key都对 2.第一个错第二个对 3.两个都错
 */

import { diagnoseFault } from '../diagnosis-engine.js';
import { MultiKeyLLMAdapter } from '../llm-adapter.js';
import type { KnowledgeDocument } from '../knowledge-search.js';

const sampleKnowledge: KnowledgeDocument[] = [
  {
    knowledgeId: 'kn-001',
    title: '春风250SR维修手册：启动系统',
    sourceType: 'manual',
    sourceUrl: 'https://example.com/manual/250sr-starter',
    content: '冷车启动困难时，先检查蓄电池电压（冷车应不低于12.4V），再检查火花塞电极间隙和积碳情况，最后检查节气门怠速空气通道是否堵塞。',
  },
  {
    knowledgeId: 'kn-002',
    title: '摩托车故障案例：冷启动困难',
    sourceType: 'fault-case',
    sourceUrl: 'https://example.com/case/cold-start',
    content: '一辆春风250SR，里程12000公里，冷车启动困难，有时要打3-4次火。检查发现蓄电池电压只有11.8V，更换蓄电池后问题解决。',
  },
  {
    knowledgeId: 'kn-003',
    title: '春风250SR维修手册：制动系统',
    sourceType: 'manual',
    sourceUrl: 'https://example.com/manual/250sr-brake',
    content: '刹车变软时，先检查制动液液位，再检查刹车片磨损情况，最后检查刹车管路是否有空气，必要时排空气。',
  },
];

const KEY1 = 'sk-631acc566f7d4cb3be9fcdaffbc1633d';
const KEY2 = 'sk-e9959d35c5a04bd984dc0a8eeaceea9b';
const WRONG_KEY = 'sk-wrongkey1234567890abcdef';

function makeAdapter(keys: string[]) {
  return new MultiKeyLLMAdapter(
    keys.map((apiKey) => ({
      baseUrl: 'https://api.deepseek.com',
      apiKey,
      model: 'deepseek-chat',
      timeoutMs: 4500,
    })),
  );
}

async function runTest(name: string, keys: string[], symptom: string) {
  console.log(`\n=== ${name} ===`);
  console.log(`keys: ${keys.map((k) => k.slice(0, 10) + '...').join(', ')}`);
  console.log(`症状: ${symptom}`);
  const start = Date.now();
  try {
    const outcome = await diagnoseFault(symptom, sampleKnowledge, makeAdapter(keys), {
      motorcycleModel: '春风250SR',
      mileage: 12000,
    });
    const duration = Date.now() - start;
    console.log(`耗时: ${duration}ms`);
    console.log(`是否降级: ${outcome.degraded ? '是 ⚠️' : '否 ✅'}`);
    if (outcome.fallbackReason) console.log(`降级原因: ${outcome.fallbackReason}`);
    console.log(`诊断结论: ${outcome.result.diagnosis.slice(0, 80)}...`);
    console.log(`可能原因数: ${outcome.result.possibleCauses.length}`);
    console.log(`引用数: ${outcome.result.references.length}`);
  } catch (error) {
    console.log(`出错: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log('双API兜底自动测试开始');

  // 测试1：两个key都对
  await runTest('测试1：两个key都对（正常调用）', [KEY1, KEY2], '冷启动困难');

  // 测试2：第一个key错，第二个key对（兜底切换）
  await runTest('测试2：第一个key错，第二个key对（兜底切换）', [WRONG_KEY, KEY1], '刹车异响');

  // 测试3：两个key都错（最终降级）
  await runTest('测试3：两个key都错（最终降级）', [WRONG_KEY, 'sk-also-wrong'], '冷启动困难');

  console.log('\n=== 全部测试完成 ===');
}

main().catch(console.error);
