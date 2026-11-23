/**
 * 会话查询提供器与会话工作目录（cwd）登记。
 *
 * DSH 的 sessionQuery 是宿主注入的 Cordis 服务，路由层无法直接访问；
 * 因此本模块维护一个由 apply() 在宿主注入 sessionQuery 后注册的会话列表提供器，
 * 供项目技能导出（按 <cwd>/.dsh/skills 写盘）等场景按会话 id 反查真实工作目录。
 *
 * 同时维护「会话 id → 最近一次系统提示组装时记录的真实 cwd」内存表：
 * 系统提示组装是同步回调，组装端每次从 agent.session.header.cwd 取到真实
 * 工作目录并记录于此（零依赖、瞬时返回），与运行时解析同一来源，
 * 避免 sessionQuery 未注入 / 挂起时拿不到 cwd。
 *
 * 所有会话查询失败均静默降级为空列表，不影响其它功能。
 */

/** 会话查询记录：由宿主服务转成的最小形状（id / title / cwd）。 */
export interface SessionQueryRecord {
  id: string;
  title: string;
  cwd: string | null;
}

/** 当前已注册的会话列表提供器（未注册时为 null → 查询返回空列表）。 */
let sessionProvider: (() => Promise<SessionQueryRecord[]>) | null = null;

/** 注册会话列表提供器（apply() 注入 sessionQuery 后调用）。 */
export function registerSessionListProvider(provider: () => Promise<SessionQueryRecord[]>): void {
  sessionProvider = provider;
}

/** 读取全部会话元信息；无提供器 / 失败时返回空数组。 */
export async function listSessionRecords(): Promise<SessionQueryRecord[]> {
  if (!sessionProvider) return [];
  try {
    return await sessionProvider();
  } catch {
    return [];
  }
}

/** 会话 id → 最近一次系统提示组装时记录的真实 cwd（来自 agent.session.header.cwd）。 */
const activeSessionCwd = new Map<string, string>();

/** 记录某会话最近一次组装时的真实 cwd（组装端每次调用解析时更新）。 */
export function recordActiveSessionCwd(sessionId: string, cwd: string): void {
  if (!sessionId) return;
  if (cwd) activeSessionCwd.set(sessionId, cwd);
}

/** 读取某会话最近一次组装时的真实 cwd；无记录返回空串。 */
export function getActiveSessionCwd(sessionId: string): string {
  return activeSessionCwd.get(sessionId) ?? "";
}
