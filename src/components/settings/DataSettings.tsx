/**
 * Settings → Data: move settings + library between devices (there's no
 * account or backend), see storage use, clear the library.
 */

import { useEffect, useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { normalizeSettings, useSettings } from "../../lib/settings";
import { useReferences } from "../../lib/references/reference-store";
import type { StoredReference } from "../../lib/persistence";

const FORMAT = "ontorite-settings";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isRecord = (r: unknown): r is StoredReference =>
  !!r && typeof r === "object" && typeof (r as StoredReference).text === "string" && typeof (r as StoredReference).origin === "string";

export default function DataSettings() {
  const settings = useSettings((s) => s.settings);
  const replace = useSettings((s) => s.replace);
  const stored = useReferences((s) => s.stored);
  const importRecords = useReferences((s) => s.importRecords);
  const remove = useReferences((s) => s.remove);
  const [usage, setUsage] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${formatBytes(e.usage)} used${e.quota ? ` of ${formatBytes(e.quota)} available` : ""}`);
    }).catch(() => undefined);
  }, [stored.length]);

  const exportAll = () => {
    const payload = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), settings, library: stored };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ontorite-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importAll = async (file: File) => {
    setMessage(null);
    try {
      const data = JSON.parse(await file.text()) as { format?: string; settings?: unknown; library?: unknown };
      if (data.format !== FORMAT) throw new Error("This isn't an Ontorite settings file.");
      replace(normalizeSettings(data.settings));
      const records = Array.isArray(data.library) ? data.library.filter(isRecord) : [];
      const { added, failed } = await importRecords(records);
      setMessage({
        ok: failed.length === 0,
        text: `Settings restored; ${added} librar${added === 1 ? "y entry" : "y entries"} added or updated.` +
          (failed.length ? ` Couldn't read: ${failed.join(", ")}.` : ""),
      });
    } catch (err) {
      setMessage({ ok: false, text: `${file.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const clearLibrary = async () => {
    for (const record of stored) await remove(record.id);
    setConfirmClear(false);
    setMessage({ ok: true, text: "Library cleared." });
  };

  const button = "flex items-center gap-1 rounded border border-th-border px-2 py-1 text-2xs text-th-fg-2 hover:bg-th-hover";

  return (
    <div className="space-y-4">
      <section className="space-y-1.5" aria-labelledby="transfer-heading">
        <h3 id="transfer-heading" className="text-xs font-semibold text-th-fg-2">Move to another device or browser</h3>
        <p className="text-2xs leading-snug text-th-fg-4">
          Settings and your library are kept in this browser only. Export them to a file and import it elsewhere.
          Your ontologies aren&apos;t included — save or export those as files.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={exportAll} className={button}><Download size={12} /> Export settings and library</button>
          <button onClick={() => fileRef.current?.click()} className={button}><Upload size={12} /> Import…</button>
        </div>
        {message && <p className={`text-2xs ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{message.text}</p>}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importAll(f); e.target.value = ""; }}
        />
      </section>

      <section className="space-y-1.5" aria-labelledby="storage-heading">
        <h3 id="storage-heading" className="text-xs font-semibold text-th-fg-2">Storage</h3>
        <p className="text-2xs text-th-fg-3">
          {usage ?? "Storage use isn't available in this browser."} · {stored.length} librar{stored.length === 1 ? "y entry" : "y entries"}
        </p>
        {stored.length > 0 && (
          confirmClear ? (
            <div className="flex items-center gap-1.5 text-2xs">
              <span className="text-th-fg-2">Remove all {stored.length} from your library?</span>
              <button onClick={() => void clearLibrary()} className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-500">Remove all</button>
              <button onClick={() => setConfirmClear(false)} className="rounded px-2 py-0.5 text-th-fg-3 hover:bg-th-hover">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className={`${button} hover:text-red-600 dark:hover:text-red-400`}>
              <Trash2 size={12} /> Clear library
            </button>
          )
        )}
      </section>
    </div>
  );
}
