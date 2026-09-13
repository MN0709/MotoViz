# RAG 知识检索与诊断链路

## 交付范围

本模块将 `packages/rag-engine/src/feasibility/` 中的可行性代码拆分为正式、可测试的诊断链路：

```text
用户症状
  → keyword-index 检索 Top-5
  → Mock 或 HTTP LLM 生成 JSON 草稿
  → 运行时结构校验
  → 服务端校验并回填引用
  → FaultDiagnosisResult
```

- `knowledge-search.ts`：只召回最多 5 条正相关的 `manual` 和 `fault-case`，故障案例排序分乘 `1.2`；不会用零相关资料凑数。
- `prompts.ts`：集成 PR #21 的正式系统提示词、2 轮 few-shot、资料不足/非维修问题安全响应，以及 Top-5 上下文注入。
- `llm-adapter.ts`：`LLM_MODE=mock|http` 双模式；HTTP 使用 `response_format: { "type": "json_object" }` 和最长 4.5 秒的 `AbortController` 超时。
- `validate.ts`：分别校验未信任的 LLM 草稿和最终 `FaultDiagnosisResult`。
- `reference-binder.ts`：模型只能提供 `knowledgeId`；标题、摘要、URL 和来源类型全部由本次 Top-5 上下文回填。
- `part-binder.ts`：模型只能选择上下文 `allowedParts` 中的 `partId`；名称、品牌和库存由服务端可信快照回填。
- `fallback.ts`：超时、非法 JSON、结构错误或伪造引用时整体降级，不返回半份 AI 诊断。
- `diagnosis-engine.ts`：串联检索、生成、验证、引用回填和降级。

## 运行

默认 Mock 模式不会请求外部服务：

```bash
npm run demo:diagnose
npm run test:rag
```

真实 HTTP 模式需要显式配置：

```bash
LLM_MODE=http \
LLM_BASE_URL=https://your-provider.example/v1 \
LLM_API_KEY=your-key \
LLM_MODEL=your-model \
npm run demo:diagnose
```

Demo 自带的故障注入始终使用本地传输替身，不会向 `local.invalid` 发出网络请求。

## 当前验证结果

- 3 条不同症状在 Mock 模式下均返回完整、合法的 `FaultDiagnosisResult`。
- Top-5 只包含维修手册和故障案例，`part-catalog` 被排除。
- HTTP 请求包含 JSON Object 输出约束，超时上限为 4500ms。
- 超时、非法 JSON、伪造 `knowledgeId` 均触发整体降级。
- 降级结果使用固定诊断文案，`possibleCauses=[]`、`requiredParts=[]`，并回填全部 Top-5 资料。
- 按 RC5，资料不足或非维修问题允许空原因和空引用；普通诊断仍必须包含至少一个原因和一个受信引用。
- 知识库无正相关资料时返回正式的“参考资料不足”安全结果和空引用，不会为了满足结构而伪造资料。
- `requiredParts` 仅接受知识上下文显式携带的可信配件 ID，最终字段由服务端回填；未知 ID 会整体降级。

## 数据与验收边界

Demo 中的知识、URL 和诊断内容均为合成工程数据，不能作为真实维修建议。当前结果验证的是代码结构、引用安全和异常韧性，没有验证 Issue #13 要求的 20 条真实故障诊断合理率，也没有交付 Issue #11 的 Embedding API 与增量向量索引。本模块支撑 #11 的关键词基线并解除 #13 的诊断链路前置依赖，但不单独关闭这两个 Issue。

当前实现已同步 feasibility PR #21 的正式 Prompt 与 RC5 接口约定。PR #21 合并后应将本分支同步到最新 `main`，重跑 `test:rag`、`lint`、`typecheck` 和 `build`，再申请技术与产品复审。
