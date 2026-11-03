/**
 * App settings: library, defaults for new ontologies, display and
 * accessibility, data transfer. Mounted once in App; open with the gear
 * button or Ctrl+, (state in lib/settings.ts).
 */

import { useRef } from "react";
import Drawer from "../layout/Drawer";
import { useSettings, type SettingsTab } from "../../lib/settings";
import LibrarySettings from "./LibrarySettings";
import NewOntologySettings from "./NewOntologySettings";
import DisplaySettings from "./DisplaySettings";
import DataSettings from "./DataSettings";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "library", label: "Library" },
  { id: "new-ontology", label: "New ontologies" },
  { id: "display", label: "Display & accessibility" },
  { id: "data", label: "Data" },
];

export default function SettingsDrawer() {
  const tab = useSettings((s) => s.openTab);
  const open = useSettings((s) => s.open);
  const close = useSettings((s) => s.close);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveTab = (from: number, delta: number) => {
    const next = (from + delta + TABS.length) % TABS.length;
    open(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <Drawer open={tab !== null} onClose={close} title="Settings" subtitle="Kept on this device" width={560}>
      <div role="tablist" aria-label="Settings sections" className="sticky -top-3 z-10 -mx-4 -mt-3 mb-3 flex flex-wrap gap-0.5 border-b border-th-border bg-th-base px-3">
        {TABS.map((t, i) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[i] = el; }}
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") { e.preventDefault(); moveTab(i, 1); }
                if (e.key === "ArrowLeft") { e.preventDefault(); moveTab(i, -1); }
              }}
              className={`-mb-px border-b-2 px-2 py-1.5 text-xs ${
                selected ? "border-blue-600 font-medium text-th-fg" : "border-transparent text-th-fg-3 hover:text-th-fg"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab && (
        <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
          {tab === "library" && <LibrarySettings />}
          {tab === "new-ontology" && <NewOntologySettings />}
          {tab === "display" && <DisplaySettings />}
          {tab === "data" && <DataSettings />}
        </div>
      )}
    </Drawer>
  );
}
