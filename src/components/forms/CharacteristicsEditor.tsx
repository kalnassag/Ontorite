/**
 * Checkbox row for OWL property characteristics. Edits the property form's
 * extra-triples list (prefixed form) by adding/removing rdf:type triples.
 */

import type { ExtraTriple, PropertyType } from "../../types";
import { CHARACTERISTICS, hasCharacteristic, toggleCharacteristic } from "../../lib/characteristics";
import { compact, expand } from "../../lib/uri-utils";
import { RDF } from "../../lib/vocab";

interface Props {
  propType: PropertyType;
  /** The form's extra triples, in prefixed (display) form */
  values: ExtraTriple[];
  onChange: (values: ExtraTriple[]) => void;
  prefixes: Record<string, string>;
}

export default function CharacteristicsEditor({ propType, values, onChange, prefixes }: Props) {
  const applicable = CHARACTERISTICS.filter((ch) => ch.appliesTo.includes(propType));
  if (applicable.length === 0) return null;
  const toFull = (s: string) => expand(s, prefixes);

  return (
    <div>
      <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
        Characteristics
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {applicable.map((ch) => {
          const checked = hasCharacteristic(values, ch.iri, toFull);
          return (
            <label key={ch.iri} className="flex items-center gap-1 text-xs text-th-fg-2" title={compact(ch.iri, prefixes)}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  onChange(toggleCharacteristic(values, ch.iri, e.target.checked, toFull, {
                    predicate: compact(RDF.type, prefixes),
                    object: compact(ch.iri, prefixes),
                    isLiteral: false,
                  }))
                }
                className="h-3 w-3 accent-blue-600"
              />
              {ch.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
