/**
 * 智能/手动排序控件。
 *
 * 关闭智能排序前必须二次确认；手动模式下持续显示提醒和一键恢复入口。
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import type { PromptSortMode } from "../../../types.js";
import { usePLT } from "../../utils/i18n.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

const selectStyle: CSSProperties = {
  height: 28,
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

export function PromptSortControls(props: {
  mode: PromptSortMode;
  onChange: (mode: PromptSortMode) => Promise<void>;
  compact?: boolean;
}): ReactNode {
  const { mode, onChange, compact = false } = props;
  const T = usePLT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: PromptSortMode): Promise<void> => {
    if (busy || next === mode) return;
    setBusy(true);
    setError("");
    try {
      await onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <select
          aria-label={T("pl.sort.mode")}
          title={T("pl.sort.mode")}
          value={mode}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value as PromptSortMode;
            if (next === "manual") setConfirmOpen(true);
            else void save("smart");
          }}
          style={{ ...selectStyle, flex: compact ? "0 0 auto" : "1 1 150px", minWidth: 0 }}
        >
          <option value="smart">{T("pl.sort.smart")}</option>
          <option value="manual">{T("pl.sort.manual")}</option>
        </select>
      </div>
      {mode === "manual" && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            padding: "6px 8px",
            borderRadius: 7,
            color: "var(--dsw-alias-state-warning-primary, #b45309)",
            background: "var(--dsw-alias-state-warning-bg, rgba(245,158,11,.1))",
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          <span style={{ flex: "1 1 150px", minWidth: 0 }}>{T("pl.sort.disabledNotice")}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("smart")}
            style={{
              flexShrink: 0,
              border: "none",
              padding: 0,
              background: "transparent",
              color: "var(--dsw-alias-brand-primary, #2563eb)",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {T("pl.sort.reEnable")}
          </button>
        </div>
      )}
      {error && <div style={{ color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: 11.5 }}>{error}</div>}
      <ConfirmDialog
        open={confirmOpen}
        message={T("pl.sort.disableConfirm")}
        confirmLabel={T("pl.sort.confirmManual")}
        cancelLabel={T("pl.cancel")}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void save("manual");
        }}
      />
    </div>
  );
}
