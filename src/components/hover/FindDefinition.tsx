/**
 * Shown when a term's definition isn't in any loaded source: tries the
 * active ontology's owl:imports and the term's namespace (caching what it
 * fetches), reports each step, and offers a manual load when servers block
 * the browser.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, FileUp, Globe, Loader2, X } from "lucide-react";
import { libraryEntryFor, useReferences, type AddOptions } from "../../lib/references/reference-store";
import { resolveTerm, type ResolveStep } from "../../lib/references/resolve-term";
import { candidateUrls } from "../../lib/references/reference-fetch";
import { catalogEntryFor } from "../../lib/references/catalog";
import { openSettings } from "../../lib/settings";

const OUTCOME_TEXT: Record<ResolveStep["outcome"], string> = {
  found: "found it",
  "fetched-not-here": "loaded, but it doesn't define this term",
  blocked: "blocked — the server doesn't let browsers read it (CORS), or it's unreachable",
  http: "failed",
  "not-rdf": "not an ontology file",
  "already-cached": "already loaded",
};

export default function FindDefinition({ uri, imports }: { uri: string; imports: string[] }) {
  const stored = useReferences((s) => s.stored);
  const sources = useReferences((s) => s.sources);
  const addFromText = useReferences((s) => s.addFromText);
  const fetchInto = useReferences((s) => s.fetchInto);
  const [steps, setSteps] = useState<ResolveStep[]>([]);
  const [searching, setSearching] = useState(true);
  const [manualError, setManualError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A known ontology (catalogue) is filed under its own name; else under the first import not loaded yet
  const entry = catalogEntryFor(uri);
  const pendingImport = imports.find((i) => !libraryEntryFor(i, stored, sources));
  const addOptions: AddOptions = entry
    ? { iri: entry.ontologyIri, catalogId: entry.id, name: entry.name, prefix: entry.prefix }
    : pendingImport ? { iri: pendingImport } : {};
  const [url, setUrl] = useState(() => candidateUrls(uri, imports)[0] ?? "");

  useEffect(() => {
    let cancelled = false;
    setSteps([]);
    setSearching(true);
    void resolveTerm(uri, imports, (step) => { if (!cancelled) setSteps((s) => [...s, step]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search once per term
  }, [uri]);

  const loadFile = async (file: File) => {
    setManualError(null);
    setBusy(true);
    try {
      await addFromText(await file.text(), file.name, file.name, addOptions);
    } catch (err) {
      setManualError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const loadUrl = async () => {
    setManualError(null);
    setBusy(true);
    const outcome = await fetchInto(url.trim(), addOptions);
    setBusy(false);
    if (!outcome.ok) setManualError(`${outcome.url}: ${outcome.message}`);
  };

  return (
    <div className="space-y-3 text-xs">
      <p className="text-th-fg-3">
        This term isn&apos;t defined in this ontology, the others you have open, or your library.
        {searching ? " Looking for it…" : ""}
      </p>

      {steps.length > 0 && (
        <ul className="space-y-1">
          {steps.map((step) => (
            <li key={step.url} className="flex items-start gap-1.5">
              {step.outcome === "found" || step.outcome === "already-cached"
                ? <Check size={12} className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                : <X size={12} className="mt-0.5 flex-shrink-0 text-th-fg-4" />}
              <span className="min-w-0">
                <span className="break-all font-mono text-2xs text-th-fg-2">{step.url}</span>
                <span className="text-th-fg-4"> — {step.message && step.outcome === "http" ? step.message : OUTCOME_TEXT[step.outcome]}</span>
              </span>
            </li>
          ))}
          {searching && <li className="flex items-center gap-1.5 text-th-fg-4"><Loader2 size={12} className="animate-spin" /> trying…</li>}
        </ul>
      )}

      {!searching && (
        <div className="space-y-2 rounded border border-th-border-muted p-2.5">
          <p className="font-medium text-th-fg-2">Load the ontology that defines it</p>
          <p className="text-2xs text-th-fg-4">
            It&apos;s added to your library as a read-only reference (not to your workspace) and reused for every term it defines.
            {entry && <> This term is from <span className="font-medium text-th-fg-3">{entry.name}</span>.</>}
          </p>
          {entry && (
            <a href={entry.homepage} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-2xs text-blue-700 hover:underline dark:text-blue-400">
              <ExternalLink size={10} /> Get {entry.name} from its homepage
            </a>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <FileUp size={12} /> From a file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".ttl,.owl,.rdf,.xml,.jsonld,.json,.nt,.n3"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Globe size={12} className="flex-shrink-0 text-th-fg-4" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void loadUrl(); }}
              placeholder="https://raw.githubusercontent.com/…/ontology.ttl"
              className="min-w-0 flex-1 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={() => void loadUrl()} disabled={busy || !url.trim()} className="rounded px-2 py-1 text-th-fg-2 hover:bg-th-hover disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : "Fetch"}
            </button>
          </div>
          <p className="text-2xs text-th-fg-4">
            Tip: a direct link to the file often works when the ontology&apos;s own address is blocked — e.g. a raw GitHub URL.
          </p>
          {manualError && <p className="text-2xs text-red-600 dark:text-red-400">{manualError}</p>}
          <button onClick={() => openSettings("library")} className="text-2xs text-th-fg-3 hover:text-th-fg hover:underline">
            Manage your library…
          </button>
        </div>
      )}
    </div>
  );
}
