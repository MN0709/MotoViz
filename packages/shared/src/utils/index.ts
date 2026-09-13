/** 对不可变数组按 id 建立只读索引，供两组共享基础逻辑。 */
export function indexById<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export * from './rag-search.js';
