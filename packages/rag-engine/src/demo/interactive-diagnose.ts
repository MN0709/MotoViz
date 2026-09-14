/**
 * 交互式故障诊断Demo
 *
 * 用法：node dist/demo/interactive-diagnose.js
 *
 * 你可以在终端里输入故障症状、车型、里程，它会调用真实的DeepSeek API，返回诊断结果。
 * 用来验收：车型里程参数、同义词检索、降级逻辑。
 */

import { createInterface } from 'node:readline';
import { diagnoseFault } from '../diagnosis-engine.js';
import type { LLMAdapter } from '../diagnosis-types.js';
import { selectLLMAdapter } from '../llm-adapter.js';
import type { KnowledgeDocument } from '../knowledge-search.js';

// 示例知识库（Demo用，真实数据由谢以波采集）
const sampleKnowledge: KnowledgeDocument[] = [
  {
    knowledgeId: 'kn-001',
    title: '春风250SR维修手册：启动系统',
    sourceType: 'manual',
    sourceUrl: 'https://example.com/manual/250sr-starter',
    content:
      '冷车启动困难时，先检查蓄电池电压（冷车应不低于12.4V），再检查火花塞电极间隙和积碳情况，最后检查节气门怠速空气通道是否堵塞。',
  },
  {
    knowledgeId: 'kn-002',
    title: '摩托车故障案例：冷启动困难',
    sourceType: 'fault-case',
    sourceUrl: 'https://example.com/case/cold-start',
    content:
      '一辆春风250SR，里程12000公里，冷车启动困难，有时要打3-4次火。检查发现蓄电池电压只有11.8V，更换蓄电池后问题解决。',
  },
  {
    knowledgeId: 'kn-003',
    title: '春风250SR维修手册：制动系统',
    sourceType: 'manual',
    sourceUrl: 'https://example.com/manual/250sr-brake',
    content:
      '刹车变软时，先检查制动液液位，再检查刹车片磨损情况，最后检查刹车管路是否有空气，必要时排空气。',
  },
  {
    knowledgeId: 'kn-004',
    title: '摩托车故障案例：刹车异响',
    sourceType: 'fault-case',
    sourceUrl: 'https://example.com/case/brake-noise',
    content: '一辆春风450SR，前刹车低速时吱吱响，检查发现刹车片磨损到极限，更换刹车片后异响消失。',
  },
  {
    knowledgeId: 'kn-005',
    title: '春风250SR维修手册：怠速调整',
    sourceType: 'manual',
    sourceUrl: 'https://example.com/manual/250sr-idle',
    content: '怠速熄火时，检查怠速空气通道是否积碳，清洁后调整怠速螺钉至标准转速1300±100rpm。',
  },
];

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('=== 摩托车故障诊断交互式Demo ===\n');
  console.log('这个Demo用来验收：车型里程参数、同义词检索、降级逻辑\n');

  // 让用户选择模式
  const mode = await ask('选择模式：1=真实API调用，2=Mock模式（不耗API额度）：');
  const useHttp = mode.trim() === '1';

  let adapter: LLMAdapter;
  if (useHttp) {
    const selected = selectLLMAdapter({ ...process.env, LLM_MODE: 'http' });
    adapter = selected.adapter;
    console.log(`${selected.note}。密钥仅从环境变量读取，不在终端输入或保存。\n`);
  } else {
    const selected = selectLLMAdapter({ ...process.env, LLM_MODE: 'mock' });
    adapter = selected.adapter;
    console.log(`已切换到Mock模式（${selected.note}）\n`);
  }

  let running = true;
  while (running) {
    console.log('\n--- 新的诊断 ---\n');
    const symptom = await ask('输入故障症状（输入q退出）：');
    if (symptom.trim().toLowerCase() === 'q') {
      running = false;
      break;
    }

    const motorcycleModel = await ask('输入车型（可选，直接回车跳过）：');
    const mileageStr = await ask('输入里程（公里，可选，直接回车跳过）：');
    const mileage = mileageStr.trim() ? Number(mileageStr) : undefined;
    if (mileage !== undefined && (!Number.isFinite(mileage) || mileage < 0)) {
      console.log('里程必须是非负数。');
      continue;
    }

    console.log('\n正在诊断...\n');

    try {
      const outcome = await diagnoseFault(symptom, sampleKnowledge, adapter, {
        motorcycleModel: motorcycleModel.trim() || undefined,
        mileage,
      });

      console.log('=== 诊断结果 ===\n');
      console.log(`是否降级：${outcome.degraded ? '是 ⚠️' : '否 ✅'}`);
      if (outcome.fallbackReason) console.log(`降级原因：${outcome.fallbackReason}`);
      console.log(`检索到 ${outcome.context.length} 条相关资料`);
      console.log(`\n诊断结论：${outcome.result.diagnosis}`);

      if (outcome.result.possibleCauses.length > 0) {
        console.log('\n可能原因：');
        outcome.result.possibleCauses.forEach((c, i) => {
          console.log(`  ${i + 1}. [概率${c.probability}] ${c.cause}`);
          console.log(`     解决办法：${c.solution}`);
        });
      }

      if (outcome.result.requiredParts && outcome.result.requiredParts.length > 0) {
        console.log('\n建议更换配件：');
        outcome.result.requiredParts.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.brand} ${p.name}（库存：${p.stock}）`);
        });
      }

      console.log('\n引用资料：');
      outcome.result.references.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.sourceType}] ${r.title}`);
        console.log(`     摘要：${r.excerpt.slice(0, 60)}...`);
      });
    } catch (error) {
      console.log(`诊断出错：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  rl.close();
  console.log('\n=== Demo结束 ===');
}

main().catch(console.error);
