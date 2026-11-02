/**
 * Class pickers in a form: turn typed text into class IRIs (never raw text),
 * remember classes that don't exist yet so they're created on save, and
 * surface resolution errors next to the picker.
 */

import { useState } from "react";
import type { OntologyClass } from "../../types";
import { resolveClassReference, resolveIri, type NewClassSpec } from "../../lib/class-refs";

export function useClassRefs(classes: OntologyClass[], baseUri: string, prefixes: Record<string, string>) {
  const [newClasses, setNewClasses] = useState<NewClassSpec[]>([]);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  /** Resolve picker text to a class IRI, or null (with an error shown for `field`). */
  const resolveClass = (text: string, field: string): string | null => {
    const ref = resolveClassReference(text, { classes, baseUri, prefixes });
    if (!ref.ok) {
      setError({ field, message: ref.error });
      return null;
    }
    setError(null);
    const created = ref.newClass;
    if (created) setNewClasses((prev) => (prev.some((c) => c.uri === created.uri) ? prev : [...prev, created]));
    return ref.uri;
  };

  /** Resolve a datatype / annotation IRI (prefixed name or absolute IRI). */
  const resolveValue = (text: string, field: string): string | null => {
    const ref = resolveIri(text, prefixes);
    if (!ref.ok) {
      setError({ field, message: ref.error });
      return null;
    }
    setError(null);
    return ref.uri;
  };

  /** Display label for a class IRI, including classes that will be created on save. */
  const classLabel = (uri: string): string | undefined => {
    const cls = classes.find((c) => c.uri === uri);
    if (cls) return cls.labels[0]?.value || cls.localName;
    const pending = newClasses.find((c) => c.uri === uri);
    return pending ? `${pending.label} (new)` : undefined;
  };

  /** New classes still referenced by the form, to create on save. */
  const newClassesFor = (referenced: Iterable<string>): NewClassSpec[] => {
    const used = new Set(referenced);
    return newClasses.filter((c) => used.has(c.uri));
  };

  const errorFor = (field: string) => (error?.field === field ? error.message : null);

  return { resolveClass, resolveValue, classLabel, newClassesFor, errorFor };
}
