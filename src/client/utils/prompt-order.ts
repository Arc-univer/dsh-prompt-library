/**
 * 客户端提示词顺序工具。
 *
 * 智能列表按宿主同一套规则在前端重算；手动列表只比较 sortOrder。
 * 拖拽当前筛选结果时，将可见条目的新顺序填回完整顺序的可见槽位，
 * 从而保留其它项目隐藏条目的相对位置。
 */
import type { Prompt, PromptSortMode } from "../../types.js";

/** 与宿主智能排序一致的新鲜度窗口：7 天。 */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** 前端重算智能顺序，保证手动模式切回后立即恢复，不依赖重新请求。 */
function sortPromptsSmart(prompts: Prompt[]): Prompt[] {
  const now = Date.now();
  const fresh = prompts
    .filter((prompt) => now - prompt.createdAt < FRESH_MS)
    .sort((a, b) => b.createdAt - a.createdAt);
  const freshIds = new Set(fresh.map((prompt) => prompt.id));
  const rest = prompts.filter((prompt) => !freshIds.has(prompt.id));
  const byUsage = [...rest].sort(
    (a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt,
  );
  const topUsed = byUsage.slice(0, 3);
  const topUsedIds = new Set(topUsed.map((prompt) => prompt.id));
  const others = rest
    .filter((prompt) => !topUsedIds.has(prompt.id))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.usageCount - a.usageCount);
  return [...fresh, ...topUsed, ...others];
}

/** 按当前模式返回新数组，不修改原列表。 */
export function sortPromptsForMode(prompts: Prompt[], mode: PromptSortMode): Prompt[] {
  if (mode === "smart") return sortPromptsSmart(prompts);
  return [...prompts].sort(
    (a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  );
}

/** 把 sourceId 移到 targetId 处：向下移动落在目标后，向上移动落在目标前。 */
export function movePromptToTarget(prompts: Prompt[], sourceId: string, targetId: string): Prompt[] {
  if (sourceId === targetId) return [...prompts];
  const sourceIndex = prompts.findIndex((prompt) => prompt.id === sourceId);
  const targetIndex = prompts.findIndex((prompt) => prompt.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return [...prompts];
  const source = prompts[sourceIndex]!;
  const remaining = prompts.filter((prompt) => prompt.id !== sourceId);
  const remainingTargetIndex = remaining.findIndex((prompt) => prompt.id === targetId);
  const insertIndex = remainingTargetIndex + (sourceIndex < targetIndex ? 1 : 0);
  remaining.splice(insertIndex, 0, source);
  return remaining;
}

/** 用当前可见条目的拖拽结果更新完整手动顺序，隐藏条目保持原相对位置。 */
export function mergeVisiblePromptOrder(allPrompts: Prompt[], reorderedVisible: Prompt[]): Prompt[] {
  const complete = sortPromptsForMode(allPrompts, "manual");
  const visibleIds = new Set(reorderedVisible.map((prompt) => prompt.id));
  let nextVisibleIndex = 0;
  return complete.map((prompt) =>
    visibleIds.has(prompt.id) ? reorderedVisible[nextVisibleIndex++]! : prompt,
  );
}
