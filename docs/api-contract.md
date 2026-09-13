# MotoFit AI HTTP API 契约

> 版本：1.0.0（Day1 冻结候选）
>
> Base URL：`http://localhost:3001`（Mock）
>
> 代码类型源：`@motorcycle-ai/shared`
>
> 审核人：3D 组长 `@siguadht`、RAG 组长 `@MN0709`

本文档是 3D 组、RAG 组和前端之间的接口单一事实来源。路径、字段名、枚举或状态码发生变化时，必须同步修改共享类型、本文档、Mock Server 和调用方，并在变更记录中登记。

## 1. 通用约定

- 除文件上传外，请求和响应均为 `application/json; charset=utf-8`。
- JSON 字段使用 `camelCase`；ID 是非空字符串；时间使用 ISO 8601 UTC。
- 金额 `price` 的单位为人民币元；里程 `mileage` 的单位为公里。
- 列表没有匹配项时返回 `200` 和空数组，不用 `404`。
- 未特别说明的成功查询返回 `200 OK`；资源/记录创建返回 `201 Created`。
- Mock 中的 `queryId` 是反馈接口的关联键；真实服务必须让它在可观测周期内唯一。

### 1.1 统一错误响应

```ts
interface ApiError {
  code: string;
  message: string;
}
```

```json
{
  "code": "QUERY_REQUIRED",
  "message": "query 不能为空"
}
```

| HTTP                        | 使用场景                   |
| --------------------------- | -------------------------- |
| `400 Bad Request`           | 字段缺失、格式或枚举不合法 |
| `404 Not Found`             | ID 对应资源不存在          |
| `413 Payload Too Large`     | 单张上传文件超过限制       |
| `500 Internal Server Error` | 服务内部处理失败           |

## 2. 3D 组 API

### 2.1 上传配件图片

`POST /api/3d/upload`

上传 1-4 张图片并创建上传记录。每张最大 5MB，格式仅支持 JPEG/PNG。

请求：`multipart/form-data`

| 字段     | 类型     | 必填 | 规则                                                    |
| -------- | -------- | ---- | ------------------------------------------------------- |
| `images` | `File[]` | 是   | 1-4 张；MIME 为 `image/jpeg` 或 `image/png`；单张 ≤ 5MB |

逻辑类型为 `UploadRequest`，其中只描述服务端解析后的文件元数据；二进制不进入 JSON。

响应：`201 Created`、`UploadResponse`

```ts
interface UploadResponse {
  uploadId: string;
  status: 'processing' | 'done' | 'failed';
}
```

```json
{
  "uploadId": "upload-765927de-680d-42db-b468-c368163dfa81",
  "status": "done"
}
```

错误：

| HTTP | code                      | 条件                              |
| ---- | ------------------------- | --------------------------------- |
| 400  | `IMAGES_REQUIRED`         | 没有上传图片或字段名不是 `images` |
| 400  | `UNSUPPORTED_FILE_TYPE`   | 文件不是 JPEG/PNG                 |
| 400  | `UPLOAD_VALIDATION_ERROR` | 图片数量等 multipart 约束不合法   |
| 413  | `FILE_TOO_LARGE`          | 任意单张图片超过 5MB              |

```bash
curl -X POST http://localhost:3001/api/3d/upload \
  -F 'images=@./exhaust-front.jpg;type=image/jpeg' \
  -F 'images=@./exhaust-side.png;type=image/png'
```

### 2.2 生成 3D 模型

`POST /api/3d/generate`

根据已上传图片生成 GLB；生成链路不可用时返回同类型预设模型，并将 `status` 标记为 `fallback`。

请求：`application/json`、`GenerateRequest`

| 字段       | 类型                                                  | 必填 | 说明                   |
| ---------- | ----------------------------------------------------- | ---- | ---------------------- |
| `uploadId` | `string`                                              | 是   | 由上传接口返回         |
| `partType` | `'exhaust' \| 'windshield' \| 'saddlebag' \| 'other'` | 是   | 稳定枚举，不接收中文值 |

```json
{
  "uploadId": "upload-765927de-680d-42db-b468-c368163dfa81",
  "partType": "exhaust"
}
```

响应：`200 OK`、`GenerateResponse`

```ts
interface GenerateResponse {
  modelId: string;
  modelUrl: string;
  format: 'glb';
  status: 'success' | 'fallback';
}
```

```json
{
  "modelId": "model-exhaust-akrapovic",
  "modelUrl": "http://localhost:3001/mock-assets/models/akrapovic-exhaust.glb",
  "format": "glb",
  "status": "fallback"
}
```

错误：

| HTTP | code                       | 条件                       |
| ---- | -------------------------- | -------------------------- |
| 400  | `INVALID_GENERATE_REQUEST` | 缺少字段或 `partType` 非法 |
| 404  | `UPLOAD_NOT_FOUND`         | `uploadId` 不存在或已失效  |
| 500  | `MODEL_GENERATION_FAILED`  | 生成失败且没有可用降级模型 |

### 2.3 获取预设模型列表

`GET /api/3d/models`

查询参数：

| 参数       | 类型       | 必填 | 说明                   |
| ---------- | ---------- | ---- | ---------------------- |
| `partType` | `PartType` | 否   | 不传时返回全部预设模型 |

响应：`200 OK`

```ts
interface ModelListResponse {
  models: Array<Pick<Model3D, 'modelId' | 'name' | 'partType' | 'modelUrl' | 'thumbnailUrl'>>;
}
```

```json
{
  "models": [
    {
      "modelId": "model-exhaust-akrapovic",
      "name": "Akrapovič 碳纤维尾段排气",
      "partType": "exhaust",
      "modelUrl": "http://localhost:3001/mock-assets/models/akrapovic-exhaust.glb",
      "thumbnailUrl": "http://localhost:3001/mock-assets/thumbnails/akrapovic-exhaust.webp"
    }
  ]
}
```

错误：`400 INVALID_PART_TYPE`，表示筛选枚举不合法。

### 2.4 获取单个模型详情

`GET /api/3d/model/{modelId}`

路径参数：

| 参数      | 类型     | 必填 | 说明              |
| --------- | -------- | ---- | ----------------- |
| `modelId` | `string` | 是   | 预设或生成模型 ID |

响应：`200 OK`

```ts
interface ModelDetailResponse {
  modelId: string;
  name: string;
  partType: PartType;
  modelUrl: string;
  scale: Vector3;
  defaultPosition: Vector3;
  defaultRotation: Vector3;
}
```

```json
{
  "modelId": "model-windshield-touring",
  "name": "Puig Touring 加高风挡",
  "partType": "windshield",
  "modelUrl": "http://localhost:3001/mock-assets/models/puig-touring-windshield.glb",
  "scale": { "x": 1, "y": 1, "z": 1 },
  "defaultPosition": { "x": 0, "y": 1.08, "z": 0.55 },
  "defaultRotation": { "x": -18, "y": 0, "z": 0 }
}
```

错误：`404 MODEL_NOT_FOUND`，表示 `modelId` 不存在。

## 3. RAG 组 API

### 3.1 配件匹配检索

`POST /api/rag/search/parts`

请求：`SearchRequest`

| 字段              | 类型     | 必填 | 规则                         |
| ----------------- | -------- | ---- | ---------------------------- |
| `query`           | `string` | 是   | 去除首尾空格后不能为空       |
| `motorcycleModel` | `string` | 否   | 推荐使用“品牌 + 车型 + 年款” |
| `limit`           | `number` | 否   | 1-20 的整数，默认 10         |

```json
{
  "query": "排气",
  "motorcycleModel": "川崎 Ninja 400",
  "limit": 5
}
```

响应：`200 OK`、`SearchResponse`

```ts
interface SearchResponse {
  queryId: string;
  results: SearchResult[];
  total: number;
}

interface SearchResult {
  partId: string;
  name: string;
  brand: string;
  partType: PartType;
  fitModels: string[];
  price: number;
  source: string;
  sourceUrl: string;
  thumbnailUrl: string;
  score: number;
}
```

```json
{
  "queryId": "query-c179dd0c-cb70-4b73-82ee-3ba586139baa",
  "results": [
    {
      "partId": "part-001",
      "name": "碳纤维尾段排气",
      "brand": "Akrapovič",
      "partType": "exhaust",
      "fitModels": ["川崎 Ninja 400 2018-2023", "川崎 Z400 2019-2023"],
      "price": 5980,
      "source": "Akrapovič 2025 适配目录",
      "sourceUrl": "https://akrapovic.com/en/fitting/kawasaki-ninja-400-2018-2023",
      "thumbnailUrl": "http://localhost:3001/mock-assets/thumbnails/akrapovic-exhaust.webp",
      "score": 0.84
    }
  ],
  "total": 1
}
```

`partId` 是源数据持久化且不可变的 ID，加载器拒绝空值或重复值。CSV 的 `imageUrl` 映射为 API/共享类型的 `thumbnailUrl`。`fitModels` 只记录有来源证据的适配车型；数据未覆盖时返回空数组，不能推断兼容。3D 能力不由 `fitModels` 推断，只以独立的 `partId → modelId` 登记为准。

错误：

| HTTP | code                       | 条件                     |
| ---- | -------------------------- | ------------------------ |
| 400  | `QUERY_REQUIRED`           | `query` 缺失或为空       |
| 400  | `INVALID_MOTORCYCLE_MODEL` | 车型不是字符串           |
| 400  | `INVALID_LIMIT`            | `limit` 不是 1-20 的整数 |
| 500  | `RAG_SEARCH_ERROR`         | 检索内部失败             |

### 3.2 故障诊断检索

`POST /api/rag/search/fault`

请求：`FaultDiagnosisRequest`

| 字段              | 类型     | 必填 | 规则                   |
| ----------------- | -------- | ---- | ---------------------- |
| `symptom`         | `string` | 是   | 去除首尾空格后不能为空 |
| `motorcycleModel` | `string` | 否   | 车型与年款             |
| `mileage`         | `number` | 否   | 公里数，不得为负数     |

```json
{
  "symptom": "冷车启动困难，怠速容易熄火",
  "motorcycleModel": "川崎 Ninja 400",
  "mileage": 18500
}
```

响应：`200 OK`、`FaultDiagnosisResult`

```ts
interface FaultDiagnosisResult {
  queryId: string;
  diagnosis: string;
  possibleCauses: Array<{
    cause: string;
    probability: number;
    solution: string;
  }>;
  requiredParts: RequiredPart[];
  references: Reference[];
}

interface RequiredPart {
  partId: string;
  name: string;
  brand: string;
  stock: number;
}

interface Reference {
  knowledgeId: string;
  title: string;
  sourceType: 'manual' | 'fault-case' | 'part-catalog';
  excerpt: string;
  url: string;
}
```

`probability` 范围为 0-1。`references` **允许为空**（知识库无相关案例时返回空数组，不造假引用）；非空时真实 RAG 服务必须保证每个引用能映射到本次召回上下文，不允许仅生成格式合法但无法溯源的答案。`requiredParts` 为诊断建议更换的配件列表，`stock` 为当前库存数量，无库存时返回 0；无建议配件时返回空数组。`references[].knowledgeId` 对应知识库条目 ID，前端可通过 `GET /api/rag/knowledge/{knowledgeId}` 获取完整原文；`references[].url` 为该条目的原始来源链接，来自 F09 采集时记录的 sourceUrl。

```json
{
  "queryId": "query-eb2f63bc-c1b1-4690-a086-0d49752d18da",
  "diagnosis": "优先检查蓄电池静态电压、怠速控制通道和火花塞状态。",
  "possibleCauses": [
    {
      "cause": "蓄电池电压偏低",
      "probability": 0.72,
      "solution": "静置后测量电压；低于维修手册阈值时充电并做负载测试。"
    }
  ],
  "requiredParts": [
    {
      "partId": "part-battery-ytz10s",
      "name": "YTZ10S 蓄电池",
      "brand": "Yuasa",
      "stock": 3
    },
    {
      "partId": "part-spark-cr8e",
      "name": "CR8E 火花塞",
      "brand": "NGK",
      "stock": 12
    }
  ],
  "references": [
    {
      "knowledgeId": "kn-manual-ninja400-fuel",
      "title": "Ninja 400 服务手册：燃油系统",
      "sourceType": "manual",
      "excerpt": "冷启动异常应先确认电池状态，再检查怠速控制与点火系统。",
      "url": "https://example.com/manuals/ninja400/fuel-system#cold-start"
    }
  ]
}
```

错误：

| HTTP | code                       | 条件                 |
| ---- | -------------------------- | -------------------- |
| 400  | `SYMPTOM_REQUIRED`         | `symptom` 缺失或为空 |
| 400  | `INVALID_MOTORCYCLE_MODEL` | 车型不是字符串       |
| 400  | `INVALID_MILEAGE`          | 里程不是非负数       |
| 500  | `RAG_DIAGNOSIS_ERROR`      | 诊断内部失败         |

### 3.3 获取知识库条目详情

`GET /api/rag/knowledge/{id}`

路径参数 `id: string` 为引用对应的知识条目 ID。

响应：`200 OK`、`KnowledgeEntry`

```json
{
  "id": "fault-001",
  "title": "Ninja 400 服务手册：燃油系统",
  "content": "优先检查蓄电池静态电压、怠速控制通道和火花塞状态。",
  "sourceType": "manual",
  "sourceUrl": "https://example.com/manuals/ninja400/fuel-system#cold-start",
  "models": ["川崎 Ninja 400 2018-2023"],
  "updatedAt": "2026-09-12T09:00:00.000Z"
}
```

错误：`404 KNOWLEDGE_NOT_FOUND`，表示条目不存在。

### 3.4 提交检索结果反馈

`POST /api/rag/feedback`

请求：`FeedbackRequest`

| 字段      | 类型             | 必填 | 规则                   |
| --------- | ---------------- | ---- | ---------------------- |
| `queryId` | `string`         | 是   | 来自配件或故障检索响应 |
| `rating`  | `'up' \| 'down'` | 是   | 点赞或点踩             |
| `comment` | `string`         | 否   | 可选补充说明           |

```json
{
  "queryId": "query-eb2f63bc-c1b1-4690-a086-0d49752d18da",
  "rating": "up",
  "comment": "与实际检查结果一致"
}
```

响应：`201 Created`、`FeedbackResponse`

```json
{
  "success": true
}
```

错误：

| HTTP | code                 | 条件                         |
| ---- | -------------------- | ---------------------------- |
| 400  | `QUERY_ID_REQUIRED`  | `queryId` 缺失或为空         |
| 400  | `INVALID_RATING`     | `rating` 不是 `up/down`      |
| 400  | `INVALID_COMMENT`    | `comment` 不是字符串         |
| 404  | `QUERY_NOT_FOUND`    | `queryId` 在查询日志中不存在 |
| 500  | `RAG_FEEDBACK_ERROR` | 反馈落盘失败                 |

## 4. 共享类型与字段所有权

共享类型统一从 `packages/shared/src/index.ts` 导出，禁止各包复制同名接口。

| 类型                                         | 所有者               | 用途               |
| -------------------------------------------- | -------------------- | ------------------ |
| `Model3D`                                    | 3D 组                | 模型列表和挂载详情 |
| `Part`                                       | RAG 组维护、双方消费 | 配件主数据         |
| `UploadRequest/UploadResponse`               | 3D 组                | 图片上传           |
| `GenerateRequest/GenerateResponse`           | 3D 组                | 模型生成与降级     |
| `SearchRequest/SearchResult/SearchResponse`  | RAG 组               | 配件检索           |
| `FaultDiagnosisRequest/FaultDiagnosisResult` | RAG 组               | 故障诊断           |
| `RequiredPart`                               | RAG 组               | 诊断建议配件       |
| `Reference`                                  | RAG 组               | 证据引用           |

## 5. Mock Server 约定

- 启动：`npm run dev:mock`
- 端口：`3001`
- 上传记录和反馈仅保存在进程内，重启后清空。
- `/api/3d/generate` 固定走预设模型降级并返回 `status: fallback`，不代表真实生成服务结果。
- 模型和缩略图 URL 是前端字段联调用占位地址；本任务不提供 GLB/图片二进制素材。
- Mock 数据不得用于真实维修决策、报价或配件订购。

## 6. 变更记录

| 日期       | 版本      | 变更                                                                                                                                                                                                                                                                                                                                                                                      | 提出人    | 3D 确认             | RAG 确认            |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------- | ------------------- |
| 2026-09-12 | 1.0.0-rc1 | 冻结 8 个 API、共享枚举、错误响应和 Mock 示例                                                                                                                                                                                                                                                                                                                                             | Codex     | 待 `@siguadht` 审核 | 待 `@MN0709` 审核   |
| 2026-09-12 | 1.0.0-rc2 | RAG 组字段补齐：配件检索加 `sourceUrl`、故障诊断加 `requiredParts`、`references` 加 `knowledgeId`；对齐 F09 采集 sourceUrl                                                                                                                                                                                                                                                                | `@MN0709` | 待 `@siguadht` 确认 | —                   |
| 2026-09-12 | 1.0.0-rc3 | **RAG 组长签字确认**：可行性验证完成（`docs/rag-feasibility.md`）——关键词检索 Top-1 受控 5/5；DeepSeek `deepseek-chat` 实测 20/20 结构率 100%、0 降级、延迟 P95=1.63s（≤5s 红线）。附带交付条件：① F12 开发期补车型/类型硬过滤 + 最低分阈值 + 50 条正式测试集；② F13 开发期用真实数据复测延迟并评测诊断合理率（≥70% 待标注数据评测）；③ `possibleCauses` 逐条 `referenceIds` 列为 P1 优化 | `@MN0709` | 待 `@siguadht` 确认 | ✅ 已确认 `@MN0709` |
| 2026-09-13 | 1.0.0-rc5 | **组长拍板修正（对齐 Codex 开工审核）**：① 撤销 404 单码，改回标准 REST——400 参数错误 / 404 资源不存在 / 500 内部失败；② 配件检索响应增加 `thumbnailUrl`（`Part` 同步增加，`SearchResult` 继承）；③ `references` 允许为空（空召回不造假引用）；④ 知识条目增加 `models` 车型打标字段。Mock Server 同步更新                                                                                 | `@MN0709` | 待 `@siguadht` 确认 | ✅ 已确认 `@MN0709` |
