/** Every source a term can be looked up in, memoised (see lib/references/reference-store.ts). */

import { useMemo } from "react";
import { useStore } from "../../lib/store";
import { allSources, useReferences } from "../../lib/references/reference-store";

export function useReferenceSources() {
  const ontologies = useStore((s) => s.ontologies);
  const activeId = useStore((s) => s.activeOntologyId);
  const references = useReferences((s) => s.sources);
  return useMemo(() => allSources(ontologies, activeId, references), [ontologies, activeId, references]);
}
