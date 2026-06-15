/**
 * Reusable right-side slide-in drawer. Used for the ontology metadata
 * panel and per-entity editorial-notes panels.
 */

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Drawer width in pixels. Default 420. */
  width?: number;
  children: React.ReactNode;
}

export default function Drawer({ open, onClose, title, subtitle, width = 420, children }: Props) {
  // Esc closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30"
          />
          <motion.aside
            key="drawer-panel"
            initial={{ x: width }}
            animate={{ x: 0 }}
            exit={{ x: width }}
            transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
            style={{ width }}
            className="fixed inset-y-0 right-0 z-50 flex flex-col border-l border-th-border bg-th-base shadow-2xl"
          >
            <header className="flex items-start gap-2 border-b border-th-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-th-fg">{title}</h3>
                {subtitle && (
                  <p className="truncate font-mono text-2xs text-th-fg-3">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                title="Close (Esc)"
              >
                <X size={14} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
