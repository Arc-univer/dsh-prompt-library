/** 共享提示词排序设置，保证词库按钮、数据管理和设置页实时同步。 */
import { useCallback, useEffect, useState } from "react";
import type { PluginSettings, PromptSortMode } from "../../types.js";
import { DEFAULT_SETTINGS } from "../../types.js";
import { getSettings, updateSettings } from "../utils/api.js";

export function usePromptSortMode(): {
  sortMode: PromptSortMode;
  changeSortMode: (mode: PromptSortMode) => Promise<void>;
} {
  const [sortMode, setSortMode] = useState<PromptSortMode>(DEFAULT_SETTINGS.promptSortMode);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((settings) => {
        if (alive) setSortMode(settings.promptSortMode);
      })
      .catch(() => {});
    const onChanged = (event: Event): void => {
      const settings = (event as CustomEvent<PluginSettings>).detail;
      if (settings?.promptSortMode === "smart" || settings?.promptSortMode === "manual") {
        setSortMode(settings.promptSortMode);
      }
    };
    window.addEventListener("pl:settings-changed", onChanged);
    return () => {
      alive = false;
      window.removeEventListener("pl:settings-changed", onChanged);
    };
  }, []);

  const changeSortMode = useCallback(async (mode: PromptSortMode): Promise<void> => {
    const settings = await updateSettings({ promptSortMode: mode });
    setSortMode(settings.promptSortMode);
    window.dispatchEvent(new CustomEvent("pl:settings-changed", { detail: settings }));
  }, []);

  return { sortMode, changeSortMode };
}
