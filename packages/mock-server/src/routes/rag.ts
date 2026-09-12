import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type {
  FaultDiagnosisRequest,
  FaultDiagnosisResult,
  FeedbackRequest,
  FeedbackResponse,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from '@motorcycle-ai/shared';
import { faultCases } from '../data/faults.js';
import { knowledgeEntries } from '../data/knowledge.js';
import { parts } from '../data/parts.js';
import { HttpError } from '../http-error.js';

const router = Router();
const feedbackRecords: FeedbackRequest[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSearchRequest(value: unknown): SearchRequest {
  if (!isRecord(value) || typeof value.query !== 'string' || value.query.trim() === '') {
    throw new HttpError(400, 'QUERY_REQUIRED', 'query 不能为空');
  }
  if (value.motorcycleModel !== undefined && typeof value.motorcycleModel !== 'string') {
    throw new HttpError(400, 'INVALID_MOTORCYCLE_MODEL', 'motorcycleModel 必须是字符串');
  }
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 20)) {
    throw new HttpError(400, 'INVALID_LIMIT', 'limit 必须是 1-20 的整数');
  }
  return {
    query: value.query.trim(),
    motorcycleModel: typeof value.motorcycleModel === 'string' ? value.motorcycleModel.trim() : undefined,
    limit: typeof value.limit === 'number' ? value.limit : undefined,
  };
}

function parseFaultRequest(value: unknown): FaultDiagnosisRequest {
  if (!isRecord(value) || typeof value.symptom !== 'string' || value.symptom.trim() === '') {
    throw new HttpError(400, 'SYMPTOM_REQUIRED', 'symptom 不能为空');
  }
  if (value.motorcycleModel !== undefined && typeof value.motorcycleModel !== 'string') {
    throw new HttpError(400, 'INVALID_MOTORCYCLE_MODEL', 'motorcycleModel 必须是字符串');
  }
  if (value.mileage !== undefined && (typeof value.mileage !== 'number' || value.mileage < 0)) {
    throw new HttpError(400, 'INVALID_MILEAGE', 'mileage 必须是非负数');
  }
  return {
    symptom: value.symptom.trim(),
    motorcycleModel: typeof value.motorcycleModel === 'string' ? value.motorcycleModel.trim() : undefined,
    mileage: typeof value.mileage === 'number' ? value.mileage : undefined,
  };
}

function inferPartType(query: string): string | undefined {
  if (/排气|exhaust/i.test(query)) return 'exhaust';
  if (/风挡|挡风|windshield/i.test(query)) return 'windshield';
  if (/边箱|侧箱|saddlebag/i.test(query)) return 'saddlebag';
  return undefined;
}

router.post('/search/parts', (request, response) => {
  const input = parseSearchRequest(request.body as unknown);
  const query = input.query.toLowerCase();
  const inferredType = inferPartType(query);
  const scored: SearchResult[] = parts
    .map((part) => {
      const searchable = `${part.name} ${part.brand} ${part.source} ${part.fitModels.join(' ')}`.toLowerCase();
      const typeMatch = inferredType === part.partType;
      const textMatch = searchable.includes(query);
      const modelMatch = input.motorcycleModel
        ? part.fitModels.some((model) => model.toLowerCase().includes(input.motorcycleModel?.toLowerCase() ?? ''))
        : false;
      const score = Math.min(0.99, 0.45 + (typeMatch ? 0.25 : 0) + (textMatch ? 0.15 : 0) + (modelMatch ? 0.14 : 0));
      return { ...part, score };
    })
    .filter((part) => inferredType === undefined || part.partType === inferredType)
    .filter((part) => !input.motorcycleModel || part.fitModels.some((model) => model.includes(input.motorcycleModel ?? '')))
    .sort((left, right) => right.score - left.score);

  const limit = input.limit ?? 10;
  const result: SearchResponse = {
    queryId: `query-${randomUUID()}`,
    results: scored.slice(0, limit),
    total: scored.length,
  };
  response.json(result);
});

router.post('/search/fault', (request, response) => {
  const input = parseFaultRequest(request.body as unknown);
  const matches = faultCases
    .map((faultCase) => {
      const symptomScore = faultCase.symptoms.filter(
        (symptom) => input.symptom.includes(symptom) || symptom.includes(input.symptom),
      ).length;
      const modelScore = input.motorcycleModel
        ? faultCase.motorcycleModels.some((model) => model.includes(input.motorcycleModel ?? ''))
          ? 1
          : 0
        : 0;
      return { faultCase, score: symptomScore * 2 + modelScore };
    })
    .sort((left, right) => right.score - left.score);
  const best = matches[0];
  if (!best) {
    throw new HttpError(500, 'MOCK_DATA_EMPTY', 'Mock 故障案例为空');
  }

  const result: FaultDiagnosisResult = {
    queryId: `query-${randomUUID()}`,
    diagnosis: best.score > 0 ? best.faultCase.diagnosis : '未精确命中症状，以下为通用安全排查建议，请由专业技师复核。',
    possibleCauses: best.faultCase.possibleCauses,
    requiredParts: best.faultCase.requiredParts,
    references: best.faultCase.references,
  };
  response.json(result);
});

router.get('/knowledge/:id', (request, response) => {
  const entry = knowledgeEntries.find((item) => item.id === request.params.id);
  if (!entry) {
    throw new HttpError(404, 'KNOWLEDGE_NOT_FOUND', `知识条目 ${request.params.id} 不存在`);
  }
  response.json(entry);
});

router.post('/feedback', (request, response) => {
  const body: unknown = request.body;
  if (!isRecord(body) || typeof body.queryId !== 'string' || body.queryId.trim() === '') {
    throw new HttpError(400, 'QUERY_ID_REQUIRED', 'queryId 不能为空');
  }
  if (body.rating !== 'up' && body.rating !== 'down') {
    throw new HttpError(400, 'INVALID_RATING', 'rating 只能是 up 或 down');
  }
  if (body.comment !== undefined && typeof body.comment !== 'string') {
    throw new HttpError(400, 'INVALID_COMMENT', 'comment 必须是字符串');
  }
  feedbackRecords.push({
    queryId: body.queryId,
    rating: body.rating,
    comment: typeof body.comment === 'string' ? body.comment : undefined,
  });
  const result: FeedbackResponse = { success: true };
  response.status(201).json(result);
});

export const ragRouter = router;
