/**
 * Which term's hover card is showing (UI state only — no domain data).
 *
 * One card is rendered app-wide by HoverCardHost; `ClassHover` wrappers just
 * report enter/leave here, so hundreds of hoverable names cost nothing until
 * one is actually hovered.
 */

import { create } from "zustand";

export interface HoverTarget {
  uri: string;
  /** Ontology to describe the term from (defaults to the active one) */
  ontologyId?: string;
  /** Anchor rectangle in viewport coordinates */
  rect: { left: number; top: number; bottom: number; right: number };
}

interface HoverCardState {
  target: HoverTarget | null;
}

export const useHoverCard = create<HoverCardState>(() => ({ target: null }));

const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 150;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Pointer entered a hoverable term. Switches instantly if a card is already open. */
export function showHoverCard(uri: string, anchor: Element, ontologyId?: string) {
  clearTimeout(hideTimer);
  clearTimeout(showTimer);
  const { left, top, bottom, right } = anchor.getBoundingClientRect();
  const target = { uri, ontologyId, rect: { left, top, bottom, right } };
  if (useHoverCard.getState().target) useHoverCard.setState({ target });
  else showTimer = setTimeout(() => useHoverCard.setState({ target }), SHOW_DELAY_MS);
}

/** Pointer left the term (or the card): close shortly, unless it re-enters. */
export function hideHoverCard() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => useHoverCard.setState({ target: null }), HIDE_DELAY_MS);
}

/** Pointer is over the card itself — keep it open (so the IRI can be selected / copied). */
export function keepHoverCard() {
  clearTimeout(hideTimer);
}

export function dismissHoverCard() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  if (useHoverCard.getState().target) useHoverCard.setState({ target: null });
}

// ── Definition drawer (full definition of a term, e.g. from an imported ontology) ──

interface DefinitionState {
  /** Terms viewed, most recent last — clicking a term inside a definition pushes it */
  stack: string[];
}

export const useDefinitionDrawer = create<DefinitionState>(() => ({ stack: [] }));

/** Open the definition of `uri` (from the hover card), starting a fresh trail. */
export function openDefinition(uri: string) {
  dismissHoverCard();
  useDefinitionDrawer.setState({ stack: [uri] });
}

/** Follow a term referenced inside the open definition. */
export function followDefinition(uri: string) {
  useDefinitionDrawer.setState((s) => (s.stack[s.stack.length - 1] === uri ? s : { stack: [...s.stack, uri] }));
}

export function backDefinition() {
  useDefinitionDrawer.setState((s) => ({ stack: s.stack.slice(0, -1) }));
}

export function closeDefinition() {
  useDefinitionDrawer.setState({ stack: [] });
}
