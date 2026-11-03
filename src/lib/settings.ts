/**
 * App settings: per-device preferences (display, accessibility, defaults for
 * new ontologies). Not ontology data — never in undo history.
 *
 * Stored in localStorage (small, and read synchronously so the theme and text
 * size apply before first paint). The library itself lives in IndexedDB
 * (lib/references); Settings → Data exports both together.
 */

import { create } from "zustand";

export type ThemeSetting = "system" | "light" | "dark";
export type TextSize = "small" | "default" | "large" | "larger";
export type SystemOr<T extends string> = "system" | T;

export interface NewOntologyDefaults {
  /** Language tag for new labels; "" = untagged */
  defaultLanguage: string;
  /** Base URI for new ontologies; `{name}` is replaced by the label, slugged */
  baseUriPattern: string;
  /** Prefixes added to every new ontology, beyond the standard ones */
  prefixes: Record<string, string>;
}

export interface AppSettings {
  theme: ThemeSetting;
  textSize: TextSize;
  /** "system" follows the OS setting; "always" turns animations off regardless */
  reduceMotion: SystemOr<"always">;
  /** "system" follows the OS setting; "always" uses stronger text and borders */
  contrast: SystemOr<"always">;
  newOntology: NewOntologyDefaults;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  textSize: "default",
  reduceMotion: "system",
  contrast: "system",
  newOntology: { defaultLanguage: "", baseUriPattern: "http://example.org/{name}/", prefixes: {} },
};

const KEY = "ontorite:settings";

/** Merge stored / imported values over the defaults, dropping anything malformed. */
export function normalizeSettings(raw: unknown): AppSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<AppSettings>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const nd = (value.newOntology && typeof value.newOntology === "object" ? value.newOntology : {}) as Partial<NewOntologyDefaults>;
  const prefixes = nd.prefixes && typeof nd.prefixes === "object"
    ? Object.fromEntries(Object.entries(nd.prefixes).filter(([k, v]) => typeof k === "string" && typeof v === "string"))
    : {};
  return {
    theme: pick(value.theme, ["system", "light", "dark"] as const, DEFAULT_SETTINGS.theme),
    textSize: pick(value.textSize, ["small", "default", "large", "larger"] as const, DEFAULT_SETTINGS.textSize),
    reduceMotion: pick(value.reduceMotion, ["system", "always"] as const, DEFAULT_SETTINGS.reduceMotion),
    contrast: pick(value.contrast, ["system", "always"] as const, DEFAULT_SETTINGS.contrast),
    newOntology: {
      defaultLanguage: typeof nd.defaultLanguage === "string" ? nd.defaultLanguage.trim() : DEFAULT_SETTINGS.newOntology.defaultLanguage,
      baseUriPattern: typeof nd.baseUriPattern === "string" && nd.baseUriPattern.trim() ? nd.baseUriPattern.trim() : DEFAULT_SETTINGS.newOntology.baseUriPattern,
      prefixes,
    },
  };
}

function load(): AppSettings {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return normalizeSettings(JSON.parse(stored));
    // Before settings existed, the theme toggle was stored on its own
    const legacyTheme = localStorage.getItem("theme");
    return { ...DEFAULT_SETTINGS, theme: legacyTheme === "light" || legacyTheme === "dark" ? legacyTheme : DEFAULT_SETTINGS.theme };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export type SettingsTab = "library" | "new-ontology" | "display" | "data";

interface SettingsState {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  updateNewOntology: (patch: Partial<NewOntologyDefaults>) => void;
  replace: (settings: AppSettings) => void;
  /** The Settings drawer: null when closed */
  openTab: SettingsTab | null;
  open: (tab?: SettingsTab) => void;
  close: () => void;
}

function save(settings: AppSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode: applies for this session only */ }
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: load(),
  update: (patch) => get().replace({ ...get().settings, ...patch }),
  updateNewOntology: (patch) => get().replace({ ...get().settings, newOntology: { ...get().settings.newOntology, ...patch } }),
  replace: (settings) => { save(settings); set({ settings }); },
  openTab: null,
  open: (tab = "library") => set({ openTab: tab }),
  close: () => set({ openTab: null }),
}));

export const getSettings = () => useSettings.getState().settings;
export const openSettings = (tab?: SettingsTab) => useSettings.getState().open(tab);

/** The base URI a new ontology gets from its label. */
export function baseUriFor(label: string, pattern = getSettings().newOntology.baseUriPattern): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ontology";
  return pattern.includes("{name}") ? pattern.replace("{name}", slug) : pattern;
}

const TEXT_SIZE: Record<TextSize, string> = { small: "87.5%", default: "100%", large: "112.5%", larger: "125%" };

/** Reflect display settings on <html> (classes read by index.css). */
export function applyDisplaySettings(settings: AppSettings, systemDark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", settings.theme === "dark" || (settings.theme === "system" && systemDark));
  root.classList.toggle("reduce-motion", settings.reduceMotion === "always");
  root.classList.toggle("contrast-more", settings.contrast === "always");
  root.style.fontSize = TEXT_SIZE[settings.textSize];
}
