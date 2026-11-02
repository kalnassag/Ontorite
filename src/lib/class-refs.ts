/**
 * Turning what a user types into a class picker into a class IRI.
 *
 * Text is never stored as-is: a bare word like "Vehicle" would otherwise be
 * exported as the relative IRI <Vehicle> and never match the class later
 * created as {base}Vehicle.
 */

import type { OntologyClass } from "../types";
import { buildUri, expand, toPascalCase } from "./uri-utils";

export interface ClassRefContext {
  classes: OntologyClass[];
  baseUri: string;
  prefixes: Record<string, string>;
}

/** A class that doesn't exist yet and will be created on save. */
export interface NewClassSpec {
  uri: string;
  localName: string;
  label: string;
}

export type ClassRef =
  | { ok: true; uri: string; newClass?: NewClassSpec }
  | { ok: false; error: string };

/** Schemes accepted as absolute IRIs even though they look like `prefix:local`. */
const IRI_SCHEMES = /^(https?|urn|tag|mailto|file|ftp|did):/i;

export const isAbsoluteIri = (value: string): boolean => /^[a-z][a-z0-9+.-]*:\S+$/i.test(value);

/**
 * Resolve picker text to a class IRI:
 *  - `<…>` or an absolute IRI → as-is
 *  - `prefix:local` with a known prefix → expanded
 *  - the label or local name of an existing class (case-insensitive) → that class
 *  - anything else → a new local class, {base}PascalCase(text)
 */
export function resolveClassReference(text: string, ctx: ClassRefContext): ClassRef {
  const raw = text.trim().replace(/^<(.*)>$/, "$1").trim();
  if (!raw) return { ok: false, error: "Empty class name" };

  const colon = raw.indexOf(":");
  if (colon >= 0 && !/\s/.test(raw)) {
    const prefix = raw.slice(0, colon);
    if (prefix in ctx.prefixes) return { ok: true, uri: expand(raw, ctx.prefixes) };
    if (IRI_SCHEMES.test(raw)) return { ok: true, uri: raw };
    return { ok: false, error: `Unknown prefix "${prefix}:" — add it to the prefix map or use a full IRI` };
  }

  const lower = raw.toLowerCase();
  const existing = ctx.classes.find((cls) =>
    cls.localName.toLowerCase() === lower || cls.labels.some((l) => l.value.trim().toLowerCase() === lower));
  if (existing) return { ok: true, uri: existing.uri };

  const localName = toPascalCase(raw) || raw.replace(/\s+/g, "");
  const uri = buildUri(ctx.baseUri, localName);
  const byUri = ctx.classes.find((cls) => cls.uri === uri);
  if (byUri) return { ok: true, uri: byUri.uri };
  return { ok: true, uri, newClass: { uri, localName, label: raw } };
}

/** Resolve a non-class IRI field (datatype range, annotation range): prefixed names or absolute IRIs only. */
export function resolveIri(text: string, prefixes: Record<string, string>): { ok: true; uri: string } | { ok: false; error: string } {
  const raw = text.trim().replace(/^<(.*)>$/, "$1").trim();
  if (!raw) return { ok: false, error: "Empty value" };
  const colon = raw.indexOf(":");
  if (colon > 0 && raw.slice(0, colon) in prefixes) return { ok: true, uri: expand(raw, prefixes) };
  if (colon === 0 && "" in prefixes) return { ok: true, uri: expand(raw, prefixes) };
  if (isAbsoluteIri(raw) && !/\s/.test(raw)) return { ok: true, uri: raw };
  return { ok: false, error: "Enter a prefixed name (xsd:string) or a full IRI" };
}

/**
 * Repair a stored reference that isn't an IRI (saved by older versions):
 * a known prefixed name is expanded, a bare name resolves to the matching
 * class or to {base}name. Absolute IRIs and blank nodes are returned unchanged.
 */
export function repairReference(value: string, ctx: ClassRefContext): string {
  if (!value || value.startsWith("_:")) return value;
  const colon = value.indexOf(":");
  if (colon >= 0) {
    const prefix = value.slice(0, colon);
    if (prefix in ctx.prefixes && !value.includes("//")) return expand(value, ctx.prefixes);
    return value;
  }
  const lower = value.trim().toLowerCase();
  const existing = ctx.classes.find((cls) =>
    cls.localName.toLowerCase() === lower || cls.labels.some((l) => l.value.trim().toLowerCase() === lower));
  return existing ? existing.uri : buildUri(ctx.baseUri, value.trim().replace(/\s+/g, ""));
}
