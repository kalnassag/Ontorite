/**
 * Wrap any rendered class (or property / datatype) name to give it the shared
 * hover card: label variants, description, and the IRI. Renders a plain span,
 * so it can replace an existing label span in place.
 */

import type { ReactNode } from "react";
import { hideHoverCard, showHoverCard } from "../../lib/hover-card";

interface Props {
  uri: string;
  children: ReactNode;
  className?: string;
  /** Describe from this ontology instead of the active one (e.g. in the diff view) */
  ontologyId?: string;
}

export default function ClassHover({ uri, children, className, ontologyId }: Props) {
  if (!uri || uri.startsWith("_:")) return <span className={className}>{children}</span>;
  return (
    <span
      className={className}
      onMouseEnter={(e) => showHoverCard(uri, e.currentTarget, ontologyId)}
      onMouseLeave={hideHoverCard}
      onFocus={(e) => showHoverCard(uri, e.currentTarget, ontologyId)}
      onBlur={hideHoverCard}
    >
      {children}
    </span>
  );
}
