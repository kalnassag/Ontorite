/**
 * Adding to the library: the catalogue of common ontologies, or your own
 * (a file, or a link to one).
 */

import { useRef, useState } from "react";
import { Check, ExternalLink, FileUp, Globe, Loader2, Plus } from "lucide-react";
import { isCatalogEntryInstalled, useReferences, type AddOptions } from "../../lib/references/reference-store";
import { CATALOG, type CatalogEntry } from "../../lib/references/catalog";

const GROUPS = [...new Set(CATALOG.map((e) => e.group))];
const ACCEPT = ".ttl,.owl,.rdf,.xml,.jsonld,.json,.nt,.n3";

export default function LibraryCatalog() {
  const stored = useReferences((s) => s.stored);
  const sources = useReferences((s) => s.sources);
  const addFromCatalog = useReferences((s) => s.addFromCatalog);
  const addFromText = useReferences((s) => s.addFromText);
  const fetchInto = useReferences((s) => s.fetchInto);
  const [busy, setBusy] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [url, setUrl] = useState("");
  const [ownMessage, setOwnMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Which catalogue entry a chosen file is for ("" = your own) */
  const fileFor = useRef<CatalogEntry | null>(null);

  const setFailure = (id: string, message: string | null) =>
    setFailures((f) => {
      const next = { ...f };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });

  const add = async (entry: CatalogEntry) => {
    setBusy(entry.id);
    const outcome = await addFromCatalog(entry);
    setBusy(null);
    setFailure(entry.id, outcome.ok ? null : outcome.message);
  };

  const loadFile = async (file: File) => {
    const entry = fileFor.current;
    const opts: AddOptions = entry ? { iri: entry.ontologyIri, catalogId: entry.id, name: entry.name, prefix: entry.prefix } : {};
    setBusy(entry?.id ?? "own");
    try {
      const source = await addFromText(await file.text(), file.name, file.name, opts);
      if (entry) setFailure(entry.id, null);
      else setOwnMessage({ ok: true, text: `Added ${source.name} (${source.tripleCount.toLocaleString()} statements).` });
    } catch (err) {
      const message = `${file.name}: ${err instanceof Error ? err.message : String(err)}`;
      if (entry) setFailure(entry.id, message);
      else setOwnMessage({ ok: false, text: message });
    } finally {
      setBusy(null);
    }
  };

  const chooseFile = (entry: CatalogEntry | null) => {
    fileFor.current = entry;
    fileRef.current?.click();
  };

  const addUrl = async () => {
    const target = url.trim();
    if (!target) return;
    setBusy("own");
    setOwnMessage(null);
    const outcome = await fetchInto(target);
    setBusy(null);
    if (outcome.ok) {
      setUrl("");
      setOwnMessage({ ok: true, text: `Added from ${outcome.url}.` });
    } else {
      setOwnMessage({ ok: false, text: outcome.message });
    }
  };

  const action = "flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg";

  return (
    <>
      <section aria-labelledby="own-heading" className="space-y-1.5">
        <h3 id="own-heading" className="text-xs font-semibold text-th-fg-2">Add your own</h3>
        <div className="flex items-center gap-1">
          <Globe size={12} className="flex-shrink-0 text-th-fg-4" aria-hidden />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addUrl(); }}
            placeholder="Link to an ontology file (Turtle, RDF/XML, JSON-LD, N-Triples)"
            aria-label="Link to an ontology file"
            className="min-w-0 flex-1 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => void addUrl()} disabled={!url.trim() || busy === "own"} className="rounded px-2 py-1 text-2xs text-th-fg-2 hover:bg-th-hover disabled:opacity-50">
            {busy === "own" ? <Loader2 size={12} className="animate-spin" /> : "Add"}
          </button>
          <button onClick={() => chooseFile(null)} className="flex items-center gap-1 rounded px-2 py-1 text-2xs text-th-fg-2 hover:bg-th-hover">
            <FileUp size={12} /> File…
          </button>
        </div>
        <p className="text-2xs leading-snug text-th-fg-4">
          A link must let browsers download it; raw GitHub links (raw.githubusercontent.com) always do.
        </p>
        {ownMessage && (
          <p className={`text-2xs ${ownMessage.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{ownMessage.text}</p>
        )}
      </section>

      <section aria-labelledby="catalog-heading" className="space-y-2">
        <h3 id="catalog-heading" className="text-xs font-semibold text-th-fg-2">Common ontologies</h3>
        {GROUPS.map((group) => (
          <div key={group}>
            <h4 className="mb-0.5 text-2xs font-semibold uppercase tracking-wide text-th-fg-4">{group}</h4>
            <ul className="divide-y divide-th-border-muted rounded border border-th-border-muted">
              {CATALOG.filter((e) => e.group === group).map((entry) => {
                const installed = isCatalogEntryInstalled(entry, stored, sources);
                return (
                  <li key={entry.id} className="px-2 py-1.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className="text-xs font-medium text-th-fg">{entry.name}</span>
                          <code className="font-mono text-2xs text-th-fg-3">{entry.prefix}:</code>
                          <a href={entry.homepage} target="_blank" rel="noreferrer" className="text-th-fg-4 hover:text-th-fg" title="Homepage" aria-label={`${entry.name} homepage`}>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                        <p className="text-2xs leading-snug text-th-fg-4">{entry.description}</p>
                      </div>
                      {installed ? (
                        <span className="flex flex-shrink-0 items-center gap-1 text-2xs text-emerald-700 dark:text-emerald-400"><Check size={11} /> In library</span>
                      ) : busy === entry.id ? (
                        <Loader2 size={12} className="m-1 flex-shrink-0 animate-spin text-th-fg-4" />
                      ) : (
                        <button onClick={() => void add(entry)} className="flex flex-shrink-0 items-center gap-0.5 rounded bg-blue-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-500" aria-label={`Add ${entry.name} to library`}>
                          <Plus size={11} /> Add
                        </button>
                      )}
                    </div>
                    {failures[entry.id] && !installed && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-2xs text-red-600 dark:text-red-400">{failures[entry.id]}</p>
                        <div className="flex items-center gap-1">
                          <a href={entry.homepage} target="_blank" rel="noreferrer" className={action}><ExternalLink size={10} /> Homepage</a>
                          <button onClick={() => chooseFile(entry)} className={action}><FileUp size={10} /> Load the file…</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }}
      />
    </>
  );
}
