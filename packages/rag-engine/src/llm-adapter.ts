import type { LLMAdapter } from './diagnosis-types.js';
import type { KnowledgeSearchHit } from './knowledge-search.js';
import { buildDiagnosisMessages } from './prompts.js';

const HARD_TIMEOUT_MS = 4500;

export type LLMAdapterErrorCode = 'timeout' | 'invalid-json' | 'http-error' | 'invalid-response';

export class LLMAdapterError extends Error {
  public constructor(
    public readonly code: LLMAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LLMAdapterError';
  }
}

export interface HttpLLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

function completionUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/u, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readChatContent(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new LLMAdapterError('invalid-response', 'LLM 响应缺少 choices');
  }
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
    throw new LLMAdapterError('invalid-response', 'LLM 响应缺少 message.content');
  }
  return first.message.content;
}

function parseJsonObject(content: string): Record<string, unknown> {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFence);
  } catch {
    throw new LLMAdapterError('invalid-json', 'LLM 返回了非法 JSON');
  }
  if (!isRecord(parsed)) {
    throw new LLMAdapterError('invalid-response', 'LLM JSON 顶层必须是对象');
  }
  return parsed;
}

export function resolveLLMTimeoutMs(timeoutMs?: number): number {
  return Math.max(1, Math.min(timeoutMs ?? HARD_TIMEOUT_MS, HARD_TIMEOUT_MS));
}

/** 默认 Mock 只验证完整链路，不声称具备真实维修诊断能力。 */
export class MockLLMAdapter implements LLMAdapter {
  public async generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSearchHit[],
    _motorcycleModel?: string,
    _mileage?: number,
  ): Promise<unknown> {
    const first = context[0];
    if (!first) throw new Error('没有可用知识上下文');
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
      references: [{ knowledgeId: first.knowledgeId }],
    };
  }
}

/** OpenAI/豆包兼容的 chat/completions HTTP 适配器。 */
export class HttpLLMAdapter implements LLMAdapter {
  public constructor(private readonly config: HttpLLMConfig) {}

  public async generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSearchHit[],
    motorcycleModel?: string,
    mileage?: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = resolveLLMTimeoutMs(this.config.timeoutMs);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (this.config.fetchImpl ?? fetch)(completionUrl(this.config.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature ?? 0.1,
          max_tokens: this.config.maxTokens ?? 1200,
          response_format: { type: 'json_object' },
          messages: buildDiagnosisMessages(symptom, context, motorcycleModel, mileage),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new LLMAdapterError('http-error', `LLM HTTP ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new LLMAdapterError('invalid-json', 'LLM HTTP 响应不是合法 JSON');
      }
      return parseJsonObject(readChatContent(payload));
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LLMAdapterError('timeout', `LLM 请求超过 ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * 多 API Key 轮询适配器（双API兜底）
 *
 * 主 key 调用失败（http-error 或 timeout）时，自动用备用 key 再试一次。
 * 只有所有 key 都失败了，才抛出错误让上层降级。
 *
 * 产品决策：单个 API key 有失效风险（额度用完、被封禁、网络问题），
 * 双 key 兜底能把"AI不可用"的概率降低一半，Demo 演示更稳。
 */
export class MultiKeyLLMAdapter implements LLMAdapter {
  private readonly adapters: HttpLLMAdapter[];

  public constructor(configs: HttpLLMConfig[]) {
    if (configs.length === 0) {
      throw new Error('MultiKeyLLMAdapter 至少需要一个 API key 配置');
    }
    this.adapters = configs.map((config) => new HttpLLMAdapter(config));
  }

  public async generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSearchHit[],
    motorcycleModel?: string,
    mileage?: number,
  ): Promise<unknown> {
    let lastError: unknown;
    for (let i = 0; i < this.adapters.length; i += 1) {
      try {
        return await this.adapters[i].generateDiagnosis(symptom, context, motorcycleModel, mileage);
      } catch (error) {
        lastError = error;
        // 只有 http-error 和 timeout 才切换下一个 key
        // invalid-json / invalid-response 是 AI 返回内容有问题，换 key 也没用
        const isRetryable =
          error instanceof LLMAdapterError &&
          (error.code === 'http-error' || error.code === 'timeout');
        if (!isRetryable) {
          throw error;
        }
        // 不是最后一个 key，继续试下一个
        if (i < this.adapters.length - 1) {
          continue;
        }
      }
    }
    throw lastError;
  }
}

export interface AdapterSelection {
  adapter: LLMAdapter;
  mode: 'mock' | 'http';
  note: string;
}

/** LLM_MODE=http 显式启用远端请求；默认 Mock，避免误耗真实 API。 */
export function selectLLMAdapter(environment: NodeJS.ProcessEnv): AdapterSelection {
  if (environment.LLM_MODE !== 'http') {
    return { adapter: new MockLLMAdapter(), mode: 'mock', note: '默认 Mock 模式' };
  }
  const { LLM_BASE_URL: baseUrl, LLM_API_KEY: apiKey, LLM_MODEL: model } = environment;
  if (!baseUrl || !apiKey || !model) {
    return {
      adapter: new MockLLMAdapter(),
      mode: 'mock',
      note: 'LLM_MODE=http 但配置不完整，已安全回退 Mock',
    };
  }
  return {
    adapter: new HttpLLMAdapter({ baseUrl, apiKey, model }),
    mode: 'http',
    note: 'OpenAI 兼容 HTTP 模式，4.5 秒硬超时',
  };
}
