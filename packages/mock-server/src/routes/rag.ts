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
import {
  expandControlledPartQueryTerms,
  inferPartTypeFromQuery,
  matchesMotorcycleModel,
  normalizeSearchText,
} from '@motorcycle-ai/shared';
import { faultCases } from '../data/faults.js';
import { knowledgeEntries } from '../data/knowledge.js';
import { parts } from '../data/parts.js';
import { HttpError } from '../http-error.js';

const router = Router();
const feedbackRecords: FeedbackRequest[] = [];
/** 当前 Mock 进程内已产生的配件或故障查询；用于校验 feedback.queryId。 */
const queryIds = new Set<string>();

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
  if (
    value.limit !== undefined &&
    (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 20)
  ) {
    throw new HttpError(400, 'INVALID_LIMIT', 'limit 必须是 1-20 的整数');
  }
  return {
    query: value.query.trim(),
    motorcycleModel:
      typeof value.motorcycleModel === 'string' ? value.motorcycleModel.trim() : undefined,
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
    motorcycleModel:
      typeof value.motorcycleModel === 'string' ? value.motorcycleModel.trim() : undefined,
    mileage: typeof value.mileage === 'number' ? value.mileage : undefined,
  };
}

router.post('/search/parts', (request, response) => {
  const input = parseSearchRequest(request.body as unknown);
  const queryTerms = expandControlledPartQueryTerms(input.query);
  const inferredType = inferPartTypeFromQuery(input.query);
  const scored: SearchResult[] = parts
    .map((part) => {
      const searchable = normalizeSearchText(
        `${part.name} ${part.brand} ${part.source} ${part.fitModels.join(' ')}`,
      );
      const typeMatch = inferredType === part.partType;
      const textMatch = queryTerms.some((term) => searchable.includes(normalizeSearchText(term)));
      const modelMatch = input.motorcycleModel
        ? part.fitModels.some((model) => matchesMotorcycleModel(model, input.motorcycleModel ?? ''))
        : false;
      const score = Math.min(
        0.99,
        (typeMatch ? 0.45 : 0) + (textMatch ? 0.4 : 0) + (modelMatch ? 0.14 : 0),
      );
      const entry = knowledgeEntries.find((item) => item.id === `kn-catalog-${part.partId}`);
      return {
        ...part,
        score,
        references: entry
          ? [
              {
                knowledgeId: entry.id,
                title: entry.title,
                sourceType: entry.sourceType,
                excerpt: entry.content.slice(0, 200),
                url: entry.sourceUrl,
                documentId: entry.documentId,
              },
            ]
          : [],
      };
    })
    .filter((part) => inferredType === undefined || part.partType === inferredType)
    .filter((part) => part.score > 0)
    .filter(
      (part) =>
        !input.motorcycleModel ||
        part.fitModels.some((model) => matchesMotorcycleModel(model, input.motorcycleModel ?? '')),
    )
    .sort((left, right) => right.score - left.score);

  const limit = input.limit ?? 10;
  const queryId = `query-${randomUUID()}`;
  const result: SearchResponse = {
    queryId,
    results: scored.slice(0, limit),
    total: scored.length,
  };
  queryIds.add(queryId);
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
    throw new HttpError(404, 'RAG_DIAGNOSIS_ERROR', '请求参数不合法或诊断失败');
  }

  const queryId = `query-${randomUUID()}`;
  const result: FaultDiagnosisResult = {
    queryId,
    diagnosis:
      best.score > 0
        ? best.faultCase.diagnosis
        : '未精确命中症状，以下为通用安全排查建议，请由专业技师复核。',
    possibleCauses: best.faultCase.possibleCauses,
    requiredParts: best.faultCase.requiredParts,
    references: best.faultCase.references,
  };
  queryIds.add(queryId);
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
    throw new HttpError(400, 'INVALID_RATING', 'rating 必须是 up 或 down');
  }
  if (body.comment !== undefined && typeof body.comment !== 'string') {
    throw new HttpError(400, 'INVALID_COMMENT', 'comment 必须是字符串');
  }
  const queryId = body.queryId.trim();
  if (!queryIds.has(queryId)) {
    throw new HttpError(404, 'QUERY_NOT_FOUND', `查询记录 ${queryId} 不存在`);
  }
  feedbackRecords.push({
    queryId,
    rating: body.rating,
    comment: typeof body.comment === 'string' ? body.comment : undefined,
  });
  const result: FeedbackResponse = { success: true };
  response.status(201).json(result);
});

export const ragRouter = router;
