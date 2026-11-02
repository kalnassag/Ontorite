import { useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

const isMac =
  typeof navigator !== "undefined" &&
  (navigator.platform.includes("Mac") || navigator.userAgent.includes("Mac"));

const MOD = isMac ? "⌘" : "Ctrl";

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: `${MOD}+N`, action: "New class" },
  { keys: `${MOD}+Shift+N`, action: "New property on the selected class" },
  { keys: `${MOD}+Z`, action: "Undo" },
  { keys: `${MOD}+Y / ${MOD}+Shift+Z`, action: "Redo" },
  { keys: `${MOD}+V`, action: "Paste" },
  { keys: `${MOD}+S`, action: "Save to file" },
  { keys: "Escape", action: "Cancel / close form" },
];

export default function KeyboardHelp({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed right-4 top-12 z-50 w-64 rounded-lg border border-th-border bg-th-surface shadow-xl">
      <div className="flex items-center justify-between border-b border-th-border px-3 py-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-th-fg-3">
          Keyboard Shortcuts
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
      <table className="w-full">
        <tbody>
          {SHORTCUTS.map(({ keys, action }) => (
            <tr key={keys} className="border-b border-th-border-muted last:border-0">
              <td className="px-3 py-1.5">
                <kbd className="rounded bg-th-hover px-1.5 py-0.5 font-mono text-2xs text-th-fg-2">
                  {keys}
                </kbd>
              </td>
              <td className="px-3 py-1.5 text-xs text-th-fg-3">{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
