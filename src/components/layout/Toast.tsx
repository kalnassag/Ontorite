import { useEffect } from "react";

interface Props {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

export default function Toast({ message, actionLabel, onAction, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-th-border bg-th-surface px-4 py-2 shadow-lg text-sm">
      <span className="text-th-fg-2">{message}</span>
      {onAction && actionLabel && (
        <button
          onClick={() => { onAction(); onDismiss(); }}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
