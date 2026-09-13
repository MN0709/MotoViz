import type { Part, RequiredPart } from '@motorcycle-ai/shared';

/**
 * 配件绑定器
 *
 * 职责：校验AI返回的配件推荐，防止AI编造不存在的配件型号。
 *
 * 产品规则（RAG组长拍板）：
 * - AI返回的每个partId必须在配件库中真实存在，否则判为非法并降级
 * - 用配件库中的真实数据替换AI返回的数据（name/brand/price），防止AI编造
 * - 如果用户指定了车型，只返回适配该车型的配件
 * - stock固定为0，AI不能生成库存数字
 *
 * 为什么这么设计：
 * - 大组长实测发现"编造配件也能通过"——AI随便编一个型号，只要stock=0就能过校验
 * - 加了partId校验后，AI编的型号在配件库里找不到，就会被判为非法并降级
 */

export interface BindPartsResult {
  /** 校验通过的配件列表 */
  parts: RequiredPart[];
  /** 是否有非法配件（partId不存在） */
  hasInvalidPart: boolean;
}

/**
 * 校验并绑定AI返回的配件推荐。
 *
 * @param aiParts AI返回的requiredParts草稿
 * @param partsCatalog 配件库（从CSV加载的真实配件数据）
 * @param motorcycleModel 用户指定的车型（可选），如果指定了只返回适配该车型的配件
 * @returns 校验后的配件列表 + 是否有非法配件
 */
export function bindRequiredParts(
  aiParts: readonly { partId?: unknown; name?: unknown; brand?: unknown }[],
  partsCatalog: readonly Part[],
  motorcycleModel?: string,
): BindPartsResult {
  const parts: RequiredPart[] = [];
  let hasInvalidPart = false;

  // 建立partId→配件的映射，方便查找
  const partsById = new Map<string, Part>();
  for (const part of partsCatalog) {
    partsById.set(part.partId, part);
  }

  for (const aiPart of aiParts) {
    // partId必须是字符串且非空
    if (typeof aiPart.partId !== 'string' || !aiPart.partId.trim()) {
      hasInvalidPart = true;
      continue;
    }

    // partId必须在配件库中存在
    const realPart = partsById.get(aiPart.partId);
    if (!realPart) {
      hasInvalidPart = true;
      continue;
    }

    // 如果用户指定了车型，检查配件是否适配该车型
    if (motorcycleModel && motorcycleModel.trim()) {
      const isFit = realPart.fitModels.some((fitModel) =>
        fitModel.toLowerCase().includes(motorcycleModel.trim().toLowerCase()),
      );
      if (!isFit) {
        // 车型不匹配，跳过这个配件（不判为非法，只是不推荐）
        continue;
      }
    }

    // 用配件库中的真实数据替换AI返回的数据
    parts.push({
      partId: realPart.partId,
      name: realPart.name,
      brand: realPart.brand,
      stock: 0, // stock固定为0，AI不能生成库存数字
    });
  }

  return { parts, hasInvalidPart };
}
