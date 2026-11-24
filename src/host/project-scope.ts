/**
 * 提示词当前项目解析。
 *
 * 与技能导出不同，这里只允许使用目标会话自己的 cwd：
 * 识别不到时返回 null，绝不借用其他会话路径，避免提示词归错项目。
 */
import type { PromptProject } from "../types.js";
import { getCurrentSessionScope } from "./session-prompts.js";
import { getActiveSessionCwd, listSessionRecords } from "./session-scope.js";
import { normalizePromptProjectPath } from "./project-paths.js";

const SESSION_QUERY_TIMEOUT_MS = 3000;

/** 给宿主会话查询增加超时，避免前端一直停留在项目识别中。 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

/**
 * 解析指定会话的项目；未传 sessionId 时使用宿主最近组装的会话 scope。
 * 内存记录优先，会话查询仅匹配同一个 sessionId。
 */
export async function resolveCurrentPromptProject(sessionId?: string): Promise<PromptProject | null> {
  const targetSessionId = sessionId?.trim() || getCurrentSessionScope() || "";
  if (!targetSessionId) return null;
  const activeCwd = getActiveSessionCwd(targetSessionId);
  if (activeCwd) return normalizePromptProjectPath(activeCwd);
  try {
    const records = await withTimeout(listSessionRecords(), SESSION_QUERY_TIMEOUT_MS);
    const cwd = records.find((record) => record.id === targetSessionId)?.cwd;
    return cwd ? normalizePromptProjectPath(cwd) : null;
  } catch {
    return null;
  }
}
