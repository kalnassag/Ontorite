/**
 * Drawer for editing per-entity editorial notes (skos:editorialNote).
 * Used by ClassCard, PropertyRow, IndividualCard via their trigger buttons.
 */

import Drawer from "../layout/Drawer";
import LabelEditor from "../forms/LabelEditor";
import type { LangString } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  entityLabel: string;
  entityKind: "class" | "property" | "individual";
  notes: LangString[];
  onChange: (notes: LangString[]) => void;
}

const KIND_LABELS: Record<Props["entityKind"], string> = {
  class: "Class",
  property: "Property",
  individual: "Individual",
};

export default function EditorialNotesDrawer({
  open,
  onClose,
  entityLabel,
  entityKind,
  notes,
  onChange,
}: Props) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Editorial notes"
      subtitle={`${KIND_LABELS[entityKind]} · ${entityLabel}`}
    >
      <div className="space-y-2">
        <p className="text-2xs text-th-fg-4">
          Notes serialize as <code className="font-mono">skos:editorialNote</code> on this {entityKind}.
        </p>
        <LabelEditor
          values={notes}
          onChange={onChange}
          placeholder="Editorial note"
          multiline
          rows={6}
        />
      </div>
    </Drawer>
  );
}
