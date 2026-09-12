# F02 图片转 3D 方案验证记录

> 状态：阶段性验证，尚未完成选型验收。日期：2026-09-12。
>
> 本项目只通过 HTTP 调用外部 AI 服务；下列开源模型的 Python 推理代码不进入 Monorepo。

## 候选方案

| 方案 | 官方证据 | 优点 | 当前限制与许可证结论 |
| --- | --- | --- | --- |
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) | [README](https://github.com/VAST-AI-Research/TripoSR#readme)、[MIT 许可证](https://github.com/VAST-AI-Research/TripoSR/blob/main/LICENSE)、[运行参数](https://github.com/VAST-AI-Research/TripoSR/blob/main/run.py) | 单张图片、约 6 GB 显存；模型与代码声明为 MIT；可输出 GLB；官方公开 Gradio 演示有 HTTP 端点 | 官方演示不是有 SLA 的生产服务。下表实测 3/3 产生有效 GLB，但从上传到文件下载均超过 #4 的 60 秒目标；真实质量和实车比例仍需确认。 |
| [Stable Fast 3D](https://github.com/Stability-AI/stable-fast-3d) | [README](https://github.com/Stability-AI/stable-fast-3d#readme)、[社区许可证](https://github.com/Stability-AI/stable-fast-3d/blob/main/LICENSE.md) | 单图直接输出 GLB，官方说明默认约 6 GB 显存；提供背景处理与 UV 纹理 | 权重访问受限；商业使用有注册及收入门槛等许可条件；Mac MPS 支持仍属实验性。公开演示配置可访问，但本次直接 HTTP 调用两次均返回 `404: Session not found`，未取得生成结果。 |
| [TRELLIS](https://github.com/microsoft/TRELLIS) | [README](https://github.com/microsoft/TRELLIS#readme)、[许可证](https://github.com/microsoft/TRELLIS/blob/main/LICENSE) | 单图/实验性多图，官方示例可提取 GLB；主模型和多数代码为 MIT | 官方要求 Linux 和至少 16 GB NVIDIA 显存，部分子模块有独立许可证；部署成本较高。本次公开演示健康检查返回 503，未跑通真实输入。 |
| [Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) | [中文 README](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/README_zh_cn.md)、[社区许可证](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE) | 官方自托管 API Server 有 `/generate`，示例直接返回 GLB；几何和纹理分阶段 | 使用受专门社区许可证和地域条件限制，不能当成 MIT；目前没有可用的外部部署地址与三图实测。 |

这些是模型项目的能力和本次实测结果，不等于任意第三方托管服务的许可证或服务承诺。若采用外部供应商，还需单独核查其 API 条款、数据保留、计费和速率限制。

## 测试输入与授权

团队当前没有自有且可上传到外部服务的配件照片。组长同意先用下列公开授权的真实照片测试，全部仅放在本机临时目录，未提交原图或生成模型：

| 输入 | 来源与作者 | 许可 | 预期难点 |
| --- | --- | --- | --- |
| 排气特写 | [Wikimedia Commons：Akrapovič exhaust closeup](https://commons.wikimedia.org/wiki/File:Akrapovi%C4%8D_exhaust_closeup.jpg)，Ian Sherlock / Dbratland | CC BY-SA 2.0 | 排气与整车零件相连，背景剥离和轮廓边界容易出错 |
| 拆下的双边箱 | [Wikimedia Commons：Panniers 5467](https://commons.wikimedia.org/wiki/File:Panniers_5467.jpg)，Ashley Pomeroy | CC BY-SA 4.0 | 两个物体与遮挡区域，单图背面只能推断 |
| 透明风挡 | [Wikimedia Commons：Beiwagen-Windschutzscheibe](https://commons.wikimedia.org/wiki/File:Beiwagen-Windschutzscheibe.JPG)，Mattes | 作者释入公有领域 | 透明材质、反光和侧车背景；并非本项目预期车型的风挡 |

输入被缩至约 768 像素供公开演示使用；该输入处理可能降低细节，不能把结果外推到原始照片。含品牌标志的排气照片仅用于技术测评，生成产物不作为可发布的品牌模型素材。

## TripoSR 官方演示 HTTP 烟测

命令（文件路径为本机临时文件，生成结果默认写入系统临时目录）：

```bash
node scripts/evaluate-image-to-3d.mjs /tmp/motofit-exhaust-commons.jpg /tmp/motofit-panniers-commons.jpg /tmp/motofit-windshield-commons.jpg
```

脚本对每张图片调用公开演示的上传、预处理、生成、GLB 下载端点，并检查 GLB v2 文件头、JSON 块、网格、顶点和 `POSITION` 包围盒。它没有运行本地 AI，也没有把图片或模型写入仓库。

| 输入 | GLB 字节 | 顶点 | 模型包围盒尺寸（模型单位） | 上传 / 预处理 / 生成 / 下载 | 端到端 |
| --- | ---: | ---: | --- | --- | ---: |
| 排气 | 2,066,964 | 51,694 | 0.978 × 0.940 × 0.472 | 1.4 / 2.9 / 4.6 / 162.6 秒 | **171.4 秒** |
| 边箱 | 1,944,592 | 48,636 | 0.881 × 0.632 × 0.543 | 3.9 / 1.3 / 5.1 / 105.6 秒 | **115.8 秒** |
| 风挡 | 2,395,288 | 59,916 | 1.036 × 0.933 × 0.482 | 2.2 / 0.6 / 3.6 / 147.8 秒 | **154.2 秒** |

三份文件的 GLB 头和几何元数据均有效。这里的“生成”是公开演示报告的请求等待时间，不代表可复用的推理性能；“下载”包含当前网络路径的波动。模型包围盒没有实物标尺，**不能证明实车比例正确**。浏览器外观检查尚未完成，因此也不能据此声称无穿模或质量达标。

Stable Fast 3D 的 `/info` 能提供 `/run_button` 参数说明，图片上传也返回了临时路径，但带或不带 `session_hash` 调用运行端点都在事件流中返回 `404: Session not found`。这只证明当前匿名、直接 HTTP 调用方式不可用；不能据此断言模型本身生成失败。若要选它，需在独立部署或受支持的客户端/账号下重新验证。

## Day 2 决策门槛

1. 在浏览器中加载三份 GLB，按轮廓、背景污染、透明件、纹理和背面推断各记录 0–5 分及截图；若浏览器检查未完成，保持“质量未验证”。
2. 用可控的外部 HTTP 部署或供应商端点复测至少一张排气照片，记录完整上传至 GLB 可加载时间。公开演示本次 **0/3 达到 #4 的 60 秒目标**，不能作为正式服务端点。
3. 生成 GLB 即使视觉可用，也要结合真实尺寸或可信参考物校准比例，并在 #6 的车型场景中检查穿模。
4. 若 Day 2 仍没有能满足耗时、质量、许可证和资源条件的服务，明确启用 #8 预设模型作为 MVP 保底；#4 保留生成服务试验，但不把未经验证的能力写成已交付。

目前 TripoSR 是**最容易继续验证的 MIT 候选**，并非已冻结的生产选型。Stable Fast 3D 是第二候选，但启用前须落实权重访问、许可和 HTTP 部署。TRELLIS 的硬件要求不适合当前 10 天 MVP 优先投入；Hunyuan3D-2 的专门许可证需要逐项核对后再选用。
