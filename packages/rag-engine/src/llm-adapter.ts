import type { LLMAdapter } from './diagnosis-types.js';
import type { KnowledgeSearchHit } from './knowledge-search.js';
import { buildDiagnosisMessages, INSUFFICIENT_DIAGNOSIS } from './prompts.js';

const HARD_TIMEOUT_MS = 4500;
const TOTAL_TIMEOUT_MS = 4500;

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
  ): Promise<unknown> {
    const first = context[0];
    if (!first) {
      return {
        diagnosis: INSUFFICIENT_DIAGNOSIS,
        possibleCauses: [],
        requiredParts: [],
        references: [],
      };
    }
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
    return this.generateDiagnosisWithin(
      symptom,
      context,
      resolveLLMTimeoutMs(this.config.timeoutMs),
      motorcycleModel,
      mileage,
    );
  }

  public async generateDiagnosisWithin(
    symptom: string,
    context: readonly KnowledgeSearchHit[],
    budgetMs: number,
    motorcycleModel?: string,
    mileage?: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1, Math.min(resolveLLMTimeoutMs(this.config.timeoutMs), budgetMs));
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

/** 多 key 顺序兜底；所有尝试共享 4.5 秒总预算，并为余下 key 预留时间。 */
export class MultiKeyLLMAdapter implements LLMAdapter {
  private readonly adapters: HttpLLMAdapter[];

  public constructor(
    configs: readonly HttpLLMConfig[],
    private readonly totalTimeoutMs = TOTAL_TIMEOUT_MS,
  ) {
    if (configs.length === 0 || configs.length > 2)
      throw new Error('只允许配置一个主 key 和一个备用 key');
    if (totalTimeoutMs < 1 || totalTimeoutMs > TOTAL_TIMEOUT_MS)
      throw new Error('LLM 总超时预算必须在 1-4500ms');
    this.adapters = configs.map((config) => new HttpLLMAdapter(config));
  }

  public async generateDiagnosis(
    symptom: string,
    context: readonly KnowledgeSearchHit[],
    motorcycleModel?: string,
    mileage?: number,
  ): Promise<unknown> {
    const deadline = Date.now() + this.totalTimeoutMs;
    let lastError: unknown;
    for (let index = 0; index < this.adapters.length; index += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const keysLeft = this.adapters.length - index;
      const attemptBudget = Math.max(1, Math.floor(remaining / keysLeft));
      try {
        return await this.adapters[index].generateDiagnosisWithin(
          symptom,
          context,
          attemptBudget,
          motorcycleModel,
          mileage,
        );
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof LLMAdapterError &&
          (error.code === 'timeout' || error.code === 'http-error');
        if (!retryable) throw error;
      }
    }
    throw lastError ?? new LLMAdapterError('timeout', 'LLM 总请求预算已耗尽');
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
  const {
    LLM_BASE_URL: baseUrl,
    LLM_API_KEY: apiKey,
    LLM_API_KEY_BACKUP: backupApiKey,
    LLM_MODEL: model,
  } = environment;
  if (!baseUrl || !apiKey || !model) {
    return {
      adapter: new MockLLMAdapter(),
      mode: 'mock',
      note: 'LLM_MODE=http 但配置不完整，已安全回退 Mock',
    };
  }
  return {
    adapter: backupApiKey
      ? new MultiKeyLLMAdapter([
          { baseUrl, apiKey, model },
          { baseUrl, apiKey: backupApiKey, model },
        ])
      : new HttpLLMAdapter({ baseUrl, apiKey, model }),
    mode: 'http',
    note: backupApiKey
      ? 'OpenAI 兼容 HTTP 模式，双 key 共享 4.5 秒总预算'
      : 'OpenAI 兼容 HTTP 模式，4.5 秒硬超时',
  };
}
