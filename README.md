# 摩装智舱（MotoFit AI）

面向摩托车改装店的 10 天小组实训项目 MVP：通过 3D 改装效果展示改善销售沟通，通过 RAG 配件/故障检索提升查询与诊断效率。

## 团队分工

- 3D 渲染组（4 人）：图片预处理、模型生成/降级、场景渲染、车型挂载。
- RAG 知识组（4 人）：数据导入、分块索引、配件检索、故障诊断与引用。
- 两组共同维护共享类型、接口契约和前端联调。

## 团队成员

| 角色 | 姓名 / GitHub 用户名 |
| --- | --- |
| 3D 组长 | @siguadht |
| 3D 组员 A | @20050202ys-sketch |
| 3D 组员 B | @Freya-Qian |
| 3D 组员 C | @kevin-long26 |
| RAG 组长 | @MN0709 |
| RAG 组员 A | @zooxz7c-cyber |
| RAG 组员 B | @khu016 |
| RAG 组员 C / 前端负责人 | @moronfranklyn-lab |
| 大组长（产品验收） | @moronfranklyn-lab（兼任） |

## 技术栈

- 全 TypeScript Monorepo（npm workspaces）
- 前端：React + Vite
- 服务接口：Express（由功能 Issue 认领后接入）
- AI：仅通过 HTTP API 调用，不在本仓库运行 Python 模型

## 快速开始

要求 Node.js 20+ 与 npm 10+。

```bash
npm install
npm run dev
```

提交前运行：

```bash
npm run lint
npm run typecheck
npm run build
```

## 分支规范

- 从最新 `main` 创建分支，禁止直接推送 `main`。
- 分支格式：`feat/Fxx-short-name`、`fix/Fxx-short-name`、`docs/short-name`。
- 一个分支只处理一个 Issue；提交信息遵循 `feat:`、`fix:`、`docs:`、`chore:`。
- PR 必须关联 Issue，填写验证结果，CI 通过后进入 Review。

## 目录结构

```text
apps/web/              React Demo 页面
packages/shared/       跨组共享类型与工具
packages/3d-renderer/  3D 渲染组工作区
packages/rag-engine/   RAG 知识组工作区
packages/mock-server/  供两组和前端并行联调的 Express Mock API
docs/api-contract.md   两组共同冻结的接口契约
scripts/               GitHub 初始化辅助脚本
```

## 接口约定

所有请求、响应、错误码和共享类型以 [接口约定](docs/api-contract.md) 为准。变更接口前先更新文档，在 PR 中说明影响，并取得受影响组的确认。

前端联调时另开一个终端启动 Mock Server：

```bash
npm run dev:mock
```

## 分级验收规则

- 所有 PR：至少 1 位同组成员 Review，并由大组长 `@moronfranklyn-lab` 做最终产品验收。
- 3D 组 PR：还必须由 3D 组长 `@siguadht` 技术验收，目标合计 3 人批准。
- RAG 组 PR：还必须由 RAG 组长 `@MN0709` 技术验收，目标合计 3 人批准。
- 前端/公共 PR：同组 Review + `@moronfranklyn-lab` 最终验收，目标合计 2 人批准。
- CI 的 lint、typecheck、build 必须全部通过；有“需修改”意见不得合并。
- GitHub 原生单条分支保护只能设置全仓统一批准数，无法按目录动态设置 3/2 人。CODEOWNERS 会自动请求对应负责人；团队必须同时遵守上述流程规则。

## 认领与交付

1. 在项目看板的 Backlog 中选择 Issue，评论“我来认领”，由组长分配 Assignee。
2. 将卡片移到 In Progress，并从 `main` 创建规范命名的分支。
3. 完成后自测、更新接口文档（如涉及），提交 PR 并关联 Issue。
4. 依次完成同组 Review、技术验收（3D/RAG）和产品验收，CI 通过后合并。
