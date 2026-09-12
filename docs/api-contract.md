# MotoFit AI 接口约定

> 状态：模板；F20 完成后冻结。所有接口使用 JSON（文件上传除外），时间为 ISO 8601，ID 为非空字符串。

## 3D 组 API

| 方法 | 路径 | 用途 | 请求类型 | 响应类型 | 状态 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/3d/uploads` | 上传与预处理图片 | `multipart/form-data` | `UploadResult` | 待定义 |
| POST | `/api/3d/generations` | 创建模型生成任务 | `CreateModelRequest` | `GenerationJob` | 待定义 |
| GET | `/api/3d/generations/:jobId` | 查询生成状态 | Path Params | `GenerationJob` | 待定义 |
| PUT | `/api/3d/scenes/:sceneId` | 保存装配场景状态 | `SceneState` | `SceneState` | 待定义 |

### 3D 错误码模板

| code | HTTP | 含义 | 客户端动作 |
| --- | --- | --- | --- |
| `3D_VALIDATION_ERROR` | 400 | 输入不合法 | 展示字段提示 |
| `3D_GENERATION_TIMEOUT` | 504 | 生成超时 | 切换预设模型 |

## RAG 组 API

| 方法 | 路径 | 用途 | 请求类型 | 响应类型 | 状态 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/rag/parts/search` | 配件匹配 | `SearchRequest` | `SearchResponse` | 待定义 |
| POST | `/api/rag/faults/diagnose` | 故障诊断 | `FaultDiagnosisRequest` | `FaultDiagnosis` | 待定义 |
| POST | `/api/rag/documents` | 导入知识文档 | 待定义 | 待定义 | 待定义 |
| GET | `/api/rag/documents` | 查询知识文档 | Query Params | 待定义 | 待定义 |

### RAG 错误码模板

| code | HTTP | 含义 | 客户端动作 |
| --- | --- | --- | --- |
| `RAG_VALIDATION_ERROR` | 400 | 输入不合法 | 展示字段提示 |
| `RAG_NO_EVIDENCE` | 422 | 无可靠依据 | 提示人工确认 |

## 共享类型

共享类型由 `@motorcycle-ai/shared` 导出，以代码定义为唯一来源。接口冻结时需补充 JSON 示例，并确保前后端不得复制出第二份同名类型。

- `VehicleModel`、`Part`、`MountPoint`、`Model3D`、`SceneState`
- `SearchRequest`、`SearchResponse`、`FaultDiagnosisRequest`、`FaultDiagnosis`
- 统一错误：`{ code: string; message: string; requestId: string }`

## 变更记录

| 日期 | 版本 | 变更 | 提出人 | 3D 确认 | RAG 确认 |
| --- | --- | --- | --- | --- | --- |
| 待填写 | 0.1 | 初始模板 | 待填写 | 待确认 | 待确认 |
