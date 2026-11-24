/**
 * 词库的 HTTP 路由。
 *
 * 一个 `/api/prompt-library` 的 `prefix` 路由分发所有子路径：
 *   GET    /prompts         列表
 *   POST   /prompts         创建
 *   PUT    /prompts/:id     更新
 *   DELETE /prompts/:id     删除
 *
 * 所有响应使用 ApiResponse 信封。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import type { ApiResponse, PluginSettings, Prompt, PromptInput, PromptPatch } from "../types.js";
import { generateDraft, generateIntro, generateSkillDescriptor, listAiSelectables, polishPromptBody, polishPromptBodyWithSummary } from "./ai.js";
import {
  exportPromptsAsSkills,
  importSkillEntries,
  importSkillsFromDisk,
  listAvailableSkills,
  listHarnessSkillToggles,
  listSkillsFromDir,
  parseSkillRaw,
  setHarnessSkillToggle,
  deleteHarnessSkill,
} from "./skills.js";
import {
  createPrompt,
  createTag,
  deletePrompt,
  deleteTag,
  deleteTrash,
  emptyTrash,
  exportPrompts,
  getMetaValue,
  getSettings,
  importPrompts,
  listPrompts,
  listPromptProjects,
  listTags,
  reorderPrompts,
  setMetaValue,
  listTrash,
  recordUsage,
  renameTag,
  restorePrompts,
  updatePrompt,
  updateSettings,
} from "./store.js";
import {
  clearAllSkillBindings,
  clearScopePromptBinding,
  clearSessionBinding,
  createSessionPrompt,
  deleteSessionPrompt,
  getCurrentSessionScope,
  getScopeBoundPromptIds,
  getSessionActivePromptIds,
  listScopePromptBindings,
  listSessionPrompts,
  setScopePromptBinding,
  setSessionActivePrompts,
  setSessionPromptBindingForSession,
  updateSessionPrompt,
} from "./session-prompts.js";
import { getActiveSessionCwd, listSessionRecords } from "./session-scope.js";
import { resolveCurrentPromptProject } from "./project-scope.js";
import { getVersionInfo } from "./update.js";
import { downloadDir } from "./paths.js";

const PREFIX = "/api/prompt-library";

function json<T>(res: ServerResponse, status: number, body: ApiResponse<T>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** 后端导出序列化：与前端 serializeExport 保持一致的输出，供导出写盘使用。 */
function buildExportFile(
  format: string,
  prompts: Prompt[],
): { fileName: string; content: string } | null {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const base = `prompt-library-${stamp}`;
  const csvEscape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  if (format === "json") {
    // JSON 备份格式：有条目有摘要时写入 summary 字段（缺省省略，保持结构简洁）
    return {
      fileName: `${base}.json`,
      content: JSON.stringify(
        {
          version: 2,
          exportedAt: Date.now(),
          prompts: prompts.map((p) => ({
            id: p.id,
            title: p.title,
            body: p.body,
            tags: p.tags,
            ...(p.summary ? { summary: p.summary } : {}),
            scope: p.scope,
            ...(p.projectPath ? { projectPath: p.projectPath } : {}),
            sortOrder: p.sortOrder,
          })),
        },
        null,
        2,
      ),
    };
  }
  if (format === "csv") {
    // CSV：保留摘要、项目归属与手动顺序列，旧版四列 CSV 仍可正常导入。
    const lines = ["title,body,tags,summary,id,scope,projectPath,sortOrder"];
    for (const p of prompts) {
      lines.push(
        `${csvEscape(p.title)},${csvEscape(p.body)},${csvEscape((p.tags ?? []).join("|"))},${csvEscape(p.summary ?? "")},${csvEscape(p.id)},${csvEscape(p.scope)},${csvEscape(p.projectPath ?? "")},${csvEscape(String(p.sortOrder))}`,
      );
    }
    // 前置 UTF-8 BOM（\uFEFF），避免 Excel 打开中文 CSV 时乱码
    return { fileName: `${base}.csv`, content: "\uFEFF" + lines.join("\r\n") };
  }
  if (format === "md") {
    const parts: string[] = [];
    for (const p of prompts) {
      const tagsLine = p.tags && p.tags.length ? `\n\n标签：${p.tags.join("、")}` : "";
      const summaryLine = p.summary?.trim() ? `\n\n摘要：${p.summary.trim()}` : "";
      parts.push(`# ${p.title}${tagsLine}${summaryLine}\n\n${(p.body ?? "").trim()}`);
    }
    return { fileName: `${base}.md`, content: parts.join("\n\n---\n\n") + "\n" };
  }
  if (format === "txt") {
    const parts: string[] = [];
    for (const p of prompts) {
      const tagsLine = p.tags && p.tags.length ? `\n\n标签：${p.tags.join("、")}` : "";
      const summaryLine = p.summary?.trim() ? `\n\n摘要：${p.summary.trim()}` : "";
      parts.push(`【${p.title}】${tagsLine}${summaryLine}\n\n${(p.body ?? "").trim()}`);
    }
    return { fileName: `${base}.txt`, content: parts.join("\n\n" + "-".repeat(24) + "\n\n") };
  }
  return null;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const CAP = 1 << 20; // 1 MiB 上限；提示词是短文本。
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > CAP) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** 将 `req.url` 拆分为路径段（相对于 PREFIX）。 */
function parseTail(url: string | undefined): { tail: string; segments: string[] } {
  const full = url ?? "";
  const pathname = full.split("?", 1)[0] ?? "";
  const tail = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) : pathname;
  const segments = tail.split("/").filter(Boolean);
  return { tail, segments };
}

function isInput(value: unknown): value is PromptInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromptInput).title === "string" &&
    typeof (value as PromptInput).body === "string"
  );
}

function isPatch(value: unknown): value is PromptPatch {
  return typeof value === "object" && value !== null;
}

/** 是否为可入库/可写盘的技能条目（title/body 必填，name/summary/promptId 可选）。 */
function isSkillEntry(
  value: unknown,
): value is { title: string; body: string; name?: string; summary?: string; promptId?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string" &&
    typeof (value as { body?: unknown }).body === "string"
  );
}

/** 从请求体中提取字符串数组（{ ids: string[] }、{ promptIds: string[] } 或直接数组）。 */
function extractIds(body: unknown): string[] {
  const obj =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const list = obj
    ? Array.isArray(obj.promptIds)
      ? obj.promptIds
      : Array.isArray(obj.ids)
        ? obj.ids
        : []
    : Array.isArray(body)
      ? body
      : [];
  return list.filter((x): x is string => typeof x === "string");
}

/** listSessionRecords 的兜底超时：sessionQuery 服务偶发挂起时避免前端「解析中」卡死。 */
const SESSION_QUERY_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolveP, rejectP) => {
    const timer = setTimeout(() => rejectP(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolveP(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        rejectP(e);
      },
    );
  });
}

/**
 * 解析当前工作目录（会话列表提供器 + 最近活跃会话 scope）。
 * 项目级技能导出据此写盘到 <cwd>/.dsh/skills；尚未有任何会话时为 null。
 *
 * 解析顺序：
 * 1) 当前活跃会话的内存 cwd（agent 组装时记录，零依赖、瞬时返回）；
 * 2) 会话列表提供器（sessionQuery，偶发挂起 → 3s 超时放弃）。
 */
async function resolveCurrentProjectCwd(): Promise<string | null> {
  // 1) 内存优先：scope 会话在组装时记录的真实 cwd，不依赖 sessionQuery
  const scope = getCurrentSessionScope();
  if (scope) {
    const mem = getActiveSessionCwd(scope);
    if (mem) return mem;
  }
  // 2) 会话列表提供器回退：加超时防止 listSessions 挂起导致请求永远不返回
  let records: Array<{ id: string; cwd: string | null }> = [];
  try {
    records = await withTimeout(listSessionRecords(), SESSION_QUERY_TIMEOUT_MS);
  } catch {
    records = [];
  }
  // scope 会话在列表里的 cwd 优先；匹配不到再取任一会话的 cwd，
  // 避免返回 null 导致项目技能（<cwd>/.dsh/skills）扫描被跳过。
  if (scope) {
    const byScope = records.find((r) => r.id === scope)?.cwd;
    if (byScope) return byScope;
  }
  return records.find((r) => r.cwd)?.cwd || null;
}

/**
 * 目录浏览（自建后端能力）。
 *
 * 新版 DSH 运行时不再稳定提供 `ctx.workspaces` 的 browse / native 能力，
 * 插件的「选择目录」（技能导出路径、扫描文件夹等）因此会判定为不可用。
 * 这里在插件自己的 HTTP 路由上补一套最小目录浏览：列出一层子目录 + 面包屑 + 新建目录。
 */

/** 目录浏览的单条结果。 */
interface DirEntry {
  name: string;
  path: string;
  hidden: boolean;
}

/** 目录浏览结果：当前路径、宿主 home、祖先链与一层子目录。 */
interface DirListing {
  path: string;
  home: string;
  crumbs: DirEntry[];
  entries: DirEntry[];
  truncated: boolean;
}

/** 单次列举的目录上限，超出标记 truncated（防止超大目录拖慢 UI）。 */
const DIR_LIST_LIMIT = 500;

/** Windows 盘符根（C:\）或 POSIX 根（/）。 */
function rootOf(abs: string): string {
  const m = /^([A-Za-z]:[\\/])/.exec(abs);
  if (m) return m[1];
  return "/";
}

/** 把绝对路径拆成祖先链（含根与自身）。 */
function crumbsOf(abs: string): DirEntry[] {
  const root = rootOf(abs);
  // 分隔符跟随根形态：POSIX 用 "/"，Windows 盘符根用 "\"
  const sep = root === "/" ? "/" : "\\";
  const joinSeg = (base: string, part: string): string =>
    /[\\/]$/.test(base) ? `${base}${part}` : `${base}${sep}${part}`;
  const out: DirEntry[] = [{ name: root, path: root, hidden: false }];
  const rest = abs.slice(root.length).replace(/[\\/]+$/, "");
  if (!rest) return out;
  let cur = root;
  for (const part of rest.split(/[\\/]+/)) {
    if (!part) continue;
    cur = joinSeg(cur, part);
    out.push({ name: part, path: cur, hidden: part.startsWith(".") });
  }
  return out;
}

/** 规范化用户传入的路径：相对路径基于 home 解析。 */
function resolveDirInput(input: string | undefined, home: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return home;
  return isAbsolute(raw) ? resolve(raw) : resolve(home, raw);
}

/** 列出指定目录（缺省为 home）的一层子目录，带面包屑。 */
async function listFsDirectory(input?: string): Promise<DirListing> {
  const home = homedir();
  const dir = resolveDirInput(input, home);
  const st = await stat(dir);
  if (!st.isDirectory()) throw new Error(`not a directory: ${dir}`);
  const all = await readdir(dir, { withFileTypes: true });
  const dirs = all
    .filter((d) => {
      if (d.isDirectory()) return true;
      // 符号链接：按目标是否为目录判定（无法判定时不列出）
      if (d.isSymbolicLink()) {
        try {
          return statSync(join(dir, d.name)).isDirectory();
        } catch {
          return false;
        }
      }
      return false;
    })
    .map<DirEntry>((d) => ({
      name: d.name,
      path: join(dir, d.name),
      hidden: d.name.startsWith("."),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return {
    path: dir,
    home,
    crumbs: crumbsOf(dir),
    entries: dirs.slice(0, DIR_LIST_LIMIT),
    truncated: dirs.length > DIR_LIST_LIMIT,
  };
}

/** 在指定父目录下新建子目录，返回新目录绝对路径。 */
async function createFsDirectory(parent: string, name: string): Promise<string> {
  const home = homedir();
  const base = resolveDirInput(parent, home);
  const clean = name.trim().replace(/[\\/]+/g, "");
  if (!clean) throw new Error("invalid directory name");
  const target = join(base, clean);
  await mkdir(target, { recursive: false });
  return target;
}

export function makePromptRoutes(): WebRoute[] {
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const method = (req.method ?? "GET").toUpperCase();
    const { tail, segments } = parseTail(req.url);
    const promptId = segments[0] === "prompts" && segments.length === 2 ? segments[1] : undefined;

    try {
      // GET / 或 /prompts — 列表（"/" 视为列出集合根）
      if (
        method === "GET" &&
        (segments.length === 0 || (segments[0] === "prompts" && segments.length === 1))
      ) {
        const prompts = await listPrompts();
        return json(res, 200, { ok: true, data: prompts });
      }

      // GET /projects — 列出有专属提示词的项目，供数据管理筛选与分组。
      if (method === "GET" && tail === "/projects") {
        const projects = await listPromptProjects();
        return json(res, 200, { ok: true, data: projects });
      }

      // GET /projects/current — 严格按当前会话解析项目，不借用其它会话 cwd。
      if (method === "GET" && tail === "/projects/current") {
        const sessionId = new URL(req.url ?? "", "http://localhost").searchParams.get("sessionId") ?? undefined;
        const project = await resolveCurrentPromptProject(sessionId);
        return json(res, 200, { ok: true, data: { project } });
      }

      // PUT /prompts/order — 在 PUT /prompts/:id 前匹配，保存完整手动顺序。
      if (method === "PUT" && tail === "/prompts/order") {
        const body = await readJsonBody(req);
        const raw = typeof body === "object" && body !== null ? (body as { orderedIds?: unknown }) : {};
        if (!Array.isArray(raw.orderedIds) || raw.orderedIds.some((id) => typeof id !== "string")) {
          return json(res, 400, { ok: false, error: "invalid body: {orderedIds: string[]}" });
        }
        const prompts = await reorderPrompts(raw.orderedIds as string[]);
        return json(res, 200, { ok: true, data: prompts });
      }

      // POST /prompts — 创建
      if (method === "POST" && segments[0] === "prompts" && segments.length === 1) {
        const body = await readJsonBody(req);
        if (!isInput(body)) return json(res, 400, { ok: false, error: "invalid body: {title, body}" });
        const prompt: Prompt = await createPrompt(body);
        return json(res, 201, { ok: true, data: prompt });
      }

      // PUT /prompts/:id — 更新
      if (method === "PUT" && promptId) {
        const body = await readJsonBody(req);
        if (!isPatch(body)) return json(res, 400, { ok: false, error: "invalid body" });
        const updated = await updatePrompt(promptId, body);
        if (!updated) return json(res, 404, { ok: false, error: "not found" });
        return json(res, 200, { ok: true, data: updated });
      }

      // DELETE /prompts/:id — 删除
      if (method === "DELETE" && promptId) {
        const removed = await deletePrompt(promptId);
        if (!removed) return json(res, 404, { ok: false, error: "not found" });
        return json(res, 200, { ok: true, data: { id: promptId } });
      }

      // POST /prompts/:id — 记录使用次数
      if (method === "POST" && promptId) {
        const updated = await recordUsage(promptId);
        if (!updated) return json(res, 404, { ok: false, error: "not found" });
        return json(res, 200, { ok: true, data: updated });
      }

      // GET /meta/:key — 读取插件级元数据
      if (method === "GET" && segments[0] === "meta" && segments.length === 2) {
        const value = getMetaValue(segments[1] ?? "");
        return json(res, 200, { ok: true, data: { key: segments[1], value } });
      }

      // PUT /meta/:key — 覆写插件级元数据（body: { value }）
      if (method === "PUT" && segments[0] === "meta" && segments.length === 2) {
        const body = await readJsonBody(req);
        const obj = (typeof body === "object" && body !== null ? body : {}) as { value?: unknown };
        const value = typeof obj.value === "string" ? obj.value : "";
        setMetaValue(segments[1] ?? "", value);
        return json(res, 200, { ok: true, data: { key: segments[1], value } });
      }

      // GET /export — 导出全部提示词（备份内容，含 schema 版本）
      if (method === "GET" && segments[0] === "export" && segments.length === 1) {
        const data = await exportPrompts();
        return json(res, 200, { ok: true, data });
      }

      // POST /export — 导出勾选的提示词（body: { ids?: string[] }，缺省导出全部）
      if (method === "POST" && segments[0] === "export" && segments.length === 1) {
        const body = await readJsonBody(req);
        const ids =
          typeof body === "object" &&
          body !== null &&
          Array.isArray((body as { ids?: unknown }).ids)
            ? (body as { ids: unknown[] }).ids.filter((x): x is string => typeof x === "string")
            : undefined;
        const data = await exportPrompts(ids && ids.length > 0 ? ids : undefined);
        return json(res, 200, { ok: true, data });
      }

      // POST /export/save — 由后端按勾选 ids 与格式组织数据，并写入系统「下载」目录，返回保存路径。
      // 前端只传递 ids + format，避免大数据量（提示词正文）往返；
      // 写盘由后端完成，桌面端不弹「选择保存路径」对话框，且写完后才响应，前端随之提示成功。
      if (method === "POST" && segments[0] === "export" && segments[1] === "save") {
        const body = await readJsonBody(req);
        const obj = (typeof body === "object" && body !== null ? body : {}) as {
          ids?: unknown;
          format?: unknown;
          /** 目标目录；缺省写入系统「下载」目录。由前端目录选择器给出。 */
          dir?: unknown;
        };
        const ids = Array.isArray(obj.ids) ? obj.ids.filter((x): x is string => typeof x === "string") : undefined;
        const format = typeof obj.format === "string" ? obj.format : "json";
        const data = await exportPrompts(ids && ids.length > 0 ? ids : undefined);
        const file = buildExportFile(format, data.prompts);
        if (!file) return json(res, 400, { ok: false, error: "bad request" });
        // 目标目录：前端传入的用户选择目录优先，否则回落系统下载目录
        const requested = typeof obj.dir === "string" ? obj.dir.trim() : "";
        const dir = requested ? requested : downloadDir();
        // 同名处理：下载目录已有同名文件时，按 Windows 风格追加序号 `name (n).ext`，避免覆盖
        const ext = file.fileName.match(/\.([^.]*)$/)?.[1] ?? "";
        const base = ext ? file.fileName.slice(0, -(ext.length + 1)) : file.fileName;
        let finalName = file.fileName;
        let n = 1;
        while (existsSync(join(dir, finalName))) {
          finalName = ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
          n++;
        }
        const target = join(dir, finalName);
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(target, file.content, "utf8");
        } catch (e) {
          // 目标目录不可写 / 路径非法时给出明确错误，前端直接提示
          return json(res, 400, {
            ok: false,
            error: `write failed: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        return json(res, 200, { ok: true, data: { count: data.prompts.length, filePath: target } });
      }

      // POST /import — 从备份内容导入（合并式：同 id 覆盖，其余新增）
      if (method === "POST" && segments[0] === "import" && segments.length === 1) {
        const body = await readJsonBody(req);
        const result = await importPrompts(body);
        return json(res, 200, { ok: true, data: result });
      }

      // GET /tags — 标签汇总（名称 + 使用次数）
      if (method === "GET" && segments[0] === "tags" && segments.length === 1) {
        const data = await listTags();
        return json(res, 200, { ok: true, data });
      }

      // PUT /tags/:name — 重命名标签（合并到新标签）
      if (method === "PUT" && segments[0] === "tags" && segments.length === 2) {
        const from = decodeURIComponent(segments[1] ?? "");
        const body = await readJsonBody(req);
        const to =
          typeof body === "object" &&
          body !== null &&
          typeof (body as { to?: unknown }).to === "string"
            ? (body as { to: string }).to
            : "";
        const changed = await renameTag(from, to);
        return json(res, 200, { ok: true, data: { changed } });
      }

      // DELETE /tags/:name — 删除标签（从所有提示词中移除，内容变为未命名/未分类）
      if (method === "DELETE" && segments[0] === "tags" && segments.length === 2) {
        const name = decodeURIComponent(segments[1] ?? "");
        const changed = await deleteTag(name);
        return json(res, 200, { ok: true, data: { changed } });
      }

      // POST /tags — 新建标签（已存在则忽略）
      if (method === "POST" && segments[0] === "tags" && segments.length === 1) {
        const body = await readJsonBody(req);
        const name =
          typeof body === "object" &&
          body !== null &&
          typeof (body as { name?: unknown }).name === "string"
            ? (body as { name: string }).name
            : "";
        const created = await createTag(name);
        return json(res, 201, { ok: true, data: { name: created } });
      }

      // GET /trash — 列出回收站内容
      if (method === "GET" && segments[0] === "trash" && segments.length === 1) {
        const data = await listTrash();
        return json(res, 200, { ok: true, data });
      }

      // POST /skills/import — 逆向导入：读取 ~/.dsh/skills/<name>/SKILL.md 批量生成为提示词入库
      if (method === "POST" && tail === "/skills/import") {
        const result = await importSkillsFromDisk();
        return json(res, 200, { ok: true, data: result });
      }

      // GET /fs/list?path= — 目录浏览：列出一层子目录 + 面包屑（自建能力，不依赖宿主 workspaces）
      if (method === "GET" && tail === "/fs/list") {
        const path = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? "";
        try {
          return json(res, 200, { ok: true, data: await listFsDirectory(path || undefined) });
        } catch (e) {
          return json(res, 400, {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // POST /fs/mkdir — 在指定父目录下新建子目录（目录选择弹窗「新建文件夹」）
      if (method === "POST" && tail === "/fs/mkdir") {
        const b = await readJsonBody(req);
        const parent =
          typeof b === "object" && b !== null && typeof (b as { path?: unknown }).path === "string"
            ? (b as { path: string }).path
            : "";
        const name =
          typeof b === "object" && b !== null && typeof (b as { name?: unknown }).name === "string"
            ? (b as { name: string }).name
            : "";
        if (!name.trim()) return json(res, 400, { ok: false, error: "invalid body: {path, name}" });
        try {
          const data = await createFsDirectory(parent, name);
          return json(res, 200, { ok: true, data: { path: data } });
        } catch (e) {
          return json(res, 400, {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // GET /skills/available — 列出 ~/.dsh/skills 下可导入的技能（解析为可编辑条目，供导入弹窗勾选）
      if (method === "GET" && tail === "/skills/available") {
        const data = await listAvailableSkills();
        return json(res, 200, { ok: true, data });
      }

      // POST /skills/scan-dir — 递归扫描任意指定目录下的 md 文件为可导入技能条目（「扫描文件夹」导入）
      if (method === "POST" && tail === "/skills/scan-dir") {
        const raw = await readJsonBody(req);
        const dir =
          typeof raw === "object" &&
          raw !== null &&
          typeof (raw as { dir?: unknown }).dir === "string"
            ? (raw as { dir: string }).dir.trim()
            : "";
        if (!dir) return json(res, 400, { ok: false, error: "invalid body: {dir}" });
        const data = await listSkillsFromDir(dir);
        return json(res, 200, { ok: true, data });
      }

      // POST /skills/parse — 解析一段 md 原始文本（frontmatter + 正文）为可编辑条目（供「选择本地 md 文件」导入）
      if (method === "POST" && tail === "/skills/parse") {
        const raw = await readJsonBody(req);
        const text =
          typeof raw === "object" &&
          raw !== null &&
          typeof (raw as { raw?: unknown }).raw === "string"
            ? (raw as { raw: string }).raw
            : "";
        if (!text) return json(res, 400, { ok: false, error: "invalid body: {raw}" });
        return json(res, 200, { ok: true, data: parseSkillRaw(text) });
      }

      // POST /skills/import/entries — 保存用户在弹窗中编辑后的技能条目（逆向导入入库）
      if (method === "POST" && tail === "/skills/import/entries") {
        const raw = await readJsonBody(req);
        const list =
          typeof raw === "object" &&
          raw !== null &&
          Array.isArray((raw as { entries?: unknown }).entries)
            ? (raw as { entries: unknown[] }).entries
            : [];
        const entries = list.filter(isSkillEntry);
        if (entries.length === 0) {
          return json(res, 400, { ok: false, error: "invalid body: {entries: SkillEntry[]}" });
        }
        const result = await importSkillEntries(entries);
        return json(res, 200, { ok: true, data: result });
      }

      // GET /skills/export/project-cwd — 解析当前项目路径（导出弹窗「项目技能」范围用，用于展示保存位置）
      if (method === "GET" && tail === "/skills/export/project-cwd") {
        const cwd = await resolveCurrentProjectCwd();
        return json(res, 200, { ok: true, data: { cwd } });
      }

      // POST /skills/export/entries — 把用户在弹窗中编辑后的技能条目导出为 DSH 技能。
      // body.scope 控制导出范围：
      //   global（缺省）→ 写盘到 ~/.dsh/skills/<name>/SKILL.md（通用技能）；
      //   project → 写盘到 <项目路径>/.dsh/skills/<name>/SKILL.md（项目技能）；
      //     body.rootPath 为用户手动填写的项目路径（未自动解析到当前项目时由前端传入）。
      if (method === "POST" && tail === "/skills/export/entries") {
        const raw = await readJsonBody(req);
        const list =
          typeof raw === "object" &&
          raw !== null &&
          Array.isArray((raw as { entries?: unknown }).entries)
            ? (raw as { entries: unknown[] }).entries
            : [];
        const entries = list.filter(isSkillEntry);
        if (entries.length === 0) {
          return json(res, 400, { ok: false, error: "invalid body: {entries: SkillEntry[]}" });
        }
        const scope =
          typeof raw === "object" && raw !== null && (raw as { scope?: unknown }).scope === "project"
            ? "project"
            : "global";
        // project 作用域：优先用用户手动填写的导出路径 rootPath（项目路径），
        // 否则自动解析当前项目路径；技能写盘为 <项目路径>/<name>/SKILL.md
        const manualRoot =
          typeof raw === "object" &&
          raw !== null &&
          typeof (raw as { rootPath?: unknown }).rootPath === "string"
            ? (raw as { rootPath: string }).rootPath.trim()
            : "";
        const projectRoot = scope === "project" ? manualRoot || (await resolveCurrentProjectCwd()) : null;
        if (scope === "project" && !projectRoot) {
          return json(res, 400, {
            ok: false,
            error: "未指定导出路径，且无法确定当前项目路径，请填写项目路径后重试",
          });
        }
        // project 作用域：写盘到 <项目>/.dsh/skills/<name>/SKILL.md（项目级技能根目录）
        const exportRoot = scope === "project" ? join(projectRoot!, ".dsh", "skills") : undefined;
        const result = await exportPromptsAsSkills(entries, exportRoot);
        return json(res, 200, { ok: true, data: result });
      }

      // POST /skills/ai-describe — AI 依据提示词内容生成技能名与描述（导出弹窗校验通过后自动调用）
      if (method === "POST" && tail === "/skills/ai-describe") {
        const raw = await readJsonBody(req);
        if (typeof raw !== "object" || raw === null) {
          return json(res, 400, { ok: false, error: "invalid body: {title, body}" });
        }
        const { title, body, summary, tags } = raw as {
          title?: unknown;
          body?: unknown;
          summary?: unknown;
          tags?: unknown;
        };
        if (typeof title !== "string" || typeof body !== "string" || !title.trim() || !body.trim()) {
          return json(res, 400, { ok: false, error: "invalid body: {title, body}" });
        }
        const settings = await getSettings();
        const result = await generateSkillDescriptor(
          {
            title: title.trim(),
            body: body.trim(),
            summary: typeof summary === "string" && summary.trim() ? summary.trim() : undefined,
            tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : undefined,
          },
          settings,
        );
        return json(res, 200, { ok: true, data: result });
      }

      // GET /skills/harness/list — 列出 system（~/.dsh/skills）与当前项目（<项目>/.dsh/skills）的
      //   harness 技能及其开关状态（供「技能管理」里的软控制开关弹窗展示/勾选）。
      if (method === "GET" && tail === "/skills/harness/list") {
        const projectRoot = await resolveCurrentProjectCwd();
        const items = await listHarnessSkillToggles(projectRoot);
        return json(res, 200, { ok: true, data: { items, projectRoot } });
      }

      // POST /skills/harness/toggle — 更新某 harness 技能的开关（软控制：禁用清单注入系统提示）。
      if (method === "POST" && tail === "/skills/harness/toggle") {
        const raw = await readJsonBody(req);
        const id =
          typeof raw === "object" &&
          raw !== null &&
          typeof (raw as { id?: unknown }).id === "string"
            ? (raw as { id: string }).id.trim()
            : "";
        const enabled = typeof raw === "object" && raw !== null ? (raw as { enabled?: unknown }).enabled : undefined;
        if (!id) return json(res, 400, { ok: false, error: "invalid body: {id: string, enabled: boolean}" });
        setHarnessSkillToggle(id, typeof enabled === "boolean" ? enabled : true);
        return json(res, 200, { ok: true, data: { id, enabled: typeof enabled === "boolean" ? enabled : true } });
      }

      // POST /skills/harness/delete — 删除某个 harness 技能（删除其技能根目录下的整个目录）。
      if (method === "POST" && tail === "/skills/harness/delete") {
        const body = await readJsonBody(req);
        const id =
          typeof body === "object" &&
          body !== null &&
          typeof (body as { id?: unknown }).id === "string"
            ? (body as { id: string }).id.trim()
            : "";
        if (!id) return json(res, 400, { ok: false, error: "invalid body: {id: string}" });
        try {
          const deleted = await deleteHarnessSkill(id);
          if (!deleted) return json(res, 404, { ok: false, error: "skill not found" });
          return json(res, 200, { ok: true, data: { id } });
        } catch (e) {
          return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      // POST /trash/restore — 从回收站恢复一批提示词
      if (method === "POST" && tail === "/trash/restore") {
        const body = await readJsonBody(req);
        const ids = extractIds(body);
        const restored = await restorePrompts(ids);
        return json(res, 200, { ok: true, data: { restored } });
      }

      // POST /trash/delete — 从回收站永久删除一批提示词
      if (method === "POST" && tail === "/trash/delete") {
        const body = await readJsonBody(req);
        const ids = extractIds(body);
        const deleted = await deleteTrash(ids);
        return json(res, 200, { ok: true, data: { deleted } });
      }

      // POST /trash/empty — 清空回收站
      if (method === "POST" && tail === "/trash/empty") {
        const deleted = await emptyTrash();
        return json(res, 200, { ok: true, data: { deleted } });
      }

      // GET /ai/providers — 获取系统中可用的 AI provider 及模型列表（设置界面下拉选择）
      if (method === "GET" && tail === "/ai/providers") {
        const data = await listAiSelectables();
        return json(res, 200, { ok: true, data });
      }

      // POST /ai/polish — AI 润色提示词正文（只返回结果，不写回、不学习）
      // keepVariables：是否启用「{{}} 模板变量保留/新增」能力（默认开启；聊天框按钮润色关闭）
      // withSummary：是否同时生成用途摘要（AI 优化后显示摘要时开启）
      if (method === "POST" && tail === "/ai/polish") {
        const raw = await readJsonBody(req);
        if (typeof raw !== "object" || raw === null || typeof (raw as { body: string }).body !== "string") {
          return json(res, 400, { ok: false, error: "invalid body: {body: string}" });
        }
        const body = (raw as { body: string }).body;
        if (!body.trim()) return json(res, 400, { ok: false, error: "body empty" });
        const keepVariables = (raw as { keepVariables?: boolean }).keepVariables !== false;
        const withSummary = (raw as { withSummary?: boolean }).withSummary === true;
        const settings = await getSettings();
        if (withSummary) {
          const result = await polishPromptBodyWithSummary(body, settings, { keepVariables });
          if (result === undefined) {
            return json(res, 503, { ok: false, error: "AI 不可用或优化失败，请确认已连接 LLM 服务" });
          }
          return json(res, 200, { ok: true, data: result });
        }
        const polished = await polishPromptBody(body, settings, { keepVariables });
        if (polished === undefined) {
          return json(res, 503, { ok: false, error: "AI 不可用或优化失败，请确认已连接 LLM 服务" });
        }
        return json(res, 200, { ok: true, data: { polished } });
      }

      // POST /ai/intro — AI 生成词库功能简介（5 句，供悬浮助手气泡轮询；失败时前端回退内置简介）
      if (method === "POST" && tail === "/ai/intro") {
        const raw = await readJsonBody(req);
        const lang = (raw as { lang?: string })?.lang === "en" ? "en" : "zh";
        const settings = await getSettings();
        const lines = await generateIntro(lang, settings);
        if (!lines || lines.length === 0) {
          return json(res, 503, { ok: false, error: "AI 不可用或生成简介失败" });
        }
        return json(res, 200, { ok: true, data: { lines } });
      }

      // POST /ai/draft — 依据「标题 + 已有内容」用 AI 生成技能正文草稿
      // （技能管理编辑区「AI 生成」按钮：只返回文本，不落盘、不写回）
      if (method === "POST" && tail === "/ai/draft") {
        const raw = await readJsonBody(req);
        if (typeof raw !== "object" || raw === null) {
          return json(res, 400, { ok: false, error: "invalid body: {kind, title, input}" });
        }
        const { kind, title, input, lang } = raw as {
          kind?: unknown;
          title?: unknown;
          input?: unknown;
          lang?: unknown;
        };
        if (kind !== "skill" || typeof title !== "string" || !title.trim()) {
          return json(res, 400, { ok: false, error: "invalid body: {kind: 'skill', title: string}" });
        }
        const settings = await getSettings();
        const result = await generateDraft(
          kind,
          title.trim(),
          typeof input === "string" ? input.trim() : "",
          settings,
          lang === "en" ? "en" : "zh",
        );
        if (!result.content) {
          return json(res, 503, { ok: false, error: "AI 不可用或生成失败，请确认已连接 LLM 服务" });
        }
        return json(res, 200, { ok: true, data: { content: result.content } });
      }

      // GET /settings — 获取设置
      if (method === "GET" && tail === "/settings") {
        const settings = await getSettings();
        return json(res, 200, { ok: true, data: settings });
      }

      // GET /version — 服务端/客户端版本比对信息（运行版本 + 磁盘已安装版本）
      if (method === "GET" && tail === "/version") {
        return json(res, 200, { ok: true, data: getVersionInfo() });
      }

      // PUT /settings — 更新设置
      if (method === "PUT" && tail === "/settings") {
        const raw = await readJsonBody(req);
        if (typeof raw !== "object" || raw === null) {
          return json(res, 400, { ok: false, error: "invalid body" });
        }
        const settings = await updateSettings(raw as Partial<PluginSettings>);
        return json(res, 200, { ok: true, data: settings });
      }

      // ── 会话级技能（session-prompts）与技能注入 ────────────────────────────

      // GET /session-prompts — 列出全部会话级技能
      if (method === "GET" && segments[0] === "session-prompts" && segments.length === 1) {
        return json(res, 200, { ok: true, data: listSessionPrompts() });
      }

      // POST /session-prompts — 新建会话级技能
      if (method === "POST" && segments[0] === "session-prompts" && segments.length === 1) {
        const body = await readJsonBody(req);
        if (!isInput(body)) return json(res, 400, { ok: false, error: "invalid body: {title, body}" });
        const prompt = createSessionPrompt(body);
        return json(res, 201, { ok: true, data: prompt });
      }

      // PUT /session-prompts/:id — 更新会话级技能
      if (method === "PUT" && segments[0] === "session-prompts" && segments.length === 2 && segments[1] !== "bindings" && segments[1] !== "active") {
        const body = await readJsonBody(req);
        if (!isPatch(body)) return json(res, 400, { ok: false, error: "invalid body" });
        const updated = updateSessionPrompt(segments[1] ?? "", {
          title: body.title,
          body: body.body,
          tags: body.tags,
          enabled: (body as { enabled?: boolean }).enabled,
        });
        if (!updated) return json(res, 404, { ok: false, error: "not found" });
        return json(res, 200, { ok: true, data: updated });
      }

      // DELETE /session-prompts/:id — 删除会话级技能（同时清理绑定与临时注入引用）
      if (method === "DELETE" && segments[0] === "session-prompts" && segments.length === 2 && segments[1] !== "bindings" && segments[1] !== "active" && segments[1] !== "session") {
        const removed = deleteSessionPrompt(segments[1] ?? "");
        if (!removed) return json(res, 404, { ok: false, error: "not found" });
        return json(res, 200, { ok: true, data: { id: segments[1] } });
      }

      // GET /session-prompts/bindings — 列出全部路径绑定（工作区/项目绑定 Tab 用）
      if (method === "GET" && segments[0] === "session-prompts" && segments[1] === "bindings" && segments.length === 2) {
        return json(res, 200, { ok: true, data: listScopePromptBindings() });
      }

      // GET /session-prompts/bindings/path?path= — 读取某路径精确绑定的技能 id 列表
      if (method === "GET" && segments[0] === "session-prompts" && segments[1] === "bindings" && segments[2] === "path" && segments.length === 3) {
        const q = new URLSearchParams((req.url ?? "").split("?", 2)[1] ?? "");
        const path = q.get("path") ?? "";
        return json(res, 200, { ok: true, data: { promptIds: getScopeBoundPromptIds(path) } });
      }

      // PUT /session-prompts/bindings {path, promptIds} — 设置某路径绑定的技能 id 列表
      if (method === "PUT" && segments[0] === "session-prompts" && segments[1] === "bindings" && segments.length === 2) {
        const raw = await readJsonBody(req);
        const path =
          typeof raw === "object" && raw !== null && typeof (raw as { path?: unknown }).path === "string"
            ? (raw as { path: string }).path
            : "";
        const promptIds = extractIds(raw);
        if (!path) return json(res, 400, { ok: false, error: "invalid body: {path, promptIds}" });
        setScopePromptBinding(path, promptIds);
        return json(res, 200, { ok: true, data: { promptIds } });
      }

      // DELETE /session-prompts/bindings/all — 一键清空技能绑定（所有路径 + 会话的技能绑定）
      if (method === "DELETE" && segments[0] === "session-prompts" && segments[1] === "bindings" && segments[2] === "all" && segments.length === 3) {
        clearAllSkillBindings();
        return json(res, 200, { ok: true, data: { cleared: true } });
      }

      // DELETE /session-prompts/bindings?path= — 清除某路径的绑定
      if (method === "DELETE" && segments[0] === "session-prompts" && segments[1] === "bindings" && segments.length === 2) {
        const q = new URLSearchParams((req.url ?? "").split("?", 2)[1] ?? "");
        const path = q.get("path") ?? "";
        if (!path) return json(res, 400, { ok: false, error: "invalid query: path" });
        clearScopePromptBinding(path);
        return json(res, 200, { ok: true, data: { cleared: true } });
      }

      // GET /session-prompts/current-scope — 读取最近活跃的会话 scope（「当前会话」Tab 用）
      if (method === "GET" && segments[0] === "session-prompts" && segments[1] === "current-scope" && segments.length === 2) {
        return json(res, 200, { ok: true, data: { scope: getCurrentSessionScope() } });
      }

      // GET /session-prompts/active?scope= — 读取某会话 scope 的临时注入技能 id 列表
      if (method === "GET" && segments[0] === "session-prompts" && segments[1] === "active" && segments.length === 2) {
        const q = new URLSearchParams((req.url ?? "").split("?", 2)[1] ?? "");
        const scope = q.get("scope") ?? "";
        return json(res, 200, { ok: true, data: { promptIds: getSessionActivePromptIds(scope) } });
      }

      // PUT /session-prompts/active {scope, promptIds} — 设置某会话 scope 的临时注入技能 id 列表
      if (method === "PUT" && segments[0] === "session-prompts" && segments[1] === "active" && segments.length === 2) {
        const raw = await readJsonBody(req);
        const scope =
          typeof raw === "object" && raw !== null && typeof (raw as { scope?: unknown }).scope === "string"
            ? (raw as { scope: string }).scope
            : "";
        const promptIds = extractIds(raw);
        if (!scope) return json(res, 400, { ok: false, error: "invalid body: {scope, promptIds}" });
        setSessionActivePrompts(scope, promptIds);
        return json(res, 200, { ok: true, data: { promptIds } });
      }

      // PUT /session-prompts/session/prompts {sessionId, promptIds} — 设置某会话持久绑定的技能 id 列表
      if (method === "PUT" && segments[0] === "session-prompts" && segments[1] === "session" && segments[2] === "prompts") {
        const raw = await readJsonBody(req);
        const sessionId =
          typeof raw === "object" && raw !== null && typeof (raw as { sessionId?: unknown }).sessionId === "string"
            ? (raw as { sessionId: string }).sessionId
            : "";
        const promptIds = extractIds(raw);
        if (!sessionId) return json(res, 400, { ok: false, error: "invalid body: {sessionId, promptIds}" });
        setSessionPromptBindingForSession(sessionId, promptIds);
        return json(res, 200, { ok: true, data: { promptIds } });
      }

      // DELETE /session-prompts/session?sessionId= — 清除某会话的技能绑定（不再注入技能）
      if (method === "DELETE" && segments[0] === "session-prompts" && segments[1] === "session" && segments.length === 2) {
        // 注意：tail 已在 parseTail 中去掉了 query（仅保留 pathname），此处需从原始 req.url 解析查询参。
        const raw = req.url ?? "";
        const q = new URLSearchParams(raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "");
        const sessionId = q.get("sessionId") ?? "";
        if (!sessionId) return json(res, 400, { ok: false, error: "invalid query: sessionId" });
        clearSessionBinding(sessionId);
        return json(res, 200, { ok: true, data: { cleared: true } });
      }

      return json(res, 404, { ok: false, error: `no route ${method} ${tail}` });
    } catch (err) {
      return json(res, 500, { ok: false, error: "internal error" });
    }
  };

  return [
    {
      kind: "prefix",
      path: PREFIX,
      handler,
    },
  ];
}