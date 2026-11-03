/** Settings → New ontologies: defaults applied when an ontology is created or imported. */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { baseUriFor, useSettings } from "../../lib/settings";
import { STANDARD_PREFIXES } from "../../lib/uri-utils";

const LANG_TAG = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;
const PREFIX = /^[A-Za-z][\w.-]*$/;

export default function NewOntologySettings() {
  const defaults = useSettings((s) => s.settings.newOntology);
  const updateNewOntology = useSettings((s) => s.updateNewOntology);
  const [lang, setLang] = useState(defaults.defaultLanguage);
  const [pattern, setPattern] = useState(defaults.baseUriPattern);
  const [prefix, setPrefix] = useState("");
  const [prefixIri, setPrefixIri] = useState("");
  const [prefixError, setPrefixError] = useState<string | null>(null);

  const langValid = lang.trim() === "" || LANG_TAG.test(lang.trim());

  const addPrefix = () => {
    const name = prefix.trim().replace(/:$/, "");
    const iri = prefixIri.trim().replace(/^<(.*)>$/, "$1");
    if (!PREFIX.test(name)) return setPrefixError("A prefix starts with a letter (letters, digits, - _ .)");
    if (!/^[a-z][a-z0-9+.-]*:\S+$/i.test(iri)) return setPrefixError("Enter the namespace IRI, e.g. https://w3id.org/semanticarts/ns/ontology/gist/");
    if (STANDARD_PREFIXES[name]) return setPrefixError(`${name}: is a standard prefix and is always added`);
    updateNewOntology({ prefixes: { ...defaults.prefixes, [name]: iri } });
    setPrefix(""); setPrefixIri(""); setPrefixError(null);
  };

  const removePrefix = (name: string) => {
    const { [name]: _removed, ...rest } = defaults.prefixes;
    updateNewOntology({ prefixes: rest });
  };

  const input = "rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="default-lang" className="text-xs font-medium text-th-fg-2">Language for new labels</label>
        <input
          id="default-lang"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          onBlur={() => { if (langValid) updateNewOntology({ defaultLanguage: lang.trim() }); }}
          placeholder="none"
          className={`${input} w-28 ${langValid ? "" : "ring-1 ring-red-500"}`}
          aria-invalid={!langValid}
        />
        <p className="text-2xs leading-snug text-th-fg-4">
          Leave empty to create labels and descriptions without a language tag. With a tag (e.g. <code>en</code>), new
          labels get it, and you can still change it on each label. Applies to ontologies created or imported from now on;
          each ontology&apos;s own setting is in its metadata.
        </p>
        {!langValid && <p className="text-2xs text-red-600 dark:text-red-400">Not a language tag (e.g. en, de, en-GB).</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="base-uri-pattern" className="text-xs font-medium text-th-fg-2">Base URI for new ontologies</label>
        <input
          id="base-uri-pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          onBlur={() => updateNewOntology({ baseUriPattern: pattern.trim() || "http://example.org/{name}/" })}
          className={`${input} w-full`}
        />
        <p className="text-2xs leading-snug text-th-fg-4">
          <code>{"{name}"}</code> becomes the ontology&apos;s name. “My Ontology” →{" "}
          <code className="break-all text-th-fg-3">{baseUriFor("My Ontology", pattern.trim() || "http://example.org/{name}/")}</code>
        </p>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-th-fg-2">Extra prefixes</div>
        <p className="text-2xs leading-snug text-th-fg-4">
          Added to every new ontology, alongside the standard ones ({Object.keys(STANDARD_PREFIXES).join(", ")}).
        </p>
        {Object.entries(defaults.prefixes).length > 0 && (
          <ul className="space-y-0.5">
            {Object.entries(defaults.prefixes).map(([name, iri]) => (
              <li key={name} className="flex items-center gap-1.5 text-2xs">
                <code className="w-16 flex-shrink-0 font-mono text-th-fg-2">{name}:</code>
                <code className="min-w-0 flex-1 truncate font-mono text-th-fg-3" title={iri}>{iri}</code>
                <button onClick={() => removePrefix(name)} className="rounded p-0.5 text-th-fg-4 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove prefix ${name}`}>
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1">
          <input value={prefix} onChange={(e) => { setPrefix(e.target.value); setPrefixError(null); }} placeholder="gist" aria-label="Prefix" className={`${input} w-16`} />
          <input
            value={prefixIri}
            onChange={(e) => { setPrefixIri(e.target.value); setPrefixError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") addPrefix(); }}
            placeholder="https://w3id.org/semanticarts/ns/ontology/gist/"
            aria-label="Namespace IRI"
            className={`${input} min-w-0 flex-1`}
          />
          <button onClick={addPrefix} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" aria-label="Add prefix" title="Add prefix">
            <Plus size={12} />
          </button>
        </div>
        {prefixError && <p className="text-2xs text-red-600 dark:text-red-400">{prefixError}</p>}
      </div>
    </div>
  );
}
