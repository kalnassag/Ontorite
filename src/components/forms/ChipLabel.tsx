/**
 * The label inside a picker chip, with the shared hover card. Classes that
 * will only be created on save ("Vehicle (new)") and unions get no card —
 * there's nothing to describe yet.
 */

import ClassHover from "../hover/ClassHover";

export default function ChipLabel({ uri, label }: { uri: string; label: string }) {
  if (!uri || label.endsWith("(new)")) return <span>{label}</span>;
  return <ClassHover uri={uri}>{label}</ClassHover>;
}
