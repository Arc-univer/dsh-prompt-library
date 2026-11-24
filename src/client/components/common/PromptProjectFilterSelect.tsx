/** 项目范围下拉：当前项目始终包含全局提示词，具体语义由 filterPromptsByProject 保证。 */
import type { CSSProperties, ReactNode } from "react";
import type { PromptProject } from "../../../types.js";
import type { PromptProjectFilter } from "../../utils/prompt-projects.js";
import { usePLT } from "../../utils/i18n.js";

const style: CSSProperties = {
  height: 28,
  minWidth: 0,
  padding: "0 8px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(196,211,232,.16))",
  borderRadius: 7,
  outline: "none",
  color: "var(--dsw-alias-label-primary, #1f2937)",
  background: "var(--dsw-alias-bg-layer-2, #fff)",
  fontFamily: "inherit",
  fontSize: 12,
  cursor: "pointer",
};

export function PromptProjectFilterSelect(props: {
  value: PromptProjectFilter;
  onChange: (value: PromptProjectFilter) => void;
  currentProject: PromptProject | null;
  projects: PromptProject[];
  allowAll?: boolean;
  allowSpecific?: boolean;
  grow?: boolean;
}): ReactNode {
  const { value, onChange, currentProject, projects, allowAll = true, allowSpecific = false, grow = false } = props;
  const T = usePLT();
  return (
    <select
      aria-label={T("pl.project.filter")}
      title={currentProject?.path || T("pl.project.notDetected")}
      value={value}
      onChange={(event) => onChange(event.target.value as PromptProjectFilter)}
      style={{ ...style, flex: grow ? "1 1 150px" : "0 1 160px" }}
    >
      <option value="current">
        {currentProject
          ? T("pl.project.currentNamed", { name: currentProject.name })
          : T("pl.project.currentUnknown")}
      </option>
      <option value="global">{T("pl.project.global")}</option>
      {allowAll && <option value="all">{T("pl.project.all")}</option>}
      {allowSpecific && projects.length > 0 && (
        <optgroup label={T("pl.project.specific")}>
          {projects.map((project) => (
            <option key={project.key} value={`project:${project.key}`}>
              {project.name} ({project.count ?? 0})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
