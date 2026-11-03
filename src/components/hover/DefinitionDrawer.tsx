/**
 * Full definition of a term — typically a class or property from an imported
 * ontology (gist, dcat, dcterms, …) — exactly as its source states it, as
 * Turtle. Every term in the definition is a link; Back walks the trail.
 * Mounted once in App; opened from the hover card.
 */

import { useMemo } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import Drawer from "../layout/Drawer";
import { useStore, selectActiveOntology } from "../../lib/store";
import { backDefinition, closeDefinition, followDefinition, useDefinitionDrawer } from "../../lib/hover-card";
import { findDefinition, formatDefinition, summarizeTerm, type ReferenceSource } from "../../lib/references/reference-source";
import { useReferences, workspaceSource } from "../../lib/references/reference-store";
import { COMMON_ONTOLOGIES } from "../../lib/common-ontologies";
import { compact, STANDARD_PREFIXES } from "../../lib/uri-utils";
import { useReferenceSources } from "./useReferenceSources";
import LinkedTurtle from "./LinkedTurtle";
import FindDefinition from "./FindDefinition";

const SOURCE_KIND: Record<ReferenceSource["kind"], string> = {
  reference: "cached reference",
  library: "built-in library",
  workspace: "open in the workspace",
};

export default function DefinitionDrawer() {
  const stack = useDefinitionDrawer((s) => s.stack);
  const uri = stack[stack.length - 1];
  const active = useStore(selectActiveOntology);
  const setActiveOntology = useStore((s) => s.setActiveOntology);
  const importOntologyAsync = useStore((s) => s.importOntologyAsync);
  const importOntology = useStore((s) => s.importOntology);
  const stored = useReferences((s) => s.stored);
  const others = useReferenceSources();

  // The active ontology first, so its own terms are shown from it
  const sources = useMemo(() => (active ? [workspaceSource(active), ...others] : others), [active, others]);
  const found = uri ? findDefinition(uri, sources) : null;
  const prefixes = { ...STANDARD_PREFIXES, ...(found?.source.prefixes ?? {}), ...(active?.metadata.prefixes ?? {}) };
  const summary = found ? summarizeTerm(found.triples) : null;
  const previous = stack.length > 1 ? stack[stack.length - 2] : undefined;

  const openSource = async (source: ReferenceSource) => {
    if (source.kind === "workspace") {
      setActiveOntology(source.id.replace(/^workspace:/, ""));
    } else if (source.kind === "library") {
      const lib = COMMON_ONTOLOGIES.find((l) => `library:${l.id}` === source.id);
      if (lib) importOntology(lib.turtle, `${lib.id}.ttl`, { recordFileName: false });
    } else {
      const record = stored.find((r) => r.id === source.id);
      if (record) await importOntologyAsync(record.text, record.origin.split("/").pop() || record.formatHint);
    }
    closeDefinition();
  };

  return (
    <Drawer
      open={!!uri}
      onClose={closeDefinition}
      title={summary?.label || (uri ? compact(uri, prefixes) : "")}
      subtitle={uri}
      width={560}
    >
      {uri && (
        <div className="space-y-3 text-xs">
          {previous && (
            <button onClick={backDefinition} className="flex items-center gap-1 text-th-fg-3 hover:text-th-fg">
              <ArrowLeft size={12} /> Back to {compact(previous, prefixes)}
            </button>
          )}

          {found && summary ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-th-fg-3">
                {summary.kind && <span className="rounded bg-blue-600/15 px-1.5 py-0.5 text-2xs font-medium text-blue-700 dark:text-blue-400">{summary.kind}</span>}
                <span>
                  Defined in <span className="font-medium text-th-fg-2">{found.source.id === `workspace:${active?.id}` ? "this ontology" : found.source.name}</span>
                </span>
                <span className="text-2xs text-th-fg-4">({SOURCE_KIND[found.source.kind]} · {found.source.origin})</span>
              </div>
              {summary.description && <p className="whitespace-pre-line leading-snug text-th-fg-2">{summary.description}</p>}
              <LinkedTurtle text={formatDefinition(uri, found.source)} prefixes={prefixes} onFollow={followDefinition} />
              {found.source.id !== `workspace:${active?.id}` && (
                <button
                  onClick={() => void openSource(found.source)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  title="Open the whole source ontology as an ontology in the workspace (read and edit it like any other)"
                >
                  <FolderOpen size={12} />
                  {found.source.kind === "workspace" ? `Switch to ${found.source.name}` : `Open ${found.source.name} in the workspace`}
                </button>
              )}
            </>
          ) : (
            <FindDefinition key={uri} uri={uri} imports={active?.metadata.imports ?? []} />
          )}
        </div>
      )}
    </Drawer>
  );
}
