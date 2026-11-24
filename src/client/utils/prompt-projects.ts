/** 客户端项目范围筛选工具。 */
import type { Prompt, PromptProject } from "../../types.js";

/** current=全局+当前项目；global=仅全局；all=全部；project:*=指定项目。 */
export type PromptProjectFilter = "current" | "global" | "all" | `project:${string}`;

/** 按项目范围过滤提示词；未识别当前项目时，current 仍保留全局提示词。 */
export function filterPromptsByProject(
  prompts: Prompt[],
  filter: PromptProjectFilter,
  currentProject: PromptProject | null,
): Prompt[] {
  if (filter === "all") return [...prompts];
  if (filter === "global") return prompts.filter((prompt) => prompt.scope === "global");
  if (filter === "current") {
    return prompts.filter(
      (prompt) =>
        prompt.scope === "global" ||
        (currentProject !== null && prompt.projectKey === currentProject.key),
    );
  }
  const projectKey = filter.slice("project:".length);
  return prompts.filter((prompt) => prompt.scope === "project" && prompt.projectKey === projectKey);
}
