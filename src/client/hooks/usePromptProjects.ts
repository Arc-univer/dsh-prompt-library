/** 共享当前项目与项目列表，数据变化后自动刷新项目计数。 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PromptProject } from "../../types.js";
import { getCurrentPromptProject, listPromptProjects } from "../utils/api.js";
import { useDataChanged } from "../utils/data-sync.js";

export function usePromptProjects(sessionId?: string): {
  currentProject: PromptProject | null;
  projects: PromptProject[];
  refreshProjects: () => void;
} {
  const [resolvedProject, setResolvedProject] = useState<{
    sessionId?: string;
    project: PromptProject | null;
  }>({ sessionId, project: null });
  const [projects, setProjects] = useState<PromptProject[]>([]);
  const requestVersion = useRef(0);

  const refreshProjects = useCallback((): void => {
    // 会话快速切换或连续刷新时，只采用最后一次请求，避免旧项目覆盖新项目。
    const version = ++requestVersion.current;
    const isLatest = (): boolean => version === requestVersion.current;
    getCurrentPromptProject(sessionId)
      .then(({ project }) => {
        if (isLatest()) setResolvedProject({ sessionId, project });
      })
      .catch(() => {
        if (isLatest()) setResolvedProject({ sessionId, project: null });
      });
    listPromptProjects()
      .then((items) => {
        if (isLatest()) setProjects(items);
      })
      .catch(() => {
        if (isLatest()) setProjects([]);
      });
  }, [sessionId]);

  useEffect(() => {
    refreshProjects();
    return () => {
      // 卸载或 sessionId 变化后，使尚未返回的请求失效。
      requestVersion.current += 1;
    };
  }, [refreshProjects]);
  useDataChanged(refreshProjects);
  // sessionId 已变化但新请求未返回时，不沿用上一个会话的项目。
  const currentProject = resolvedProject.sessionId === sessionId ? resolvedProject.project : null;
  return { currentProject, projects, refreshProjects };
}
