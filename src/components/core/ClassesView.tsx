/**
 * The class list: every class as a card with its properties nested beneath,
 * then unassigned properties and other statements. Can be shown in either
 * pane of the split view.
 */

import { useDeferredValue, useMemo, useRef, type RefObject } from "react";
import { Plus } from "lucide-react";
import { useStore, selectActiveOntology } from "../../lib/store";
import { propertiesByDomain as propertiesByDomainOf } from "../../lib/selectors";
import type { OntologyProperty } from "../../types";
import ClassCard from "./ClassCard";
import ClassForm from "../forms/ClassForm";
import UnassignedProperties from "./UnassignedProperties";
import OtherStatements from "./OtherStatements";

export interface CardsViewState {
  search: string;
  allExpanded: boolean;
  /** Bumped by Expand / Collapse all so cards take the new default */
  expandKey: number;
}

interface Props extends CardsViewState {
  highlightedClassId: string | null;
  addingClass: boolean;
  setAddingClass: (adding: boolean) => void;
  addPropertyRequest: { classId: string; n: number } | null;
  onDelete: (label: string) => void;
  unassignedRef: RefObject<HTMLDivElement>;
  otherStatementsRef: RefObject<HTMLDivElement>;
}

export default function ClassesView(props: Props) {
  const ontology = useStore(selectActiveOntology);
  const { search, allExpanded, expandKey } = props;

  // Per-class property lists are kept referentially stable across edits, so the
  // memoised ClassCards only re-render when their own properties change.
  const previous = useRef(new Map<string, OntologyProperty[]>());
  const propertiesByDomain = useMemo(() => {
    const next = ontology ? propertiesByDomainOf(ontology) : new Map<string, OntologyProperty[]>();
    for (const [classId, list] of next) {
      const prev = previous.current.get(classId);
      if (prev && prev.length === list.length && prev.every((p, i) => p === list[i])) next.set(classId, prev);
    }
    previous.current = next;
    return next;
  }, [ontology?.classes, ontology?.properties]); // eslint-disable-line react-hooks/exhaustive-deps -- only these two arrays feed the grouping

  // One per subject block in Other statements (blank nodes nested in another
  // statement don't get their own block)
  const otherStatementCount = useMemo(() => {
    const triples = ontology?.unmappedTriples ?? [];
    const referenced = new Set(triples.filter((t) => !t.isLiteral).map((t) => t.object));
    return new Set(triples.filter((t) => !t.subject.startsWith("_:") || !referenced.has(t.subject)).map((t) => t.subject)).size;
  }, [ontology?.unmappedTriples]);

  // Filtering runs against a deferred copy of the query so typing stays responsive
  const query = useDeferredValue(search.trim().toLowerCase());
  const sortedClasses = useMemo(() => {
    const classes = ontology?.classes ?? [];
    // A class matches on its own labels/local name or on any property nested under it
    const hit = (localName: string, labels: { value: string }[]) =>
      localName.toLowerCase().includes(query) || labels.some((l) => l.value.toLowerCase().includes(query));
    const matches = query
      ? classes.filter((cls) => hit(cls.localName, cls.labels) || (propertiesByDomain.get(cls.id) ?? []).some((p) => hit(p.localName, p.labels)))
      : classes;
    return [...matches].sort((a, b) => a.localName.localeCompare(b.localName));
  }, [ontology?.classes, propertiesByDomain, query]);

  if (!ontology) return null;
  const individualsCount = ontology.individuals.length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-3 flex items-center gap-3 text-2xs text-th-fg-3">
          <span>{ontology.classes.length} classes</span>
          <span>{ontology.properties.length} properties</span>
          {individualsCount > 0 && <span className="text-purple-600 dark:text-purple-400">{individualsCount} individuals</span>}
          {otherStatementCount > 0 && (
            <button
              onClick={() => props.otherStatementsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="rounded hover:text-th-fg-2 hover:underline"
              title="Statements about subjects that aren't entities of this ontology"
            >
              {otherStatementCount} other statement{otherStatementCount === 1 ? "" : "s"} →
            </button>
          )}
        </div>

        {props.addingClass ? (
          <div className="mb-3">
            <ClassForm onDone={() => props.setAddingClass(false)} />
          </div>
        ) : (
          <button onClick={() => props.setAddingClass(true)} className="mb-3 flex items-center gap-1 text-xs text-th-fg-3 hover:text-blue-600 dark:hover:text-blue-400">
            <Plus size={13} />
            Add class
          </button>
        )}

        <div className="space-y-2">
          {sortedClasses.map((cls) => (
            <ClassCard
              key={`${cls.id}-${expandKey}`}
              cls={cls}
              properties={propertiesByDomain.get(cls.id) ?? []}
              defaultExpanded={allExpanded}
              highlighted={props.highlightedClassId === cls.id}
              onDelete={props.onDelete}
              search={query}
              addPropertyRequest={props.addPropertyRequest?.classId === cls.id ? props.addPropertyRequest.n : 0}
            />
          ))}
        </div>

        {sortedClasses.length === 0 && !props.addingClass && (
          <p className="mt-8 text-center text-sm text-th-fg-4">
            {search ? "No classes match that filter." : "No classes yet. Add one above."}
          </p>
        )}

        <div ref={props.unassignedRef}>
          <UnassignedProperties />
        </div>
        <OtherStatements ref={props.otherStatementsRef} />
      </div>
    </div>
  );
}
