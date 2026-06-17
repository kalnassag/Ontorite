import type { Ontology, OntologyClass, OntologyProperty, ClassExpression } from "../types";

/** Stable stringification of a ClassExpression for equality comparison. */
function classExprToKey(expr: ClassExpression): string {
  if (expr.kind === "class") return expr.uri;
  return `(${[...expr.uris].sort().join("∪")})`;
}

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface ClassDiff {
  status: DiffStatus;
  uri: string;
  left: OntologyClass | null;
  right: OntologyClass | null;
  changes: string[];
}

export interface PropertyDiff {
  status: DiffStatus;
  uri: string;
  left: OntologyProperty | null;
  right: OntologyProperty | null;
  changes: string[];
}

export interface OntologyDiffResult {
  classes: ClassDiff[];
  properties: PropertyDiff[];
  metaChanges: string[];
}

function labelKey(labels: { value: string; lang: string }[]): string {
  return labels
    .map((l) => `${l.value}@${l.lang}`)
    .sort()
    .join("|");
}

function diffClass(left: OntologyClass, right: OntologyClass): string[] {
  const changes: string[] = [];
  if (left.uri !== right.uri) changes.push(`URI: ${left.uri} → ${right.uri}`);
  if (labelKey(left.labels) !== labelKey(right.labels))
    changes.push(`Labels changed`);
  if (labelKey(left.descriptions) !== labelKey(right.descriptions))
    changes.push(`Descriptions changed`);
  const leftParents = [...left.subClassOf].sort().join(",");
  const rightParents = [...right.subClassOf].sort().join(",");
  if (leftParents !== rightParents) changes.push(`subClassOf changed`);
  const leftDisj = [...(left.disjointWith ?? [])].sort().join(",");
  const rightDisj = [...(right.disjointWith ?? [])].sort().join(",");
  if (leftDisj !== rightDisj) changes.push(`disjointWith changed`);
  return changes;
}

function diffProperty(left: OntologyProperty, right: OntologyProperty): string[] {
  const changes: string[] = [];
  if (left.uri !== right.uri) changes.push(`URI: ${left.uri} → ${right.uri}`);
  if (left.type !== right.type) changes.push(`Type: ${left.type} → ${right.type}`);
  if (labelKey(left.labels) !== labelKey(right.labels)) changes.push(`Labels changed`);
  if (labelKey(left.descriptions) !== labelKey(right.descriptions)) changes.push(`Descriptions changed`);
  const leftDomain  = classExprToKey(left.domain);
  const rightDomain = classExprToKey(right.domain);
  if (leftDomain !== rightDomain) changes.push(`Domain: ${leftDomain || "(none)"} → ${rightDomain || "(none)"}`);
  const leftRanges  = [...(left.ranges  ?? [])].map(classExprToKey).sort().join(",");
  const rightRanges = [...(right.ranges ?? [])].map(classExprToKey).sort().join(",");
  if (leftRanges !== rightRanges) changes.push(`Range: ${leftRanges || "(none)"} → ${rightRanges || "(none)"}`);
  if (left.inverseOf !== right.inverseOf) changes.push(`inverseOf changed`);
  if (left.minCardinality !== right.minCardinality) changes.push(`minCardinality: ${left.minCardinality ?? "—"} → ${right.minCardinality ?? "—"}`);
  if (left.maxCardinality !== right.maxCardinality) changes.push(`maxCardinality: ${left.maxCardinality ?? "—"} → ${right.maxCardinality ?? "—"}`);
  if (left.exactCardinality !== right.exactCardinality) changes.push(`exactCardinality: ${left.exactCardinality ?? "—"} → ${right.exactCardinality ?? "—"}`);
  return changes;
}

export function diffOntologies(left: Ontology, right: Ontology): OntologyDiffResult {
  const metaChanges: string[] = [];
  if (left.metadata.baseUri !== right.metadata.baseUri)
    metaChanges.push(`Base URI: ${left.metadata.baseUri} → ${right.metadata.baseUri}`);
  if (left.metadata.ontologyLabel !== right.metadata.ontologyLabel)
    metaChanges.push(`Label: ${left.metadata.ontologyLabel || "(none)"} → ${right.metadata.ontologyLabel || "(none)"}`);

  // Classes
  const leftClsMap = new Map<string, OntologyClass>(left.classes.map((c) => [c.uri, c]));
  const rightClsMap = new Map<string, OntologyClass>(right.classes.map((c) => [c.uri, c]));
  const allClassUris = new Set([...leftClsMap.keys(), ...rightClsMap.keys()]);

  const classes: ClassDiff[] = [];
  for (const uri of allClassUris) {
    const l = leftClsMap.get(uri) ?? null;
    const r = rightClsMap.get(uri) ?? null;
    if (l && !r) {
      classes.push({ status: "removed", uri, left: l, right: null, changes: [] });
    } else if (!l && r) {
      classes.push({ status: "added", uri, left: null, right: r, changes: [] });
    } else if (l && r) {
      const changes = diffClass(l, r);
      classes.push({ status: changes.length > 0 ? "modified" : "unchanged", uri, left: l, right: r, changes });
    }
  }
  classes.sort((a, b) => a.uri.localeCompare(b.uri));

  // Properties
  const leftPropMap = new Map<string, OntologyProperty>(left.properties.map((p) => [p.uri, p]));
  const rightPropMap = new Map<string, OntologyProperty>(right.properties.map((p) => [p.uri, p]));
  const allPropUris = new Set([...leftPropMap.keys(), ...rightPropMap.keys()]);

  const properties: PropertyDiff[] = [];
  for (const uri of allPropUris) {
    const l = leftPropMap.get(uri) ?? null;
    const r = rightPropMap.get(uri) ?? null;
    if (l && !r) {
      properties.push({ status: "removed", uri, left: l, right: null, changes: [] });
    } else if (!l && r) {
      properties.push({ status: "added", uri, left: null, right: r, changes: [] });
    } else if (l && r) {
      const changes = diffProperty(l, r);
      properties.push({ status: changes.length > 0 ? "modified" : "unchanged", uri, left: l, right: r, changes });
    }
  }
  properties.sort((a, b) => a.uri.localeCompare(b.uri));

  return { classes, properties, metaChanges };
}
