# PDF 文档解析选型与 Demo

## 结论

首选并固定使用 `unpdf@1.7.0`。它基于 Mozilla PDF.js，提供适合 TypeScript/ESM 的高层文本抽取 API，并在 Node 环境自动配置标准字体与 CJK CMap；本项目不需要为纯文本抽取安装原生 Canvas。备选 `pdfjs-dist`，理由是它由 Mozilla 官方维护、控制粒度最高，但需要自行实现逐页文本拼接及字体映射配置。

版本固定的原因：`unpdf@1.8.1` 已声明要求 Node.js 22 以上，而本仓库支持 Node.js 20 且 CI 使用 Node.js 20。`1.7.0` 未提高 Node 引擎下限，并包含 Node CJK 字体映射修复；不能使用 `^1.7.0`，否则安装时可能自动升级到不兼容的 `1.8.x`。

> 范围说明：本 Demo 处理带文本层的 PDF，不包含 OCR。扫描图片型 PDF 需要后续单独接入 OCR 服务。

## 候选对比

| 方案                                                     | 优点                                                                                     | 本项目结论                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`unpdf`](https://github.com/unjs/unpdf)                 | TypeScript 类型完整，高层 `extractText` API 简洁；底层使用 PDF.js；Node CJK 配置由库处理 | 采用 `1.7.0` 并精确锁定。与 Node 20+、ESM Monorepo 匹配，接入代码少                          |
| [`pdfjs-dist`](https://github.com/mozilla/pdf.js)        | Mozilla 官方发行，维护活跃，可直接控制逐页内容和布局信息                                 | 首选备选。可靠但 API 更底层，需要额外处理拼接和 CMap                                         |
| [`pdf-parse`](https://github.com/mehmet-kozan/pdf-parse) | 新版为 TypeScript，`getText()` 上手简单                                                  | 暂不采用。当前项目本机为 Node 24，公开问题中存在 Node 24 兼容性风险，且新版 API 仍在快速演进 |

相关维护证据：[`unpdf` releases](https://github.com/unjs/unpdf/releases)、[`pdf-parse` Node 24 issue](https://github.com/mehmet-kozan/pdf-parse/issues/119)。

## Demo 用法

在仓库根目录运行：

```bash
npm run demo:pdf
```

默认解析两份中文样例：

- `packages/rag-engine/fixtures/chinese-maintenance-guide.pdf`
- `packages/rag-engine/fixtures/chinese-parts-catalog.pdf`

也可以传入自己的文件：

```bash
npm run demo:pdf -- /absolute/path/to/document.pdf
```

Demo 会输出页数、字符数和完整文本，并在文本为空、出现 Unicode 替换字符或默认样例缺少预期中文关键词时返回失败状态。解析结果同时保留逐页文本和页码，供后续章节分块及引用溯源使用。

## 本机验证记录

- 运行环境：Node.js 24.20.0、npm 11.19.0
- 样例 PDF：2 份，均为 A4 单页并嵌入中文字体
- 视觉核验：两份 PDF 经 Poppler 渲染后，中文、数字和表格均清晰，无缺字或方框
- 文本核验：执行 `npm run demo:pdf` 与 `npm test --workspace=@motorcycle-ai/rag-engine`；实际结果以提交前最新一次命令输出为准

## 与 Issue #10 的边界

本提交完成解析器选型、中文 PDF 文本抽取、逐页结果和 Demo 验证，是 Issue #10 的解析前置成果。Issue 原定义中的章节/案例分块、车型和类目元数据，以及随机抽检 20 块的完整验收仍需后续实现，因此本提交不关闭 Issue #10。
