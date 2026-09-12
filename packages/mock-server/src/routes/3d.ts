import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import type { GenerateRequest, GenerateResponse, PartType, UploadResponse } from '@motorcycle-ai/shared';
import { models } from '../data/models.js';
import { uploadIds } from '../data/uploads.js';
import { HttpError } from '../http-error.js';

const router = Router();
const partTypes: readonly PartType[] = ['exhaust', 'windshield', 'saddlebag', 'other'];
const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new HttpError(400, 'UNSUPPORTED_FILE_TYPE', '仅支持 JPG 和 PNG 图片'));
      return;
    }
    callback(null, true);
  },
});

function isPartType(value: unknown): value is PartType {
  return typeof value === 'string' && partTypes.includes(value as PartType);
}

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.uploadId === 'string' && candidate.uploadId.length > 0 && isPartType(candidate.partType);
}

router.post('/upload', upload.array('images', 4), (request, response) => {
  const files = request.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, 'IMAGES_REQUIRED', '请至少上传一张图片，字段名为 images');
  }

  const uploadId = `upload-${randomUUID()}`;
  uploadIds.add(uploadId);
  const result: UploadResponse = { uploadId, status: 'done' };
  response.status(201).json(result);
});

router.post('/generate', (request, response) => {
  const body: unknown = request.body;
  if (!isGenerateRequest(body)) {
    throw new HttpError(400, 'INVALID_GENERATE_REQUEST', 'uploadId 和合法的 partType 为必填项');
  }
  if (!uploadIds.has(body.uploadId)) {
    throw new HttpError(404, 'UPLOAD_NOT_FOUND', `uploadId ${body.uploadId} 不存在`);
  }

  const fallbackModel = models.find((model) => model.partType === body.partType) ?? models[0];
  if (!fallbackModel) {
    throw new HttpError(500, 'MODEL_GENERATION_FAILED', '没有可用的生成结果或预设模型');
  }
  const result: GenerateResponse = {
    modelId: fallbackModel.modelId,
    modelUrl: fallbackModel.modelUrl,
    format: 'glb',
    status: 'fallback',
  };
  response.status(200).json(result);
});

router.get('/models', (request, response) => {
  const partType = request.query.partType;
  if (partType !== undefined && !isPartType(partType)) {
    throw new HttpError(400, 'INVALID_PART_TYPE', 'partType 不是支持的配件类型');
  }

  const filtered = partType === undefined ? models : models.filter((model) => model.partType === partType);
  response.json({
    models: filtered.map(({ modelId, name, partType: type, modelUrl, thumbnailUrl }) => ({
      modelId,
      name,
      partType: type,
      modelUrl,
      thumbnailUrl,
    })),
  });
});

router.get('/model/:modelId', (request, response) => {
  const model = models.find((item) => item.modelId === request.params.modelId);
  if (!model) {
    throw new HttpError(404, 'MODEL_NOT_FOUND', `模型 ${request.params.modelId} 不存在`);
  }
  const { modelId, name, partType, modelUrl, scale, defaultPosition, defaultRotation } = model;
  response.json({ modelId, name, partType, modelUrl, scale, defaultPosition, defaultRotation });
});

export const threeDRouter = router;
