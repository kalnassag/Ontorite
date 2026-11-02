/**
 * The single, app-wide hover card for class / property names (see ClassHover).
 * Shows label variants, descriptions and the IRI (prefixed + full, copyable).
 * Mounted once in App; positioned next to the hovered name, flipped above it
 * when there's no room below, and kept open while the pointer is over it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import type { LangString, Ontology } from "../../types";
import { useStore, selectActiveOntology } from "../../lib/store";
import { dismissHoverCard, hideHoverCard, keepHoverCard, useHoverCard } from "../../lib/hover-card";
import { compact, STANDARD_PREFIXES } from "../../lib/uri-utils";
import { classExprFormat } from "../../types";
import { NS } from "../../lib/vocab";
import { domainUris } from "../../lib/selectors";

const WIDTH = 360;
const GAP = 6;

type Described =
  | { kind: "class" | "property"; badge: string; badgeClass: string; title: string; labels: LangString[]; descriptions: LangString[]; facts: Array<[string, string]> }
  | { kind: "individual"; badge: string; badgeClass: string; title: string; labels: []; descriptions: []; facts: Array<[string, string]> }
  | { kind: "datatype" | "external"; badge: string; badgeClass: string; title: string; labels: []; descriptions: []; facts: [] };

const PROPERTY_BADGE: Record<string, [string, string]> = {
  "owl:ObjectProperty": ["Object property", "bg-prop-object-700 text-prop-object-100"],
  "owl:DatatypeProperty": ["Datatype property", "bg-prop-datatype-700 text-prop-datatype-100"],
  "owl:AnnotationProperty": ["Annotation property", "bg-prop-annotation-700 text-prop-annotation-100"],
};

function describe(uri: string, onto: Ontology | undefined): Described {
  const prefixes = { ...STANDARD_PREFIXES, ...(onto?.metadata.prefixes ?? {}) };
  const name = (u: string) => {
    const cls = onto?.classes.find((c) => c.uri === u);
    return cls ? cls.labels[0]?.value || cls.localName : compact(u, prefixes);
  };
  const cls = onto?.classes.find((c) => c.uri === uri);
  if (cls) {
    const facts: Array<[string, string]> = [];
    if (cls.subClassOf.length) facts.push(["Subclass of", cls.subClassOf.map(name).join(", ")]);
    if (cls.disjointWith.length) facts.push(["Disjoint with", cls.disjointWith.map(name).join(", ")]);
    return {
      kind: "class", badge: "Class", badgeClass: "bg-blue-600/20 text-blue-500",
      title: cls.labels[0]?.value || cls.localName, labels: cls.labels, descriptions: cls.descriptions, facts,
    };
  }
  const prop = onto?.properties.find((p) => p.uri === uri);
  if (prop) {
    const [badge, badgeClass] = PROPERTY_BADGE[prop.type]!;
    const facts: Array<[string, string]> = [];
    if (domainUris(prop).length) facts.push(["Domain", classExprFormat(prop.domain, name)]);
    if (prop.ranges.length) facts.push(["Range", prop.ranges.map((r) => classExprFormat(r, name)).join(", ")]);
    return {
      kind: "property", badge, badgeClass,
      title: prop.labels[0]?.value || prop.localName, labels: prop.labels, descriptions: prop.descriptions, facts,
    };
  }
  const ind = onto?.individuals.find((i) => i.uri === uri);
  if (ind) {
    const facts: Array<[string, string]> = ind.typeUris.length ? [["Type", ind.typeUris.map(name).join(", ")]] : [];
    if (ind.propertyValues.length) facts.push(["Assertions", String(ind.propertyValues.length)]);
    return {
      kind: "individual", badge: "Individual", badgeClass: "bg-purple-500/15 text-purple-500",
      title: ind.localName, labels: [], descriptions: [], facts,
    };
  }
  if (uri.startsWith(NS.xsd) || uri.startsWith(NS.rdf + "langString")) {
    return { kind: "datatype", badge: "Datatype", badgeClass: "bg-prop-datatype-700/30 text-prop-datatype-500", title: compact(uri, prefixes), labels: [], descriptions: [], facts: [] };
  }
  return { kind: "external", badge: "Not defined here", badgeClass: "bg-th-hover text-th-fg-3", title: compact(uri, prefixes), labels: [], descriptions: [], facts: [] };
}

export default function HoverCardHost() {
  const target = useHoverCard((s) => s.target);
  const active = useStore(selectActiveOntology);
  const ontologies = useStore((s) => s.ontologies);
  const ontology = (target?.ontologyId && ontologies.find((o) => o.id === target.ontologyId)) || active;
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Place below the anchor, or above when it would overflow the viewport
  useLayoutEffect(() => {
    if (!target || !cardRef.current) { setPos(null); return; }
    const height = cardRef.current.offsetHeight;
    const left = Math.max(8, Math.min(target.rect.left, window.innerWidth - WIDTH - 8));
    const below = target.rect.bottom + GAP;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, target.rect.top - GAP - height) : below;
    setPos({ left, top });
    setCopied(false);
  }, [target]);

  // Close on scroll, Escape, or a click elsewhere — the anchor may have moved
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissHoverCard(); };
    const onDown = (e: MouseEvent) => { if (!cardRef.current?.contains(e.target as Node)) dismissHoverCard(); };
    window.addEventListener("scroll", dismissHoverCard, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", dismissHoverCard, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [target]);

  if (!target) return null;
  const info = describe(target.uri, ontology);
  const prefixes = { ...STANDARD_PREFIXES, ...(ontology?.metadata.prefixes ?? {}) };
  const short = compact(target.uri, prefixes);
  const otherLabels = info.labels.slice(1);
  const descriptions = info.descriptions.filter((d) => d.value.trim());

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      onMouseEnter={keepHoverCard}
      onMouseLeave={hideHoverCard}
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className="fixed z-[60] space-y-1.5 rounded border border-th-border bg-th-surface p-2.5 text-xs shadow-xl animate-fade-in motion-reduce:animate-none"
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-th-fg">{info.title}</span>
        <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${info.badgeClass}`}>{info.badge}</span>
      </div>
      {otherLabels.length > 0 && (
        <div className="flex flex-wrap gap-x-2 text-2xs text-th-fg-3">
          {otherLabels.map((l, i) => <span key={i}>“{l.value}”{l.lang && <span className="text-th-fg-4">@{l.lang}</span>}</span>)}
        </div>
      )}

      <div className="space-y-0.5 rounded bg-th-input px-2 py-1">
        {/* Prefixed form, unless it's already the title (external terms) or there isn't one */}
        {short !== `<${target.uri}>` && short !== info.title && <div className="font-mono text-2xs text-th-fg-2">{short}</div>}
        <div className="flex items-start gap-1">
          <span className="min-w-0 flex-1 select-all break-all font-mono text-2xs text-th-fg-3">{target.uri}</span>
          <button
            onClick={() => { void navigator.clipboard?.writeText(target.uri); setCopied(true); }}
            className="flex-shrink-0 rounded p-0.5 text-th-fg-4 hover:text-th-fg-2"
            title="Copy IRI"
          >
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {(info.kind === "class" || info.kind === "property") && (
        descriptions.length > 0 ? (
          <div className="space-y-1">
            {descriptions.map((d, i) => (
              <p key={i} className="whitespace-pre-line leading-snug text-th-fg-2">
                {d.value}
                {d.lang && descriptions.length > 1 && <span className="ml-1 text-2xs text-th-fg-4">@{d.lang}</span>}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-2xs italic text-th-fg-4">No description (rdfs:comment)</p>
        )
      )}
      {info.kind === "external" && (
        <p className="text-2xs text-th-fg-4">Not a class or property of this ontology — from an import or an external vocabulary.</p>
      )}

      {info.facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-th-border-muted pt-1.5 text-2xs">
          {info.facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-th-fg-4">{k}</dt>
              <dd className="min-w-0 truncate text-th-fg-2" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>,
    document.body,
  );
}
