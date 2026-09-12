import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from './http-error.js';
import { threeDRouter } from './routes/3d.js';
import { ragRouter } from './routes/rag.js';

const app = express();
const port = 3001;

const cors: RequestHandler = (_request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  next();
};

app.use(cors);
app.options('/{*path}', (_request, response) => response.sendStatus(204));
app.use(express.json({ limit: '1mb' }));
app.use('/api/3d', threeDRouter);
app.use('/api/rag', ragRouter);

app.use((_request, response) => {
  response.status(404).json({ code: 'ROUTE_NOT_FOUND', message: '接口不存在' });
});

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    response.status(tooLarge ? 413 : 400).json({
      code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_VALIDATION_ERROR',
      message: tooLarge ? '单张图片不能超过 5MB' : error.message,
    });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Mock Server 内部错误' });
};

app.use(errorHandler);

app.listen(port, () => {
  console.log(`MotoFit AI Mock Server listening on http://localhost:${port}`);
});
