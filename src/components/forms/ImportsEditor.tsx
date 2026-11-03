/**
 * owl:imports on the ontology: the list of imported ontology IRIs, and for
 * each one whether a copy is loaded as a read-only reference (so its terms'
 * definitions show in hover cards and the Definition drawer).
 * Accepts full IRIs or prefixed names (expanded with the ontology's prefixes).
 */

import { useRef, useState } from "react";
import { Check, FileUp, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { expand } from "../../lib/uri-utils";
import { useReferences } from "../../lib/references/reference-store";

interface Props {
  imports: string[];
  prefixes: Record<string, string>;
  onChange: (imports: string[]) => void;
}

const ABSOLUTE_IRI = /^[a-z][a-z0-9+.-]*:[^\s<>"{}|^`\\]+$/i;

export default function ImportsEditor({ imports, prefixes, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stored = useReferences((s) => s.stored);
  const sources = useReferences((s) => s.sources);
  const fetchInto = useReferences((s) => s.fetchInto);
  const addFromText = useReferences((s) => s.addFromText);
  const remove = useReferences((s) => s.remove);
  const [busy, setBusy] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<string>("");

  const add = () => {
    const value = draft.trim().replace(/^<(.*)>$/, "$1");
    if (!value) return;
    const iri = expand(value, prefixes);
    if (!ABSOLUTE_IRI.test(iri)) return setError("Enter an absolute IRI, e.g. http://purl.org/dc/terms/");
    if (imports.includes(iri)) return setError("Already imported");
    onChange([...imports, iri]);
    setDraft("");
  };

  const fetchImport = async (iri: string, url = iri) => {
    setBusy(iri);
    const outcome = await fetchInto(url, iri);
    setBusy(null);
    setFailures((f) => {
      const next = { ...f };
      if (outcome.ok) delete next[iri];
      else next[iri] = outcome.message;
      return next;
    });
  };

  const loadFile = async (file: File) => {
    const iri = fileTarget.current;
    setBusy(iri);
    try {
      await addFromText(iri, await file.text(), file.name, file.name);
      setFailures((f) => { const next = { ...f }; delete next[iri]; return next; });
    } catch (err) {
      setFailures((f) => ({ ...f, [iri]: `${file.name}: ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setBusy(null);
    }
  };

  const status = (iri: string) => {
    const record = stored.find((r) => r.iri === iri);
    const source = record && sources.find((s) => s.id === record.id);
    return { record, source };
  };
  const extras = stored.filter((r) => !imports.includes(r.iri));
  const action = "flex items-center gap-0.5 rounded px-1 py-0.5 text-th-fg-3 hover:bg-th-hover hover:text-th-fg";

  return (
    <div className="space-y-1.5">
      {imports.map((iri) => {
        const { record, source } = status(iri);
        return (
          <div key={iri} className="group rounded border border-th-border-muted px-2 py-1">
            <div className="flex items-start gap-1">
              <code className="min-w-0 flex-1 break-all font-mono text-2xs text-th-fg-2" title={iri}>{iri}</code>
              <button onClick={() => onChange(imports.filter((i) => i !== iri))} className="rounded p-0.5 text-th-fg-4 opacity-0 hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400" title="Remove import">
                <X size={11} />
              </button>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs">
              {busy === iri ? (
                <span className="flex items-center gap-1 text-th-fg-4"><Loader2 size={10} className="animate-spin" /> Loading…</span>
              ) : record && source ? (
                <>
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check size={10} /> {source.name}</span>
                  <span className="text-th-fg-4">· {source.tripleCount.toLocaleString()} statements · {record.origin.split("/").pop()}</span>
                  {/^https?:/.test(record.origin) && (
                    <button onClick={() => void fetchImport(iri, record.origin)} className={action} title="Fetch again"><RefreshCw size={10} /></button>
                  )}
                  <button onClick={() => void remove(record.id)} className={action} title="Forget the loaded copy">Unload</button>
                </>
              ) : (
                <>
                  <span className="text-th-fg-4">Not loaded — its terms&apos; definitions aren&apos;t available yet</span>
                  <button onClick={() => void fetchImport(iri)} className={action}>Fetch</button>
                  <button onClick={() => { fileTarget.current = iri; fileRef.current?.click(); }} className={action}><FileUp size={10} /> Load file…</button>
                </>
              )}
            </div>
            {failures[iri] && (
              <p className="mt-0.5 text-2xs text-red-600 dark:text-red-400">
                {failures[iri]} — load the file instead, or its direct URL from the term&apos;s Definition panel.
              </p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="http://www.w3.org/ns/prov-o"
          className={`min-w-0 flex-1 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 ${
            error ? "ring-1 ring-red-500" : "focus:ring-blue-500"
          }`}
        />
        <button onClick={add} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Add import">
          <Plus size={12} />
        </button>
      </div>
      {error && <p className="text-2xs text-red-600 dark:text-red-400">{error}</p>}

      {extras.length > 0 && (
        <div className="pt-1">
          <p className="text-2xs text-th-fg-4">Other loaded references (from looking up terms):</p>
          {extras.map((record) => (
            <div key={record.id} className="flex items-center gap-1 text-2xs">
              <span className="min-w-0 flex-1 truncate font-mono text-th-fg-3" title={record.iri}>
                {sources.find((s) => s.id === record.id)?.name ?? record.iri}
              </span>
              <button onClick={() => void remove(record.id)} className={action}>Unload</button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".ttl,.owl,.rdf,.xml,.jsonld,.json,.nt,.n3"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
