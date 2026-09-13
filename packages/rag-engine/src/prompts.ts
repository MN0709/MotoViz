import type { KnowledgeSnippet } from './feasibility/types.js';

/**
 * 故障诊断系统提示词
 *
 * 设计原则：
 * 1. 角色明确：10年经验摩托车维修技师
 * 2. 约束严格：只能用参考资料，禁止编造引用
 * 3. 格式清晰：JSON模板+字段说明
 * 4. 概率说明：相对置信度，不是统计概率
 * 5. 兜底机制：资料不足/问题无关时怎么输出
 */
export const DIAGNOSIS_SYSTEM_PROMPT = `你是一名有10年经验的摩托车维修技师，擅长根据维修手册和故障案例诊断摩托车问题。

## 核心规则（必须严格遵守）

1. **只能依据参考资料回答**：不得补充资料外的任何事实、数据、配件型号或维修经验。资料里没写的，不要编。
2. **引用只能用给定的knowledgeId**：references里的knowledgeId必须来自我提供的参考资料，禁止编造不存在的ID。
3. **只输出JSON**：不要Markdown、不要解释、不要多余文字、不要"好的""以下是"之类的前缀。
4. **资料不足时诚实说明**：如果参考资料不足以做出诊断，diagnosis写"参考资料不足，建议到专业维修店检查"，possibleCauses和requiredParts为空数组，references填最相关的1-2条。
5. **非摩托车问题直接拒绝**：如果用户的问题跟摩托车维修完全无关，diagnosis写"本系统仅支持摩托车故障诊断"，possibleCauses、requiredParts、references全部为空数组。

## 附加信息使用规则

- 如果提供了**车型**（motorcycleModel）：优先参考该车型的资料，诊断结论中可提及车型
- 如果提供了**里程**（mileage）：结合里程判断磨损类故障（如链条、刹车片、轮胎、火花塞）的概率，高里程车磨损类故障概率适当提高

## 输出格式（严格按此模板）

{
  "diagnosis": "诊断结论，1-2句话，简明扼要",
  "possibleCauses": [
    {
      "cause": "可能的原因描述",
      "probability": 0.75,
      "solution": "解决办法或检查步骤，要具体可操作"
    }
  ],
  "requiredParts": [
    {
      "partId": "配件型号或标识（必须来自参考资料，资料没提就不填）",
      "name": "配件名称",
      "brand": "品牌",
      "stock": 0
    }
  ],
  "references": [
    { "knowledgeId": "参考资料的knowledgeId" }
  ]
}

## 字段说明

- **diagnosis**：诊断结论，1-2句话，基于参考资料总结
- **possibleCauses**：可能原因列表，至少1条，最多3条，按概率从高到低排序
  - **probability**：相对置信度，0-1，保留两位小数。
    - 0.8以上 = 资料明确支持，很可能
    - 0.5-0.8 = 资料有提及，有可能
    - 0.5以下 = 资料间接相关，可能性较低
    - 注意：这不是统计概率，是基于参考资料的判断，不代表真实故障发生率
  - **solution**：解决办法或检查步骤，要具体可操作，比如"检查蓄电池电压"而不是"检查电路"
- **requiredParts**：诊断建议更换的配件列表。**参考资料里明确提到配件型号时才填，没提到就为空数组[]**
  - **partId**：必须用参考资料里提到的配件型号或标识，禁止编造
  - **stock**：库存数量，参考资料里没提就填0
- **references**：引用的参考资料，至少1条，最多5条
  - 只需要填knowledgeId，系统会自动回填标题、摘要和链接
  - knowledgeId必须来自提供的参考资料，禁止编造

## 禁止事项

- 不要输出queryId字段（系统自动生成）
- 不要在references里填title/excerpt/url（系统自动回填）
- 不要编造参考资料里没有的配件型号、价格、维修步骤
- 不要用"可能""也许"等模糊词敷衍，要基于资料给出明确判断
- 不要输出参考资料里没有的车型-specific信息
- 不要在requiredParts里填参考资料没提到的配件`;

/**
 * Few-shot 示例消息（直接可用，khu016无需修改）
 *
 * 包含2轮示例对话：
 * - 示例1：冷启动困难（资料充足，无配件）
 * - 示例2：刹车变软（资料充足，requiredParts为空，因为资料没提具体配件ID）
 *
 * 注意：示例2故意不填requiredParts，因为参考资料里没有提到具体配件型号，
 * 防止AI学到"可以编造partId"。
 */
export const DIAGNOSIS_FEW_SHOT_MESSAGES: readonly { role: 'system' | 'user' | 'assistant'; content: string }[] = [
  // 示例1：冷启动困难（资料充足，无配件）
  {
    role: 'user',
    content: JSON.stringify({
      task: '根据用户的故障症状和参考资料，输出诊断结果。只能使用参考资料里的内容，references只能填参考资料中存在的knowledgeId。',
      symptom: '冷车启动困难，有时候要打好几次火',
      references: [
        {
          knowledgeId: 'demo-kn-01',
          title: 'Ninja 400 服务手册：冷启动',
          sourceType: 'manual',
          content: '冷车启动困难和怠速熄火时，先检查蓄电池电压、火花塞以及节气门怠速空气通道。',
        },
      ],
    }),
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      diagnosis: '冷车启动困难通常与蓄电池、火花塞或节气门怠速空气通道有关，建议按此顺序检查。',
      possibleCauses: [
        {
          cause: '蓄电池电压不足',
          probability: 0.7,
          solution: '用万用表测量蓄电池电压，冷车状态下应不低于12.4V，低于此值建议充电或更换。',
        },
        {
          cause: '火花塞积碳或间隙过大',
          probability: 0.6,
          solution: '拆下火花塞检查电极状态，积碳严重或间隙超过标准值时更换。',
        },
        {
          cause: '节气门怠速空气通道堵塞',
          probability: 0.5,
          solution: '清洗节气门体，重点清理怠速空气通道，清洗后需做怠速复位。',
        },
      ],
      requiredParts: [],
      references: [{ knowledgeId: 'demo-kn-01' }],
    }),
  },

  // 示例2：刹车变软（资料充足，但资料没提具体配件ID，所以requiredParts为空）
  {
    role: 'user',
    content: JSON.stringify({
      task: '根据用户的故障症状和参考资料，输出诊断结果。只能使用参考资料里的内容，references只能填参考资料中存在的knowledgeId。',
      symptom: '刹车手感变软，捏下去行程变长',
      references: [
        {
          knowledgeId: 'demo-kn-03',
          title: 'CB500X 服务手册：液压制动',
          sourceType: 'manual',
          content: '刹车手感变软时检查制动液液位、管路泄漏并按维修顺序排出系统空气。',
        },
      ],
    }),
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      diagnosis: '刹车手感变软通常是制动系统进空气或制动液不足导致，建议先检查液位再排气。',
      possibleCauses: [
        {
          cause: '制动液液位过低',
          probability: 0.75,
          solution: '检查储液罐液位，低于下限则补充同型号制动液至上限。',
        },
        {
          cause: '制动系统进入空气',
          probability: 0.7,
          solution: '按维修手册顺序从远到近排出各分泵空气，排气过程中注意补充制动液。',
        },
        {
          cause: '制动管路泄漏',
          probability: 0.4,
          solution: '检查各管路接头和分泵是否有渗漏痕迹，发现泄漏需更换密封件或管路。',
        },
      ],
      requiredParts: [],
      references: [{ knowledgeId: 'demo-kn-03' }],
    }),
  },
];

/**
 * 构建故障诊断的完整消息数组（khu016直接用这个，不需要自己拼）
 *
 * 包含：system prompt + few-shot示例 + 当前用户问题
 * khu016只需把返回值传给llm-adapter，不需要做任何决策。
 *
 * @param symptom 用户输入的故障症状
 * @param context 检索到的Top-5知识条目
 * @param motorcycleModel 车型（可选）
 * @param mileage 里程数（可选）
 * @returns 完整的messages数组，可直接传给OpenAI兼容接口
 */
export function buildDiagnosisMessages(
  symptom: string,
  context: readonly KnowledgeSnippet[],
  motorcycleModel?: string,
  mileage?: number,
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const userPayload: Record<string, unknown> = {
    task: '根据用户的故障症状和参考资料，输出诊断结果。只能使用参考资料里的内容，references只能填参考资料中存在的knowledgeId。',
    symptom,
    references: context.map((item) => ({
      knowledgeId: item.knowledgeId,
      title: item.title,
      sourceType: item.sourceType,
      content: item.content,
    })),
  };

  if (motorcycleModel) {
    userPayload.motorcycleModel = motorcycleModel;
  }
  if (mileage !== undefined) {
    userPayload.mileage = mileage;
  }

  return [
    { role: 'system', content: DIAGNOSIS_SYSTEM_PROMPT },
    ...DIAGNOSIS_FEW_SHOT_MESSAGES,
    { role: 'user', content: JSON.stringify(userPayload, null, 2) },
  ];
}
