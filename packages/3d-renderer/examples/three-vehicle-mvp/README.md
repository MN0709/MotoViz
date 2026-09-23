# MotoViz 三车型改装交互 MVP

## 已经打通

- 一个页面切换三款车型：川崎 Ninja ZX-25R（年款待核）、Aprilia RS 660 2021、Aprilia RSV4 R 2010。
- 所有车型通过同一个 `vehicles.json` 注册，不在前端代码里写三套业务逻辑。
- 统一使用 `vehicleId + templateVersion + slotKey` 定位改装位置。
- 车型切换时会清理上一车型的展开、改色、贴膜和替换件状态。
- 可替换槽位支持导入本地 GLB、包围盒粗对齐、位置/大小/方向校准和恢复原件。
- 轮组被明确标为“仅展示”，页面会禁用换件入口。
- 支持旋转、缩放、选中、显隐、单独查看、爆炸展开、改色和贴膜预览。

## 主要文件

- `vehicles.json`：三车型注册表、槽位、稳定编号、挂点占位和替换边界。
- `interface-draft.ts`：交给前端和共享类型负责人审核的接口草案；未冻结前不能复制进 `packages/shared`。
- `vehicle-slot-matrix.csv`：车型与部件位置对照表。
- `validate_registry.py`：检查 GLB、车型编号、槽位编号及节点是否真实存在。
- `registry-check.json`：注册表自动检查结果。
- `qa-report.json`：浏览器验收结果和仍未完成的事项。

## 启动

双击 `启动三车型演示.command`，或在当前目录运行：

```bash
python3 launch.py
```

终端会显示本次演示地址。

## 前端接入边界

前端负责车型选择器、配件列表和业务页面。3D 模块负责读取注册表、加载对应 GLB、按 `slotKey` 找到原车部件、替换/恢复模型并维护场景状态。前端不应直接依赖 GLB 内部 mesh 名称。

推荐换件指令：

```ts
{
  vehicleId,
  templateVersion,
  slotKey,
  assetId,
  modelUrl,
  transform
}
```

## 当前没有完成与合并条件

- 没有把接口草案写入 `packages/shared`，因为这是跨组共享类型变更，必须先由 @MN0709 双向确认。
- 三份演示 GLB 已随本 Draft PR 上传供团队验收；原始商品页和公开再分发授权仍未核验，合并前必须由产品负责人决定是否保留，详见 `ASSET-PROVENANCE.md`。
- 川崎模板尚未校准为真实米制，注册表明确标为 `uncalibrated`。
- 当前挂点是可运行的默认占位；真实改装件到位后仍需逐件记录校准矩阵。
- RSV4 R 的主坐垫无法安全独立抽离，没有为了凑槽位而切碎模型。


## 对应任务

本目录用于 Issue #6 的三车型切换、统一槽位和换件接口纵向验证。当前没有改动 `packages/shared` 或 `/api/3d/*`，`interface-draft.ts` 只是待 @MN0709 评审的本地草案。
