/**
 * Top-down branching tree view of the class hierarchy.
 *
 * - subClassOf is the parent relation.
 * - Multi-parent classes are placed under their alphabetically-first in-ontology
 *   parent; the other parent relationships render as faded dashed lines so the
 *   information isn't lost.
 * - Pan with drag, zoom with wheel, fit-to-view button.
 */

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";
import { useStore } from "../../lib/store";
import { compact } from "../../lib/uri-utils";
import { classExprFormat } from "../../types";
import type { OntologyClass, OntologyProperty } from "../../types";

interface Props { onClose: () => void; }

interface LayoutNode {
  cls: OntologyClass;
  children: LayoutNode[];
  x: number;       // centre x of this node
  y: number;       // centre y of this node
  subtreeW: number; // total horizontal footprint of subtree rooted here
}

interface Edge {
  from: { x: number; y: number };
  to:   { x: number; y: number };
  /** True when this edge represents a secondary (multi-inheritance) parent. */
  faded: boolean;
}

const NODE_R    = 36;
const NODE_GAP  = 32;  // horizontal gap between sibling subtrees
const LEVEL_GAP = 130; // vertical distance between levels
const FONT      = "Helvetica, Arial, sans-serif";

const PALETTE = {
  fill:   "#aaccff",
  stroke: "#5577aa",
  text:   "#0a0a1a",
  line:   "#999",
  fadedLine: "#bbb",
};

export default function TreeGraph({ onClose }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const classes = activeOntology?.classes ?? [];
  const properties = activeOntology?.properties ?? [];
  const prefixes = activeOntology?.metadata.prefixes ?? {};

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [viewBox, setViewBox] = useState({ x: -800, y: -100, w: 1600, h: 1200 });
  const [panDrag, setPanDrag] = useState<{ startX: number; startY: number; startVB: typeof viewBox } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { roots, secondaryEdges, bounds } = useMemo(() => layoutTree(classes), [classes]);

  // ── Pan ───────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    setPanDrag({ startX: e.clientX, startY: e.clientY, startVB: viewBox });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!panDrag) return;
    const cw = containerRef.current?.clientWidth ?? 1;
    const ch = containerRef.current?.clientHeight ?? 1;
    setViewBox({
      ...panDrag.startVB,
      x: panDrag.startVB.x - (e.clientX - panDrag.startX) / cw * panDrag.startVB.w,
      y: panDrag.startVB.y - (e.clientY - panDrag.startY) / ch * panDrag.startVB.h,
    });
  };
  const handleMouseUp = () => setPanDrag(null);

  // ── Zoom ──────────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const mx = viewBox.x + ((e.clientX - r.left) / r.width)  * viewBox.w;
    const my = viewBox.y + ((e.clientY - r.top)  / r.height) * viewBox.h;
    setViewBox((vb) => ({
      x: mx - (mx - vb.x) * factor,
      y: my - (my - vb.y) * factor,
      w: vb.w * factor,
      h: vb.h * factor,
    }));
  };

  const zoom = (factor: number) =>
    setViewBox((vb) => ({
      x: vb.x + (vb.w - vb.w * factor) / 2,
      y: vb.y + (vb.h - vb.h * factor) / 2,
      w: vb.w * factor,
      h: vb.h * factor,
    }));

  const fitToView = useCallback(() => {
    if (!bounds) return;
    const m = 80;
    setViewBox({
      x: bounds.minX - m,
      y: bounds.minY - m,
      w: bounds.maxX - bounds.minX + m * 2,
      h: bounds.maxY - bounds.minY + m * 2,
    });
  }, [bounds]);

  // Fit on first layout
  useEffect(() => { fitToView(); }, [fitToView]);

  if (classes.length === 0) {
    return (
      <div className="flex h-full flex-col bg-th-base">
        <Toolbar onZoomIn={() => zoom(0.8)} onZoomOut={() => zoom(1.25)} onFit={fitToView} onReset={fitToView} onClose={onClose} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-th-fg-3">No classes to visualise.</p>
        </div>
      </div>
    );
  }

  // Flatten for rendering
  const allNodes: LayoutNode[] = [];
  const allEdges: Edge[] = [];
  function walk(node: LayoutNode) {
    allNodes.push(node);
    for (const child of node.children) {
      allEdges.push({
        from: { x: node.x, y: node.y + NODE_R },
        to:   { x: child.x, y: child.y - NODE_R },
        faded: false,
      });
      walk(child);
    }
  }
  for (const root of roots) walk(root);
  for (const se of secondaryEdges) allEdges.push(se);

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-th-base" style={{ position: "relative" }}>
      <Toolbar onZoomIn={() => zoom(0.8)} onZoomOut={() => zoom(1.25)} onFit={fitToView} onReset={fitToView} onClose={onClose} />

      <svg
        ref={svgRef}
        className="flex-1"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: panDrag ? "grabbing" : "default" }}
      >
        <defs>
          <marker id="tree-arrow" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="8" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--th-base, #fff)" stroke={PALETTE.line} strokeWidth="1.5" />
          </marker>
          <marker id="tree-arrow-faded" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="8" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="none" stroke={PALETTE.fadedLine} strokeWidth="1.2" />
          </marker>
        </defs>

        {/* Edges */}
        {allEdges.map((e, i) => {
          const midY = (e.from.y + e.to.y) / 2;
          const path = `M ${e.from.x} ${e.from.y} V ${midY} H ${e.to.x} V ${e.to.y}`;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={e.faded ? PALETTE.fadedLine : PALETTE.line}
              strokeWidth={e.faded ? 1.2 : 1.6}
              strokeDasharray={e.faded ? "4,3" : undefined}
              markerEnd={e.faded ? "url(#tree-arrow-faded)" : "url(#tree-arrow)"}
              opacity={e.faded ? 0.55 : 0.85}
            />
          );
        })}

        {/* Nodes */}
        {allNodes.map((n) => (
          <ClassNode
            key={n.cls.id}
            node={n}
            isHovered={hoveredId === n.cls.id}
            onHover={(id) => setHoveredId(id)}
          />
        ))}
      </svg>

      {/* Hover detail */}
      {hoveredId && (() => {
        const cls = classes.find((c) => c.id === hoveredId);
        if (!cls) return null;
        const domainIncludes = (p: typeof properties[number]) =>
          p.domain.kind === "class" ? p.domain.uri === cls.uri : p.domain.uris.includes(cls.uri);
        const ownDatatype = properties.filter((p) => p.type === "owl:DatatypeProperty" && domainIncludes(p));
        const ownAnnotation = properties.filter((p) => p.type === "owl:AnnotationProperty" && domainIncludes(p));
        return (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-sm rounded border border-th-border bg-th-surface px-3 py-2 shadow-lg">
            <div className="text-xs font-semibold text-th-fg">{cls.labels[0]?.value || cls.localName}</div>
            <div className="truncate font-mono text-2xs text-th-fg-3">{compact(cls.uri, prefixes)}</div>
            {cls.descriptions[0]?.value && (
              <div className="mt-1 text-2xs text-th-fg-2">{cls.descriptions[0].value}</div>
            )}
            <PropertyList title="Datatype properties" colour="text-prop-datatype-500" props={ownDatatype} prefixes={prefixes} showRange />
            <PropertyList title="Annotation properties" colour="text-prop-annotation-500" props={ownAnnotation} prefixes={prefixes} showRange={false} />
            {ownDatatype.length === 0 && ownAnnotation.length === 0 && (
              <div className="mt-1 text-2xs italic text-th-fg-4">No datatype or annotation properties on this class.</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Toolbar({ onZoomIn, onZoomOut, onFit, onReset, onClose }: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-th-border bg-th-surface px-3 py-1.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-th-fg-3">
        Class hierarchy
      </span>
      <span className="text-2xs text-th-fg-4">
        subClassOf — top-down · dashed = secondary parent
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={onReset} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Re-fit"><RefreshCw size={13} /></button>
        <button onClick={onZoomIn} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Zoom in"><ZoomIn size={14} /></button>
        <button onClick={onZoomOut} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Zoom out"><ZoomOut size={14} /></button>
        <button onClick={onFit} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Fit to view"><Maximize2 size={14} /></button>
        <button onClick={onClose} className="ml-2 rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Close"><X size={14} /></button>
      </div>
    </div>
  );
}

function ClassNode({ node, isHovered, onHover }: { node: LayoutNode; isHovered: boolean; onHover: (id: string | null) => void }) {
  const cls = node.cls;
  const lbl = cls.labels[0]?.value || cls.localName;
  const lines = wrapLabel(lbl, NODE_R, 14);
  const lineH = 17;
  const blockTopY = node.y - ((lines.length - 1) * lineH) / 2;
  return (
    <g
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(cls.id)}
      onMouseLeave={() => onHover(null)}
    >
      {isHovered && <circle cx={node.x} cy={node.y} r={NODE_R + 6} fill="none" stroke={PALETTE.stroke} strokeWidth={1.5} opacity={0.4} />}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_R}
        fill={PALETTE.fill}
        stroke={PALETTE.stroke}
        strokeWidth={isHovered ? 2.5 : 2}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={node.x}
          y={blockTopY + i * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={PALETTE.text}
          fontSize={14}
          fontWeight={600}
          fontFamily={FONT}
          pointerEvents="none"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function PropertyList({ title, colour, props, prefixes, showRange }: {
  title: string;
  colour: string;
  props: OntologyProperty[];
  prefixes: Record<string, string>;
  showRange: boolean;
}) {
  if (props.length === 0) return null;
  return (
    <div className="mt-2">
      <div className={`mb-0.5 text-[10px] font-medium uppercase tracking-wide ${colour}`}>{title}</div>
      <ul className="space-y-0.5">
        {props.map((p) => {
          const rng = showRange
            ? (p.ranges ?? []).map((r) => classExprFormat(r, (u) => compact(u, prefixes))).join(", ")
            : "";
          return (
            <li key={p.id} className="flex items-baseline gap-2 text-2xs">
              <span className="text-th-fg">{p.labels[0]?.value || p.localName}</span>
              {rng && <span className="font-mono text-th-fg-4">{rng}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Layout algorithm ──────────────────────────────────────────────────
function wrapLabel(label: string, r: number, fontSize: number): string[] {
  const charW = fontSize * 0.58;
  const words = label.split(/(?=[A-Z])|[_\s-]+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const maxChord = 2 * r * 0.88;
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (test.length * charW > maxChord && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [label];
}

function layoutTree(classes: OntologyClass[]): {
  roots: LayoutNode[];
  secondaryEdges: Edge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
} {
  if (classes.length === 0) return { roots: [], secondaryEdges: [], bounds: null };

  const byUri = new Map(classes.map((c) => [c.uri, c]));
  // Each class -> primary parent URI (alphabetically-first in-ontology subClassOf)
  // and secondary parent URIs (the rest)
  const primaryParent = new Map<string, string>();
  const secondaryParents = new Map<string, string[]>();
  for (const cls of classes) {
    const inOntoParents = cls.subClassOf.filter((p) => byUri.has(p)).sort();
    if (inOntoParents.length === 0) continue;
    primaryParent.set(cls.uri, inOntoParents[0]!);
    if (inOntoParents.length > 1) {
      secondaryParents.set(cls.uri, inOntoParents.slice(1));
    }
  }

  // Group children under primary parents
  const childrenByParent = new Map<string, OntologyClass[]>();
  for (const cls of classes) {
    const parent = primaryParent.get(cls.uri);
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(cls);
    childrenByParent.set(parent, list);
  }
  // Sort children alphabetically by label for stable layout
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => (a.labels[0]?.value || a.localName).localeCompare(b.labels[0]?.value || b.localName));
  }

  // Roots = classes that aren't anyone's primary child
  const roots = classes
    .filter((c) => !primaryParent.has(c.uri))
    .sort((a, b) => (a.labels[0]?.value || a.localName).localeCompare(b.labels[0]?.value || b.localName));

  // Recursively build layout nodes with subtree widths
  const NODE_W = NODE_R * 2 + NODE_GAP;
  function buildNode(cls: OntologyClass, depth: number): LayoutNode {
    const children = (childrenByParent.get(cls.uri) || []).map((c) => buildNode(c, depth + 1));
    const subtreeW = children.length === 0
      ? NODE_W
      : children.reduce((sum, c) => sum + c.subtreeW, 0);
    return { cls, children, x: 0, y: depth * LEVEL_GAP, subtreeW };
  }

  const rootNodes = roots.map((r) => buildNode(r, 0));

  // Horizontal placement: lay roots side by side; for each node, center over children
  let cursor = 0;
  function place(node: LayoutNode) {
    if (node.children.length === 0) {
      node.x = cursor + node.subtreeW / 2;
      cursor += node.subtreeW;
      return;
    }
    const start = cursor;
    for (const child of node.children) place(child);
    const firstChild = node.children[0]!;
    const lastChild  = node.children[node.children.length - 1]!;
    node.x = (firstChild.x + lastChild.x) / 2;
    // No-op: cursor already advanced by leaf placements
    void start;
  }
  for (const root of rootNodes) place(root);

  // Collect node positions for secondary-edge endpoints
  const nodeByUri = new Map<string, LayoutNode>();
  function collect(node: LayoutNode) {
    nodeByUri.set(node.cls.uri, node);
    for (const child of node.children) collect(child);
  }
  for (const root of rootNodes) collect(root);

  // Secondary edges (dashed)
  const secondaryEdges: Edge[] = [];
  for (const [childUri, parents] of secondaryParents) {
    const childNode = nodeByUri.get(childUri);
    if (!childNode) continue;
    for (const parentUri of parents) {
      const parentNode = nodeByUri.get(parentUri);
      if (!parentNode) continue;
      secondaryEdges.push({
        from: { x: parentNode.x, y: parentNode.y + NODE_R },
        to:   { x: childNode.x, y: childNode.y - NODE_R },
        faded: true,
      });
    }
  }

  // Compute overall bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const node of nodeByUri.values()) {
    minX = Math.min(minX, node.x - NODE_R);
    maxX = Math.max(maxX, node.x + NODE_R);
    minY = Math.min(minY, node.y - NODE_R);
    maxY = Math.max(maxY, node.y + NODE_R);
  }
  return {
    roots: rootNodes,
    secondaryEdges,
    bounds: { minX, maxX, minY, maxY },
  };
}
