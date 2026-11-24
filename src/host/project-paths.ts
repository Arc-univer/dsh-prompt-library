/**
 * 提示词项目路径规范化。
 *
 * 展示路径保留原始大小写，匹配键在 Windows 上统一转为小写；
 * 不读取项目文件，也不依赖 Git 仓库名。
 */
import { basename, isAbsolute, normalize, parse, resolve } from "node:path";
import type { PromptProject } from "../types.js";

/** 把用户或会话提供的目录转换为稳定的项目路径与匹配键。 */
export function normalizePromptProjectPath(input: string): PromptProject {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("project path is required");
  if (!isAbsolute(trimmed)) throw new Error("project path must be absolute");
  const resolved = normalize(resolve(trimmed));
  const root = parse(resolved).root;
  // 非根目录去掉末尾分隔符，避免同一项目因尾部分隔符形成两个分组。
  const path = resolved.length > root.length ? resolved.replace(/[\\/]+$/, "") : resolved;
  const key = process.platform === "win32" ? path.toLowerCase() : path;
  return { key, path, name: basename(path) || path };
}
