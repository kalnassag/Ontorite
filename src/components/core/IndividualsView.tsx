/** The individuals list, as expandable cards. Can be shown in either pane of the split view. */

import { useDeferredValue, useMemo } from "react";
import { useStore, selectActiveOntology } from "../../lib/store";
import IndividualCard from "./IndividualCard";
import type { CardsViewState } from "./ClassesView";

export default function IndividualsView({ search, allExpanded, expandKey }: CardsViewState) {
  const ontology = useStore(selectActiveOntology);
  const query = useDeferredValue(search.trim().toLowerCase());
  const sorted = useMemo(() => {
    const individuals = ontology?.individuals ?? [];
    const matches = query
      ? individuals.filter((ind) => ind.localName.toLowerCase().includes(query) || ind.uri.toLowerCase().includes(query))
      : individuals;
    return [...matches].sort((a, b) => a.localName.localeCompare(b.localName));
  }, [ontology?.individuals, query]);

  if (!ontology) return null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-3 flex items-center gap-3 text-2xs text-th-fg-3">
          <span>{ontology.individuals.length} individuals</span>
          <span>{ontology.classes.length} classes</span>
        </div>
        <div className="space-y-2">
          {sorted.map((ind) => (
            <IndividualCard key={`${ind.id}-${expandKey}`} individual={ind} defaultExpanded={allExpanded} />
          ))}
        </div>
        {sorted.length === 0 && (
          <p className="mt-8 text-center text-sm text-th-fg-4">
            {search ? "No individuals match that filter." : "No individuals found. Import a .ttl file with instance data to see them here."}
          </p>
        )}
      </div>
    </div>
  );
}
