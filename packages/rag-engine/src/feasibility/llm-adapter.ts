import type { PossibleCause, Reference, RequiredPart } from '@motorcycle-ai/shared';
import type { DiagnosisGeneration, KnowledgeSnippet, LLMAdapter } from './types.js';

export interface HttpLLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

function trustedReference(snippet: KnowledgeSnippet): Reference {
  return {
    knowledgeId: snippet.knowledgeId,
    title: snippet.title,
    sourceType: snippet.sourceType,
    excerpt: snippet.content.slice(0, 200),
    url: snippet.sourceUrl,
  };
}

function degradedResult(symptom: string, context: readonly KnowledgeSnippet[]): DiagnosisGeneration {
  const first = context[0];
  return {
    diagnosis: `诊断生成暂时不可用；已保留“${symptom}”的检索资料，请由技师根据原文复核。`,
    possibleCauses: [],
    requiredParts: [],
    references: first ? [trustedReference(first)] : [],
    degraded: true,
  };
}

/** 默认 Mock 只验证格式链路，不把固定文案冒充真实诊断能力。 */
export class MockLLMAdapter implements LLMAdapter {
  public async generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSnippet[],
  ): Promise<DiagnosisGeneration> {
    const first = context[0];
    if (!first) return degradedResult(symptom, context);
    return {
      diagnosis: `根据《${first.title}》，应按资料顺序检查与“${symptom}”相关的系统。`,
      possibleCauses: [
        {
          cause: '检索资料中描述的相关部件状态异常',
          probability: 0.65,
          solution: first.content,
        },
      ],
      requiredParts: [],
      references: [trustedReference(first)],
      degraded: false,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readChatContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) throw new Error('LLM 响应缺少 choices');
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
    throw new Error('LLM 响应缺少 message.content');
  }
  return first.message.content;
}

function parseJsonObject(content: string): Record<string, unknown> {
  // 兼容供应商偶尔返回的 Markdown 围栏，但不会修补业务字段或伪造证据。
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const parsed: unknown = JSON.parse(withoutFence);
  if (!isRecord(parsed)) throw new Error('LLM JSON 顶层必须是对象');
  return parsed;
}

function parsePossibleCauses(value: unknown): PossibleCause[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('possibleCauses 必须是非空数组');
  return value.map((item) => {
    if (!isRecord(item) || typeof item.cause !== 'string' || typeof item.solution !== 'string') {
      throw new Error('possibleCauses 字段不完整');
    }
    const probability = typeof item.probability === 'string' ? Number(item.probability) : item.probability;
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error('probability 必须是 0-1 数字');
    }
    return { cause: item.cause, probability, solution: item.solution };
  });
}

function parseRequiredParts(value: unknown): RequiredPart[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('requiredParts 必须是数组');
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.partId !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.brand !== 'string' ||
      typeof item.stock !== 'number' ||
      !Number.isInteger(item.stock) ||
      item.stock < 0
    ) {
      throw new Error('requiredParts 字段不完整');
    }
    return { partId: item.partId, name: item.name, brand: item.brand, stock: item.stock };
  });
}

function mapTrustedReferences(value: unknown, context: readonly KnowledgeSnippet[]): Reference[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('references 必须是非空数组');
  const ids = value.map((item) => {
    if (!isRecord(item) || typeof item.knowledgeId !== 'string') {
      throw new Error('reference 缺少 knowledgeId');
    }
    return item.knowledgeId;
  });
  const uniqueIds = [...new Set(ids)];
  return uniqueIds.map((id) => {
    const snippet = context.find((item) => item.knowledgeId === id);
    if (!snippet) throw new Error(`LLM 引用了未提供的知识条目 ${id}`);
    // title、excerpt、url 由受信上下文回填，不信任模型复述，避免伪造引用。
    return trustedReference(snippet);
  });
}

function normalizeDiagnosis(
  value: Record<string, unknown>,
  context: readonly KnowledgeSnippet[],
): DiagnosisGeneration {
  if (typeof value.diagnosis !== 'string' || value.diagnosis.trim() === '') {
    throw new Error('diagnosis 必须是非空字符串');
  }
  return {
    diagnosis: value.diagnosis.trim(),
    possibleCauses: parsePossibleCauses(value.possibleCauses),
    requiredParts: parseRequiredParts(value.requiredParts),
    references: mapTrustedReferences(value.references, context),
    degraded: false,
  };
}

function completionUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/u, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

/** OpenAI/豆包兼容的 chat/completions HTTP 适配器。 */
export class HttpLLMAdapter implements LLMAdapter {
  public constructor(private readonly config: HttpLLMConfig) {}

  public async generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSnippet[],
  ): Promise<DiagnosisGeneration> {
    try {
      if (context.length === 0) return degradedResult(symptom, context);
      const response = await fetch(completionUrl(this.config.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.1,
          // JSON 约束降低供应商输出的结构漂移；代码仍必须校验，因为 json_object 不等于业务 Schema。
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '你是摩托车维修资料整理助手。只能依据提供的资料回答，不得补充资料外事实。只输出 JSON，不要 Markdown。probability 是资料支持下的相对置信度，范围 0-1，保留两位小数，不代表真实故障发生率。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                task: '根据 symptom 和 context 输出诊断。references 只能填写 context 中存在的 knowledgeId。',
                outputTemplate: {
                  diagnosis: 'string',
                  possibleCauses: [{ cause: 'string', probability: 0.5, solution: 'string' }],
                  requiredParts: [{ partId: 'string', name: 'string', brand: 'string', stock: 0 }],
                  references: [{ knowledgeId: 'string' }],
                },
                symptom,
                context,
              }),
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 4500),
      });
      if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
      const payload: unknown = await response.json();
      return normalizeDiagnosis(parseJsonObject(readChatContent(payload)), context);
    } catch {
      // 解析、Schema、证据或网络任一失败都返回结构稳定的降级结果，防止前端链路崩溃。
      return degradedResult(symptom, context);
    }
  }
}

export interface AdapterSelection {
  adapter: LLMAdapter;
  mode: 'mock' | 'real';
  realLatencyTested: boolean;
  note: string;
}

/** LLM_MODE=real 是显式开关；默认 mock，避免误发真实 API 请求。 */
export function selectAdapter(environment: NodeJS.ProcessEnv): AdapterSelection {
  if (environment.LLM_MODE !== 'real') {
    return { adapter: new MockLLMAdapter(), mode: 'mock', realLatencyTested: false, note: '默认 Mock 模式' };
  }
  const { LLM_BASE_URL: baseUrl, LLM_API_KEY: apiKey, LLM_MODEL: model } = environment;
  if (!baseUrl || !apiKey || !model) {
    return {
      adapter: new MockLLMAdapter(),
      mode: 'mock',
      realLatencyTested: false,
      note: 'LLM_MODE=real 但配置不完整，已安全回退 Mock',
    };
  }
  return {
    adapter: new HttpLLMAdapter({ baseUrl, apiKey, model }),
    mode: 'real',
    realLatencyTested: true,
    note: '真实 OpenAI 兼容 HTTP 模式',
  };
}
