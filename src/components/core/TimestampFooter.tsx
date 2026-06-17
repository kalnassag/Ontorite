/**
 * Hover-revealed timestamp footer: shows "Modified … · Created …" beneath
 * an entity row. Hidden by default; appears when the parent `.group` is
 * hovered. Hidden entirely when neither timestamp is known.
 */

import { formatAbsoluteTime, formatTimeSince } from "../../lib/time-format";

interface Props {
  created?: string;
  modified?: string;
  /** Tailwind tweak for parent .group hover behaviour (default is group-hover). */
  className?: string;
}

export default function TimestampFooter({ created, modified, className = "" }: Props) {
  if (!created && !modified) return null;
  return (
    <div
      className={`mt-0.5 hidden flex-wrap items-center gap-x-3 text-[10px] text-th-fg-4 group-hover:flex ${className}`}
    >
      {modified && (
        <span title={`Modified at ${formatAbsoluteTime(modified)}`}>
          Modified {formatTimeSince(modified)}
        </span>
      )}
      {created && (
        <span title={`Created at ${formatAbsoluteTime(created)}`}>
          Created {formatTimeSince(created)}
        </span>
      )}
    </div>
  );
}
