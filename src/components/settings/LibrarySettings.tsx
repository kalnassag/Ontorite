/**
 * Settings → Library: the ontologies kept on this device for looking up
 * external terms' definitions, plus the catalogue to add more from.
 */

import { useState } from "react";
import { FolderOpen, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../../lib/store";
import { useReferences } from "../../lib/references/reference-store";
import type { StoredReference } from "../../lib/persistence";
import LibraryCatalog from "./LibraryCatalog";

function originLabel(origin: string): string {
  if (!/^https?:\/\//i.test(origin)) return origin;
  try {
    const url = new URL(origin);
    return `${url.hostname}/…/${url.pathname.split("/").pop() || ""}`;
  } catch {
    return origin;
  }
}

export default function LibrarySettings() {
  const stored = useReferences((s) => s.stored);
  const sources = useReferences((s) => s.sources);
  const ready = useReferences((s) => s.ready);
  const setEnabled = useReferences((s) => s.setEnabled);
  const updateEntry = useReferences((s) => s.update);
  const remove = useReferences((s) => s.remove);
  const importOntologyAsync = useStore((s) => s.importOntologyAsync);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const entries = [...stored].sort((a, b) => (a.name || a.iri).localeCompare(b.name || b.iri));

  const refresh = async (record: StoredReference) => {
    setBusy(record.id);
    const outcome = await updateEntry(record.id);
    setBusy(null);
    setMessages((m) => ({ ...m, [record.id]: outcome.ok ? "Updated." : outcome.message }));
  };

  const openInWorkspace = async (record: StoredReference) => {
    const fileName = record.origin.split("/").pop() || record.formatHint;
    await importOntologyAsync(record.text, fileName);
    setMessages((m) => ({ ...m, [record.id]: "Opened as an editable copy in the workspace." }));
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="library-heading" className="space-y-1.5">
        <h3 id="library-heading" className="text-xs font-semibold text-th-fg-2">Your library</h3>
        <p className="text-2xs leading-snug text-th-fg-4">
          Ontologies kept on this device, read-only. Terms they define show their label, description and
          full definition wherever you hover them. They&apos;re never merged into your ontologies.
        </p>
        {!ready ? (
          <p className="flex items-center gap-1 text-2xs text-th-fg-4"><Loader2 size={10} className="animate-spin" /> Loading…</p>
        ) : entries.length === 0 ? (
          <p className="rounded border border-dashed border-th-border p-3 text-center text-2xs text-th-fg-4">
            Your library is empty. Add ontologies you use from the catalogue below, or your own.
          </p>
        ) : (
          <ul className="divide-y divide-th-border-muted rounded border border-th-border-muted">
            {entries.map((record) => {
              const source = sources.find((s) => s.id === record.id);
              const enabled = record.enabled !== false;
              const name = record.name || source?.name || record.iri;
              return (
                <li key={record.id} className="px-2 py-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => void setEnabled(record.id, e.target.checked)}
                      className="mt-0.5"
                      aria-label={`Use ${name} for definitions`}
                      title="Use for definitions"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className={`text-xs font-medium ${enabled ? "text-th-fg" : "text-th-fg-4"}`}>{name}</span>
                        {record.prefix && <code className="font-mono text-2xs text-th-fg-3">{record.prefix}:</code>}
                        {!enabled && <span className="text-2xs text-th-fg-4">(not used for definitions)</span>}
                      </div>
                      <div className="text-2xs text-th-fg-4" title={record.origin}>
                        {source ? `${source.tripleCount.toLocaleString()} statements` : "Couldn't be read"} · {originLabel(record.origin)} ·{" "}
                        {new Date(record.fetchedAt).toLocaleDateString()}
                      </div>
                      {messages[record.id] && <p className="text-2xs text-th-fg-3">{messages[record.id]}</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center">
                      {busy === record.id ? (
                        <Loader2 size={12} className="m-1 animate-spin text-th-fg-4" />
                      ) : (
                        <button onClick={() => void refresh(record)} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Download again" aria-label={`Update ${name}`}>
                          <RefreshCw size={12} />
                        </button>
                      )}
                      <button onClick={() => void openInWorkspace(record)} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Open an editable copy in the workspace" aria-label={`Open ${name} in the workspace`}>
                        <FolderOpen size={12} />
                      </button>
                      {confirmRemove === record.id ? (
                        <button onClick={() => { void remove(record.id); setConfirmRemove(null); }} className="rounded px-1.5 py-0.5 text-2xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
                          Remove?
                        </button>
                      ) : (
                        <button onClick={() => setConfirmRemove(record.id)} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-red-600 dark:hover:text-red-400" title="Remove from library" aria-label={`Remove ${name} from library`}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <LibraryCatalog />
    </div>
  );
}
