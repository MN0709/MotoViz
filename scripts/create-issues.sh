#!/usr/bin/env bash
set -euo pipefail

# 在当前仓库批量创建 F01-F20；重复执行时按精确标题复用已有 Issue。
repo="${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
project_number="${PROJECT_NUMBER:-}"

ensure_label() {
  gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force >/dev/null
}

ensure_label "3D 渲染" "7B2CBF" "3D 模型、场景渲染与装配"
ensure_label "RAG 检索" "0E8A16" "知识导入、检索、诊断与引用"
ensure_label "前端" "1D76DB" "Web 页面与跨模块集成"
ensure_label "文档" "0075CA" "项目规范与接口文档"
ensure_label "bug" "D73A4A" "缺陷修复"
ensure_label "P0" "B60205" "Demo 必须完成"
ensure_label "P1" "FBCA04" "P0 完成后按需实现"

ensure_milestone() {
  local title="$1" description="$2"
  local found
  found="$(gh api --paginate "repos/$repo/milestones?state=all&per_page=100" --jq ".[] | select(.title == \"$title\") | .number" | head -n 1)"
  if [[ -z "$found" ]]; then
    gh api --method POST "repos/$repo/milestones" -f title="$title" -f description="$description" >/dev/null
  fi
}

ensure_milestone "第一阶段 Day1-5" "搭建 + 接口约定 + 各自开发"
ensure_milestone "第二阶段 Day6-10" "联调 + 打磨 + Demo 彩排 + 演示"

declare -A issue_numbers

create_issue() {
  local key="$1" title="$2" group="$3" priority="$4" milestone="$5" hours="$6" dependencies="$7" description="$8" acceptance="$9" technical="${10}"
  local dependency_text="无"
  if [[ "$dependencies" != "-" ]]; then
    dependency_text=""
    IFS=',' read -ra dependency_keys <<< "$dependencies"
    for dependency_key in "${dependency_keys[@]}"; do
      dependency_text+="#${issue_numbers[$dependency_key]} "
    done
  fi

  local body_file
  body_file="$(mktemp)"
  {
    printf '## 任务描述\n\n%s\n\n' "$description"
    printf '## 验收标准\n\n%s\n\n' "$acceptance"
    printf '## 技术要点\n\n%s\n\n' "$technical"
    printf '## 预计工时\n\n%s\n\n' "$hours"
    printf '## 依赖 Issue\n\n%s\n' "$dependency_text"
  } > "$body_file"

  local existing url number
  existing="$(gh issue list --repo "$repo" --state all --limit 200 --json number,title,url --jq ".[] | select(.title == \"$title\") | [.number,.url] | @tsv" | head -n 1)"
  if [[ -n "$existing" ]]; then
    number="${existing%%$'\t'*}"
    url="${existing#*$'\t'}"
  else
    url="$(gh issue create --repo "$repo" --title "$title" --body-file "$body_file" --label "$group" --label "$priority" --milestone "$milestone")"
    number="${url##*/}"
  fi
  rm -f "$body_file"
  issue_numbers[$key]="$number"
  printf '%s\t#%s\t%s\n' "$key" "$number" "$url"

  if [[ -n "$project_number" ]]; then
    gh project item-add "$project_number" --owner "${repo%%/*}" --url "$url" >/dev/null
  fi
}

create_issue F01 "[feat] 公共 - 项目脚手架与 Monorepo 初始化" "文档" P0 "第一阶段 Day1-5" "12h" - \
  "建立全 TypeScript npm workspaces 骨架、质量检查与协作规范，让 8 人可并行开工。" \
  $'- [ ] `npm install` 成功\n- [ ] lint、typecheck、build 全部通过\n- [ ] CI、Issue/PR 模板、CODEOWNERS 和 README 齐全' \
  "保持轻量；共享配置由子包继承；不实现 3D/RAG 功能。"

create_issue F02 "[feat] 3D - 开源方案调研选型与 Demo 跑通" "3D 渲染" P0 "第一阶段 Day1-5" "32h" F01 \
  "调研拍照转 3D 候选方案，跑通首选 Demo，并冻结与实际能力一致的服务输入输出。" \
  $'- [ ] 核实候选方案并补充 1-2 个新方案\n- [ ] 用 3 张真实配件照片跑通首选方案\n- [ ] 记录质量、耗时、硬件与许可证结论\n- [ ] D2 前确定方案；不可行则明确启用 F08' \
  "AI 能力通过 HTTP API 集成；同时验证 GLB 输出、尺寸元数据和降级边界。"

create_issue F03 "[feat] 3D - 配件图片上传与预处理" "3D 渲染" P0 "第一阶段 Day1-5" "16h" F01 \
  "支持 1-4 张 JPG/PNG 配件图片上传、校验、方向修正与预处理状态记录。" \
  $'- [ ] 上传 4 张共 20MB 图片，3 秒内返回 uploadId\n- [ ] 非法格式 100% 拦截并给出中文提示' \
  "使用 multipart/form-data；限制数量和单张体积；中断可重试，预处理失败保留原图。"

create_issue F04 "[feat] 3D - 拍照转 3D 模型生成服务" "3D 渲染" P0 "第一阶段 Day1-5" "40h" F02,F03 \
  "封装选定的开源 3D 生成能力，返回异步任务与 GLB；失败或超时时切换预设模型。" \
  $'- [ ] 上传一张排气照片，60 秒内生成 GLB 并可加载，或降级模式即时加载预设模型\n- [ ] 模型比例与实车场景一致，无明显穿模' \
  "通过 HTTP API 调用外部能力；120 秒超时；返回 jobId、状态、模型 URL、顶点数和包围盒。"

create_issue F05 "[feat] 3D - 3D 场景渲染与交互" "3D 渲染" P0 "第一阶段 Day1-5" "32h" F01 \
  "加载车型与配件 GLB，支持旋转、缩放、平移、PBR 材质、基础光照和加载反馈。" \
  $'- [ ] 1080p Chrome 下帧率 ≥ 30fps\n- [ ] 车型 + 3 个配件加载 ≤ 5 秒' \
  "建议 React Three Fiber/Three.js；低性能设备降画质；WebGL 不可用时展示降级页。"

create_issue F06 "[feat] 3D - 车型适配与配件挂载" "3D 渲染" P0 "第一阶段 Day1-5" "28h" F05 \
  "按车型和配件类型读取挂载点，自动装配并支持有限范围的位置、旋转、缩放微调与保存。" \
  $'- [ ] 选择车型 + 配件后自动出现在正确位置，无悬浮穿模\n- [ ] 微调后保存并重新打开，状态一致' \
  "挂载位冲突需提示替换；位移限制 ±0.5m、旋转限制 ±45°；无配置时放展示位。"

create_issue F07 "[feat] 3D - 改装前后对比视图" "3D 渲染" P1 "第二阶段 Day6-10" "12h" F05 \
  "提供改装前后分屏同步相机，性能不足时降级为单场景切换。" \
  $'- [ ] 拖动一侧视角时两侧相机同步\n- [ ] 对比切换响应 ≤ 200ms' \
  "仅在 P0 全部验收且剩余人力充足时启动。"

create_issue F08 "[feat] 3D - 预设配件 3D 模型库降级方案" "3D 渲染" P0 "第一阶段 Day1-5" "16h" F05 \
  "准备 3D 生成不可用时的现场演示保底模型库和配置开关。" \
  $'- [ ] 准备 5-8 个预设配件模型（排气、风挡、边箱等）\n- [ ] 可按类型匹配\n- [ ] 支持手动调整位置、旋转、缩放' \
  "使用 `3D_MODE=generated|preset`；确认模型许可证与资源体积。"

create_issue F09 "[feat] RAG - 初始数据采集与整理" "RAG 检索" P0 "第一阶段 Day1-5" "32h" - \
  "整理配件 CSV、维修手册 PDF 和故障案例，输出逐条可追踪的导入报告。" \
  $'- [ ] 导入 500 条配件 CSV ≤ 30 秒\n- [ ] 30 份 PDF 全部解析入队列\n- [ ] 所有失败条目均记录原因' \
  "必填字段缺失拒绝单条；按品牌 + 型号 + 适配车型去重；失败不得阻断批次。"

create_issue F10 "[feat] RAG - 文档解析与清洗分块" "RAG 检索" P0 "第一阶段 Day1-5" "28h" F09 \
  "解析维修资料，按章节或案例分块，并保留来源、页码、章节、车型、类目元数据。" \
  $'- [ ] 随机抽 20 个分块，文本完整无乱码率 ≥ 95%\n- [ ] 每块元数据齐全' \
  "建议 300-500 token、重叠 50 token；扫描件走外部 OCR API，低置信度标记并降权。"

create_issue F11 "[feat] RAG - 向量化与索引构建" "RAG 检索" P0 "第一阶段 Day1-5" "20h" F10 \
  "通过 HTTP Embedding API 构建向量与关键词混合索引，并支持增量更新。" \
  $'- [ ] 全量索引构建 ≤ 10 分钟\n- [ ] 新增文档支持增量更新，不重建全量索引' \
  "不得在本地运行 Python 模型；服务不可用时降级到关键词检索并提示。"

create_issue F12 "[feat] RAG - 配件匹配检索 API" "RAG 检索" P0 "第一阶段 Day1-5" "28h" F11 \
  "车型归一化后先做结构化兼容过滤，再做语义排序，返回配件、库存、价格与依据。" \
  $'- [ ] 50 条测试查询 Top-5 命中率 ≥ 80%\n- [ ] 响应 ≤ 3 秒' \
  "精确匹配优先；语义结果须标待人工确认；无法归一化时返回相似车型。"

create_issue F13 "[feat] RAG - 故障诊断检索 API" "RAG 检索" P0 "第一阶段 Day1-5" "28h" F11 \
  "检索故障案例和手册证据，通过 LLM HTTP API 生成结构化原因、步骤和所需配件。" \
  $'- [ ] 20 条故障描述诊断合理率 ≥ 70%\n- [ ] 每条结论 100% 带引用\n- [ ] 响应 ≤ 5 秒' \
  "模型只能依据召回证据；无证据明确返回不足；LLM 超时展示召回原文。"

create_issue F14 "[feat] RAG - 检索结果引用溯源" "RAG 检索" P0 "第一阶段 Day1-5" "12h" F12,F13 \
  "让诊断和匹配结论关联原始文档、页码与原文片段，并支持前端展开。" \
  $'- [ ] 所有 AI 结论都有可点击引用\n- [ ] 点击后 200ms 内展开原文片段' \
  "引用 chunk 删除时显示来源失效；服务端必须验证结论引用指向有效证据。"

create_issue F15 "[feat] RAG - 检索质量评估脚本与测试集" "RAG 检索" P1 "第二阶段 Day6-10" "12h" F12,F13 \
  "建立固定测试集和可复现评估脚本，输出检索命中率、诊断合理率和响应耗时。" \
  $'- [ ] 固定 50 条配件查询与 20 条故障描述测试集\n- [ ] 自动输出 Top-5 命中率、引用覆盖率与延迟统计\n- [ ] 结果可在同一数据版本上复现' \
  "指标计算由确定性代码完成；仅在 P0 通过后启动。"

create_issue F16 "[feat] 前端 - 知识库管理页简化版" "前端" P1 "第二阶段 Day6-10" "12h" F09 \
  "展示文档名称、类型、分块数、导入时间，并提供上传和删除入口。" \
  $'- [ ] 文档列表字段完整\n- [ ] 可上传并看到处理状态\n- [ ] 删除前二次确认，结果与列表一致' \
  "MVP 不做权限体系；仅在 P0 通过后启动。"

create_issue F17 "[feat] 前端 - 首页与导航" "前端" P0 "第一阶段 Day1-5" "8h" F01 \
  "提供改装展示、故障诊断、配件查询三个入口和最近使用区域。" \
  $'- [ ] 首屏加载 ≤ 2 秒\n- [ ] 平板横屏布局正常' \
  "优先确保现场演示路径清晰；避免引入非必要 UI 依赖。"

create_issue F18 "[feat] 前端 - 3D 展示页集成" "前端" P0 "第一阶段 Day1-5" "20h" F05,F06 \
  "整合车型/配件选择、图片上传、3D 画布和 RAG 配件信息面板。" \
  $'- [ ] 完整走通 3D 展示流程无报错' \
  "先接 F20 Mock，D6 再替换真接口；保留 3D 降级模式入口。"

create_issue F19 "[feat] 前端 - 检索对话页集成" "前端" P0 "第一阶段 Day1-5" "20h" F12,F13 \
  "实现故障诊断与配件查询模式切换、流式结果占位和引用展开。" \
  $'- [ ] 完整走通故障诊断流程\n- [ ] 完整走通配件查询流程' \
  "先接 F20 Mock；结果类型直接复用 shared；引用失效需有明确状态。"

create_issue F20 "[feat] 文档 - 接口约定与 Mock Server" "文档" P0 "第一阶段 Day1-5" "8h" - \
  "两组在 Day1 冻结跨模块接口、共享类型、错误码和 Mock 响应，支撑并行开发。" \
  $'- [ ] 3D 组 4 个 API 定义完成\n- [ ] RAG 组 4 个 API 定义完成\n- [ ] Mock Server 可返回模拟数据' \
  "以 `docs/api-contract.md` 和 `@motorcycle-ai/shared` 为单一事实来源；变更必须记录并由两组确认。"
