/**
 * Card side of the split view (see lib/source-sync.ts): clicking a card
 * reveals its block in the Source pane, and moving the cursor in the Source
 * pane scrolls to and outlines the matching card.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useStore, selectActiveOntology } from "../../lib/store";
import { scrollBehavior, useSourceSync } from "../../lib/source-sync";
import { domainUris } from "../../lib/selectors";

const FLASH_CLASS = "entity-flash";

function cardFor(container: HTMLElement, uri: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-entity-uri="${CSS.escape(uri)}"]`);
}

export function useSourceCardSync(containerRef: RefObject<HTMLElement>, active: boolean) {
  const ontology = useStore(selectActiveOntology);
  // Read at cursor-move time only: edits to the model mustn't re-scroll the cards
  const ontologyRef = useRef(ontology);
  ontologyRef.current = ontology;
  const cursorUri = useSourceSync((s) => s.cursorUri);
  const revealInSource = useSourceSync((s) => s.revealInSource);

  // Source cursor → card
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !cursorUri || !container) return;
    let target = cardFor(container, cursorUri);
    if (!target) {
      // A property in a collapsed (or filtered) card: show its domain class instead
      const property = ontologyRef.current?.properties.find((p) => p.uri === cursorUri);
      for (const uri of property ? domainUris(property) : []) {
        target = cardFor(container, uri);
        if (target) break;
      }
    }
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    target.classList.add(FLASH_CLASS);
    const timer = setTimeout(() => target?.classList.remove(FLASH_CLASS), 1400);
    return () => { clearTimeout(timer); target?.classList.remove(FLASH_CLASS); };
  }, [active, cursorUri, containerRef]);

  // Card click → Source (the innermost entity: a property row wins over its class card)
  return useCallback((e: React.MouseEvent) => {
    if (!active) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-entity-uri]");
    const uri = card?.dataset.entityUri;
    if (uri) revealInSource(uri);
  }, [active, revealInSource]);
}
