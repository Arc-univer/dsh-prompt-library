/** 手动排序拖拽手柄：仅手柄可发起拖动，避免干扰文本选择与行内按钮。 */
import type { DragEvent, ReactNode } from "react";
import { usePLT } from "../../utils/i18n.js";

export function PromptDragHandle(props: {
  promptId: string;
  onStart: (id: string) => void;
  onEnd: () => void;
}): ReactNode {
  const { promptId, onStart, onEnd } = props;
  const T = usePLT();
  const start = (event: DragEvent<HTMLSpanElement>): void => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", promptId);
    onStart(promptId);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      draggable
      aria-label={T("pl.sort.dragHandle")}
      title={T("pl.sort.dragHandle")}
      onDragStart={start}
      onDragEnd={onEnd}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.preventDefault();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 24,
        flexShrink: 0,
        color: "var(--dsw-alias-label-tertiary, #718096)",
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" />
        <circle cx="3" cy="8" r="1.2" /><circle cx="9" cy="8" r="1.2" />
        <circle cx="3" cy="13" r="1.2" /><circle cx="9" cy="13" r="1.2" />
      </svg>
    </span>
  );
}
