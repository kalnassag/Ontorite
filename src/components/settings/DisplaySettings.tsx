/** Settings → Display & accessibility. */

import { useSettings, type TextSize, type ThemeSetting } from "../../lib/settings";
import Choice from "./Choice";

export default function DisplaySettings() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);

  return (
    <div className="space-y-4">
      <Choice<ThemeSetting>
        label="Theme"
        value={settings.theme}
        options={[{ value: "system", label: "Follow system" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
        onChange={(theme) => update({ theme })}
      />
      <Choice<TextSize>
        label="Text size"
        hint="Scales all text and the controls around it. Your browser's zoom (Ctrl + / Ctrl −) also works."
        value={settings.textSize}
        options={[
          { value: "small", label: "Small" }, { value: "default", label: "Default" },
          { value: "large", label: "Large" }, { value: "larger", label: "Larger" },
        ]}
        onChange={(textSize) => update({ textSize })}
      />
      <Choice
        label="Contrast"
        hint="Higher contrast makes secondary text, borders and input edges stronger. “Follow system” uses it when your operating system asks for more contrast."
        value={settings.contrast}
        options={[{ value: "system", label: "Follow system" }, { value: "always", label: "Higher contrast" }]}
        onChange={(contrast) => update({ contrast })}
      />
      <Choice
        label="Motion"
        hint="Reduce motion turns off animations (panels sliding, cards expanding). “Follow system” reduces them when your operating system asks."
        value={settings.reduceMotion}
        options={[{ value: "system", label: "Follow system" }, { value: "always", label: "Reduce motion" }]}
        onChange={(reduceMotion) => update({ reduceMotion })}
      />
      <div className="rounded border border-th-border-muted p-2.5 text-2xs leading-snug text-th-fg-3">
        <p className="mb-1 font-medium text-th-fg-2">Always on</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Keyboard focus is outlined, so you can see where you are when tabbing.</li>
          <li>Property types are told apart by a letter (O, D, A) as well as colour.</li>
          <li>Keyboard shortcuts are listed under the help button next to the app name; <kbd className="rounded bg-th-hover px-1 font-mono">Ctrl+,</kbd> opens Settings.</li>
        </ul>
      </div>
    </div>
  );
}
