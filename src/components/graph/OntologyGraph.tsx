/**
 * WebVOWL-style ontology graph powered by D3 force simulation.
 * Mirrors the VOWL interaction model: live physics, spring settling,
 * reactive drag (moving one node pulls on all connected neighbours).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink as d3ForceLink,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { X, ZoomIn, ZoomOut, Maximize2, RefreshCw, Plus, Pencil, Trash2, CirclePlus } from "lucide-react";
import { useStore } from "../../lib/store";
import { compact } from "../../lib/uri-utils";
import ClassForm from "../forms/ClassForm";
import PropertyForm from "../forms/PropertyForm";

// ── VOWL palette ──────────────────────────────────────────────────
const V = {
  classFill:   "#aaccff",
  classStroke: "#7799cc",
  classText:   "#0a0a1a",
  dtypeFill:   "#99cc66",
  dtypeStroke: "#558833",
  dtypeText:   "#0a1a00",
  subLine:  "#999",
  obj:   { line: "#7799cc", box: "#335599", text: "#fff" },
  dtype: { line: "#558833", box: "#336611", text: "#fff" },
  annot: { line: "#aaaaaa", box: "#555555", text: "#fff" },
  inv:   { line: "#cc88cc", box: "#774477", text: "#fff" },
} as const;

const FONT         = "Helvetica, Arial, sans-serif";
const CLASS_R_BASE = 52;
const DTYPE_W      = 112;
const DTYPE_H      = 32;

// Centralised text sizes — adjust here if labels get crowded
const FS_EDGE  = 12; // relationship labels
const FS_CLASS = 14; // class node name
const FS_META  = 11; // "N props" subtitle
const FS_DTYPE = 13; // datatype node text
// Character-width estimate at the edge font size (used to size label boxes)
const EDGE_CHAR_W = FS_EDGE * 0.55;

// ── Types ─────────────────────────────────────────────────────────
type EdgeType =
  | "subClassOf"
  | "objectProperty"
  | "datatypeProperty"
  | "annotationProperty"
  | "inverseOf";

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: "class" | "datatype";
  label: string;
  uri: string;
  propertyCount: number;
}

// D3 mutates source/target from string IDs to node objects after setup
interface D3Link {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
  label: string;
  type: EdgeType;
}

interface Props { onClose: () => void; }

// ── Geometry helpers ──────────────────────────────────────────────
function classR(n: SimNode) {
  return CLASS_R_BASE + Math.min(n.propertyCount * 2, 12);
}

function nodeAnchor(
  node: SimNode,
  fromX: number, fromY: number,
): { x: number; y: number } {
  const nx = node.x ?? 0, ny = node.y ?? 0;
  const dx = fromX - nx, dy = fromY - ny;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (node.kind === "class") {
    const r = classR(node);
    return { x: nx + ux * r, y: ny + uy * r };
  }
  const hw = DTYPE_W / 2, hh = DTYPE_H / 2;
  const tx = ux !== 0 ? hw / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? hh / Math.abs(uy) : Infinity;
  const t  = Math.min(tx, ty);
  return { x: nx + ux * t, y: ny + uy * t };
}

// Get position robustly whether d3 has resolved the link or not
function resolvedPos(end: string | SimNode, fallback: Map<string, SimNode>): SimNode | undefined {
  if (typeof end === "object") return end;
  return fallback.get(end);
}

// ── Context menu state ────────────────────────────────────────────
interface ContextMenu {
  x: number; // screen px
  y: number;
  type: "canvas" | "class-node" | "edge";
  nodeId?: string;   // class node id
  linkId?: string;   // D3Link id
}

// ── Floating panel state ───────────────────────────────────────────
type FloatingPanel =
  | { kind: "edit-class"; classId: string; x: number; y: number }
  | { kind: "new-class"; x: number; y: number }
  | { kind: "edit-property"; propertyId: string; x: number; y: number }
  | { kind: "new-property"; defaultDomainUri: string; x: number; y: number };

// ── Component ─────────────────────────────────────────────────────
export default function OntologyGraph({ onClose }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const deleteClass    = useStore((s) => s.deleteClass);
  const deleteProperty = useStore((s) => s.deleteProperty);
  const svgRef         = useRef<SVGSVGElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);

  type ViewBox = { x: number; y: number; w: number; h: number };
  const [viewBox, setViewBox] = useState<ViewBox>({ x: -800, y: -500, w: 1600, h: 1000 });
  const [panDrag, setPanDrag] = useState<
    { startX: number; startY: number; startVB: ViewBox } | null
  >(null);

  // D3 simulation lives in refs — not React state — so mutations don't trigger re-renders
  const simRef       = useRef<Simulation<SimNode, D3Link> | null>(null);
  const simNodesRef  = useRef<SimNode[]>([]);
  const simLinksRef  = useRef<D3Link[]>([]);
  const nodeMapRef   = useRef<Map<string, SimNode>>(new Map());
  const rafRef       = useRef<number | null>(null);
  const dragNodeRef  = useRef<SimNode | null>(null);

  // A single incrementing counter forces React to re-read positions from the refs
  const [, forceRedraw] = useState(0);

  const classes    = activeOntology?.classes    ?? [];
  const properties = activeOntology?.properties ?? [];

  const [hoveredId,        setHoveredId]        = useState<string | null>(null);
  // Kept for legacy double-click path but now superseded by floatingPanel
  const [editingClassId,   setEditingClassId]    = useState<string | null>(null);
  const [editPanelPos]                           = useState({ x: 0, y: 0 });
  const [showDatatypes,    setShowDatatypes]     = useState(true);
  const [showAnnotations,  setShowAnnotations]   = useState(true);
  const [contextMenu,      setContextMenu]       = useState<ContextMenu | null>(null);
  const [floatingPanel,    setFloatingPanel]     = useState<FloatingPanel | null>(null);

  // ── Tick handler (rAF-batched) ────────────────────────────────────
  const scheduleTick = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      forceRedraw((n) => n + 1);
    });
  }, []);

  // ── Build/rebuild simulation ──────────────────────────────────────
  const buildSimulation = useCallback(() => {
    if (classes.length === 0) {
      simRef.current?.stop();
      simRef.current = null;
      simNodesRef.current = [];
      simLinksRef.current = [];
      nodeMapRef.current = new Map();
      forceRedraw((n) => n + 1);
      return;
    }

    const prefixes = activeOntology?.metadata.prefixes ?? {};

    // -- Nodes --
    const propCount = new Map<string, number>();
    for (const prop of properties) {
      if (prop.domainUri) propCount.set(prop.domainUri, (propCount.get(prop.domainUri) ?? 0) + 1);
    }

    // Preserve existing positions when rebuilding (e.g. after class edit)
    const prevMap = nodeMapRef.current;

    const classNodes: SimNode[] = classes.map((cls) => {
      const prev = prevMap.get(cls.id);
      return {
        id: cls.id, kind: "class",
        label: cls.labels[0]?.value || cls.localName,
        uri: cls.uri,
        propertyCount: propCount.get(cls.uri) ?? 0,
        x: prev?.x, y: prev?.y,
      };
    });

    const dtypeUriSet = new Set<string>();
    if (showDatatypes) {
      for (const prop of properties) {
        if (prop.type === "owl:DatatypeProperty" && prop.domainUri) {
          for (const r of prop.ranges ?? []) dtypeUriSet.add(r);
        }
      }
    }
    const dtypeNodes: SimNode[] = [...dtypeUriSet].map((uri) => {
      const id   = `dtype:${uri}`;
      const prev = prevMap.get(id);
      return {
        id, kind: "datatype",
        label: compact(uri, prefixes),
        uri, propertyCount: 0,
        x: prev?.x, y: prev?.y,
      };
    });

    const allNodes: SimNode[] = [...classNodes, ...dtypeNodes];
    const newMap  = new Map(allNodes.map((n) => [n.id, n]));

    // -- Links --
    const links: D3Link[] = [];

    for (const cls of classes) {
      for (const parentUri of cls.subClassOf) {
        const parent = classes.find((c) => c.uri === parentUri);
        if (parent) links.push({ id: `sub-${cls.id}-${parent.id}`, source: cls.id, target: parent.id, label: "subClassOf", type: "subClassOf" });
      }
    }

    const seenInverse = new Set<string>();
    for (const prop of properties) {
      if (prop.type !== "owl:ObjectProperty" || !prop.domainUri || !(prop.ranges ?? []).length) continue;
      const dom = classes.find((c) => c.uri === prop.domainUri);
      if (!dom) continue;

      for (const rangeUri of prop.ranges ?? []) {
        const rng = classes.find((c) => c.uri === rangeUri);
        if (!rng) continue;

        if (prop.inverseOf) {
          const key = [prop.uri, prop.inverseOf].sort().join("|") + "-" + rng.id;
          if (seenInverse.has(key)) continue;
          seenInverse.add(key);
          const invP   = properties.find((p) => p.uri === prop.inverseOf);
          const invLbl = invP ? (invP.labels[0]?.value || invP.localName) : "inverse";
          links.push({ id: `inv-${key}`, source: dom.id, target: rng.id, label: `${prop.labels[0]?.value || prop.localName} ⇌ ${invLbl}`, type: "inverseOf" });
        } else {
          const done = properties.some((p) => p.inverseOf === prop.uri && seenInverse.has([p.uri, prop.uri].sort().join("|") + "-" + rng.id));
          if (done) continue;
          links.push({ id: `obj-${prop.id}-${rng.id}`, source: dom.id, target: rng.id, label: prop.labels[0]?.value || prop.localName, type: "objectProperty" });
        }
      }
    }

    if (showDatatypes) {
      for (const prop of properties) {
        if (prop.type !== "owl:DatatypeProperty" || !prop.domainUri || !(prop.ranges ?? []).length) continue;
        const dom = classes.find((c) => c.uri === prop.domainUri);
        if (!dom) continue;
        for (const rangeUri of prop.ranges ?? []) {
          links.push({ id: `dtype-${prop.id}-${rangeUri}`, source: dom.id, target: `dtype:${rangeUri}`, label: prop.labels[0]?.value || prop.localName, type: "datatypeProperty" });
        }
      }
    }

    if (showAnnotations) {
      for (const prop of properties) {
        if (prop.type !== "owl:AnnotationProperty" || !prop.domainUri || !(prop.ranges ?? []).length) continue;
        const dom = classes.find((c) => c.uri === prop.domainUri);
        if (!dom) continue;
        for (const rangeUri of prop.ranges ?? []) {
          const rng = classes.find((c) => c.uri === rangeUri);
          if (!rng) continue;
          links.push({ id: `annot-${prop.id}-${rng.id}`, source: dom.id, target: rng.id, label: prop.labels[0]?.value || prop.localName, type: "annotationProperty" });
        }
      }
    }

    // Stop old sim cleanly
    simRef.current?.stop();

    // Hierarchical depth computation
    const childrenMap = new Map<string, string[]>();
    for (const cls of classes) {
      if (!childrenMap.has(cls.uri)) childrenMap.set(cls.uri, []);
      for (const parentUri of cls.subClassOf) {
        if (!childrenMap.has(parentUri)) childrenMap.set(parentUri, []);
        childrenMap.get(parentUri)!.push(cls.uri);
      }
    }
    const roots = classes.filter((c) => c.subClassOf.length === 0);
    const depthMap = new Map<string, number>();
    const queue = roots.map((c) => ({ uri: c.uri, depth: 0 }));
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const { uri, depth } = queue.shift()!;
      if (visited.has(uri)) continue;
      visited.add(uri);
      depthMap.set(uri, Math.max(depthMap.get(uri) ?? 0, depth));
      const children = childrenMap.get(uri) ?? [];
      for (const childUri of children) {
        queue.push({ uri: childUri, depth: depth + 1 });
      }
    }

    // Compute degree so orphan nodes can get stronger gravity
    const degree = new Map<string, number>(allNodes.map((n) => [n.id, 0]));
    for (const l of links) {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as SimNode).id : l.target;
      degree.set(s, (degree.get(s) ?? 0) + 1);
      degree.set(t, (degree.get(t) ?? 0) + 1);
    }
    
    const N = allNodes.length;
    // Base repulsion increases with node count. Made much stronger to prevent clustering.
    const baseRepulsion = -2500 - N * 80;
    // Distance max scales up so distant clusters don't collapse inward
    const distanceMax = Math.max(3000, N * 150);

    // Gravity weakens slightly for very large graphs to allow spreading out
    const gravityForce = N > 50 ? 0.015 : 0.04;
    const orphanGravity = 0.08;
    const getGravity = (n: SimNode) => (degree.get(n.id) ?? 0) === 0 ? orphanGravity : gravityForce;

    const maxDepth = Math.max(0, ...Array.from(depthMap.values()));
    const ySpacing = 350; // Increased spacing between hierarchical layers
    const yOffset = -(maxDepth * ySpacing) / 2;

    simNodesRef.current = allNodes;
    simLinksRef.current = links;
    nodeMapRef.current  = newMap;

    // Self-loops collapse under d3-force (zero-length edges), so keep them out
    // of the simulation and render them purely from node position + radius.
    const simLinks = links.filter((l) => {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as SimNode).id : l.target;
      return s !== t;
    });

    const sim = forceSimulation<SimNode>(allNodes)
      .force("charge",  forceManyBody<SimNode>().strength(baseRepulsion).distanceMax(distanceMax))
      .force("link",    d3ForceLink<SimNode, D3Link>(simLinks)
        .id((d) => d.id)
        .distance((l) => {
          // Drastically increased base distances to prevent edge labels overlapping
          let dist = l.type === "subClassOf" ? 220 : l.type === "datatypeProperty" ? 300 : 350;
          return dist + (N > 30 ? 80 : 0); // extra distance for big graphs
        })
        .strength((l)  => l.type === "subClassOf" ? 0.8 : 0.35))
      .force("x",       forceX<SimNode>(0).strength(getGravity))
      .force("y",       forceY<SimNode>((n) => {
         if (n.kind === "class") {
           const d = depthMap.get(n.uri) ?? 0;
           return yOffset + d * ySpacing;
         }
         return 0; // Datatypes drift
      }).strength((n) => {
         const g = getGravity(n);
         return n.kind === "class" ? Math.max(g, 0.4) : g; // Strongly pull classes into top-down bands
      }))
      .force("collide", forceCollide<SimNode>((n) => (n.kind === "class" ? classR(n) + 80 : 80) + (N > 30 ? 40 : 0)).strength(0.85))
      .alphaDecay(0.015)
      .velocityDecay(0.4)
      .on("tick", scheduleTick);

    simRef.current = sim;
    forceRedraw((n) => n + 1);
  }, [classes, properties, activeOntology, scheduleTick, showDatatypes, showAnnotations]);

  useEffect(() => {
    buildSimulation();
    return () => { simRef.current?.stop(); };
  }, [buildSimulation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFloatingPanel(null);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Pan / zoom ────────────────────────────────────────────────────
  const zoom = (factor: number) =>
    setViewBox((vb) => ({
      x: vb.x + (vb.w - vb.w * factor) / 2,
      y: vb.y + (vb.h - vb.h * factor) / 2,
      w: vb.w * factor,
      h: vb.h * factor,
    }));

  const fitToView = () => {
    const nodes = simNodesRef.current;
    if (nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.x ?? 0, y = n.y ?? 0;
      const pad = n.kind === "class" ? classR(n) : Math.max(DTYPE_W, DTYPE_H) / 2;
      if (x - pad < minX) minX = x - pad;
      if (y - pad < minY) minY = y - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (y + pad > maxY) maxY = y + pad;
    }
    const m = 70;
    setViewBox({ x: minX - m, y: minY - m, w: maxX - minX + m * 2, h: maxY - minY + m * 2 });
  };

  const reheat = () => {
    // Unpin everything so the simulation can fully reorganise
    for (const node of simNodesRef.current) { node.fx = null; node.fy = null; }
    simRef.current?.alpha(0.8).restart();
  };

  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientX - r.left) / r.width)  * viewBox.w,
      y: viewBox.y + ((clientY - r.top)  / r.height) * viewBox.h,
    };
  };

  // ── Mouse handlers ───────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const nodeId = (e.target as SVGElement).closest("[data-node-id]")?.getAttribute("data-node-id");
    if (nodeId) {
      const node = nodeMapRef.current.get(nodeId);
      if (!node) return;
      // Shift+click: toggle pin — unpin a pinned node and let it rejoin the simulation
      if (e.shiftKey) {
        node.fx = null;
        node.fy = null;
        simRef.current?.alpha(0.3).restart();
        scheduleTick();
        e.preventDefault();
        return;
      }
      dragNodeRef.current = node;
      node.fx = node.x ?? 0;
      node.fy = node.y ?? 0;
      simRef.current?.alphaTarget(0.3).restart();
      e.preventDefault();
    } else {
      setPanDrag({ startX: e.clientX, startY: e.clientY, startVB: { ...viewBox } });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragNodeRef.current) {
      const pt  = svgPoint(e.clientX, e.clientY);
      dragNodeRef.current.fx = pt.x;
      dragNodeRef.current.fy = pt.y;
      scheduleTick();
    } else if (panDrag) {
      const cw = containerRef.current?.clientWidth  ?? 1;
      const ch = containerRef.current?.clientHeight ?? 1;
      setViewBox({
        ...panDrag.startVB,
        x: panDrag.startVB.x - (e.clientX - panDrag.startX) / cw * panDrag.startVB.w,
        y: panDrag.startVB.y - (e.clientY - panDrag.startY) / ch * panDrag.startVB.h,
      });
    }
  };

  const handleMouseUp = () => {
    if (dragNodeRef.current) {
      // Pin node at released position — d3 will ignore all forces for pinned nodes,
      // so the user's manual arrangement is preserved. Shift+click to unpin.
      dragNodeRef.current.fx = dragNodeRef.current.x;
      dragNodeRef.current.fy = dragNodeRef.current.y;
      simRef.current?.alphaTarget(0).restart();
      dragNodeRef.current = null;
    }
    setPanDrag(null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const nodeId = (e.target as SVGElement).closest("[data-node-id]")?.getAttribute("data-node-id");
    if (!nodeId) return;
    const node = nodeMapRef.current.get(nodeId);
    if (!node || node.kind !== "class") return;
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const nx = node.x ?? 0, ny = node.y ?? 0;
    const sx = ((nx - viewBox.x) / viewBox.w) * cr.width;
    const sy = ((ny - viewBox.y) / viewBox.h) * cr.height;
    const px = Math.min(Math.max(sx + 20, 8), cr.width  - 368);
    const py = Math.min(Math.max(sy - 40, 40), cr.height - 488);
    setContextMenu(null);
    setFloatingPanel({ kind: "edit-class", classId: nodeId, x: px, y: py });
  };

  // ── Right-click context menu ──────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as SVGElement;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? undefined;
    const linkId = target.closest("[data-link-id]")?.getAttribute("data-link-id") ?? undefined;
    const type: ContextMenu["type"] = nodeId ? "class-node" : linkId ? "edge" : "canvas";
    setContextMenu({ x: e.clientX, y: e.clientY, type, nodeId, linkId });
    setFloatingPanel(null);
  };

  // ── Open floating panel (clamped to container bounds) ─────────────
  const openPanel = (panel: FloatingPanel) => {
    setFloatingPanel(panel);
    setContextMenu(null);
    setEditingClassId(null);
  };

  const panelFromClientXY = (cx: number, cy: number) => {
    const cr = containerRef.current?.getBoundingClientRect();
    if (!cr) return { x: 16, y: 60 };
    return {
      x: Math.min(Math.max(cx - cr.left + 8, 8), cr.width  - 380),
      y: Math.min(Math.max(cy - cr.top  - 20, 40), cr.height - 520),
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    const svg = svgRef.current;
    if (!svg) return;
    const r  = svg.getBoundingClientRect();
    const mx = viewBox.x + ((e.clientX - r.left) / r.width)  * viewBox.w;
    const my = viewBox.y + ((e.clientY - r.top)  / r.height) * viewBox.h;
    setViewBox((vb) => ({
      x: mx - (mx - vb.x) * factor,
      y: my - (my - vb.y) * factor,
      w: vb.w * factor,
      h: vb.h * factor,
    }));
  };

  // ── Edge rendering ────────────────────────────────────────────────
  const renderEdge = useCallback((link: D3Link) => {
    // Attach a hit area + data-link-id for right-click context menu
    const srcNode = resolvedPos(link.source, nodeMapRef.current);
    const tgtNode = resolvedPos(link.target, nodeMapRef.current);
    if (!srcNode || !tgtNode) return null;

    const sx = srcNode.x ?? 0, sy = srcNode.y ?? 0;
    const tx = tgtNode.x ?? 0, ty = tgtNode.y ?? 0;

    // ── Self-loop: a property whose domain == range ──────────────────
    // d3-force collapses these to zero length, so we draw a small arc
    // anchored on the right side of the node and skip force-link entirely.
    if (srcNode.id === tgtNode.id && srcNode.kind === "class") {
      const r = classR(srcNode);
      const loopR = 24;
      // Two anchor points on the node perimeter, slightly above/below the right edge.
      const phi = Math.PI / 7;
      const ax = sx + r * Math.cos(-phi);
      const ay = sy + r * Math.sin(-phi);
      const bx = sx + r * Math.cos(phi);
      const by = sy + r * Math.sin(phi);
      // Label sits at the outer apex of the loop.
      const lx = sx + r + loopR * 1.8;
      const ly = sy;

      let lineColor: string, dash: string, boxBg: string, boxText: string, mEnd: string;
      switch (link.type) {
        case "subClassOf":          lineColor = V.subLine;    dash = "none"; boxBg = "transparent"; boxText = V.subLine;    mEnd = "url(#arr-sub)";   break;
        case "objectProperty":      lineColor = V.obj.line;   dash = "none"; boxBg = V.obj.box;     boxText = V.obj.text;   mEnd = "url(#arr-obj)";   break;
        case "datatypeProperty":    lineColor = V.dtype.line; dash = "6,3"; boxBg = V.dtype.box;   boxText = V.dtype.text; mEnd = "url(#arr-dtype)"; break;
        case "annotationProperty":  lineColor = V.annot.line; dash = "2,4"; boxBg = V.annot.box;   boxText = V.annot.text; mEnd = "url(#arr-annot)"; break;
        case "inverseOf":           lineColor = V.inv.line;   dash = "none"; boxBg = V.inv.box;     boxText = V.inv.text;   mEnd = "url(#arr-inv)";   break;
      }

      const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;
      const lbl = trunc(link.label, 18);
      const bgW = lbl.length * EDGE_CHAR_W + 14;

      return (
        <g key={link.id} data-link-id={link.id}>
          <path
            d={`M ${ax} ${ay} A ${loopR} ${loopR} 0 1 1 ${bx} ${by}`}
            fill="none" stroke="transparent" strokeWidth={18}
          />
          <path
            d={`M ${ax} ${ay} A ${loopR} ${loopR} 0 1 1 ${bx} ${by}`}
            fill="none" stroke={lineColor}
            strokeWidth={1.8}
            strokeDasharray={dash}
            markerEnd={mEnd}
            opacity={0.85}
          />
          {link.type !== "subClassOf" && (
            <g>
              <rect x={lx - bgW / 2} y={ly - 9} width={bgW} height={18} rx={3} fill={boxBg} opacity={0.93} />
              <text x={lx} y={ly + 4} textAnchor="middle" fill={boxText} fontSize={FS_EDGE} fontFamily={FONT} fontWeight={500}>{lbl}</text>
            </g>
          )}
        </g>
      );
    }

    // Parallel-edge offset
    const parallels = simLinksRef.current.filter((l) => {
      const lSrc = typeof l.source === "object" ? l.source.id : l.source;
      const lTgt = typeof l.target === "object" ? l.target.id : l.target;
      const eSrc = typeof link.source === "object" ? link.source.id : link.source;
      const eTgt = typeof link.target === "object" ? link.target.id : link.target;
      return (lSrc === eSrc && lTgt === eTgt) || (lSrc === eTgt && lTgt === eSrc);
    });
    const pIdx    = parallels.indexOf(link);
    const pOffset = parallels.length > 1 ? (pIdx - (parallels.length - 1) / 2) * 34 : 0;

    const midX  = (sx + tx) / 2;
    const midY  = (sy + ty) / 2;
    const edLen = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;
    const ctrlX = midX + (-(ty - sy) / edLen) * pOffset;
    const ctrlY = midY + ( (tx - sx) / edLen) * pOffset;

    // Trim to node boundaries
    const src = nodeAnchor(srcNode, tx, ty);
    const tgt = nodeAnchor(tgtNode, sx, sy);

    // Bezier midpoint for label
    const lx = 0.25 * src.x + 0.5 * ctrlX + 0.25 * tgt.x;
    const ly = 0.25 * src.y + 0.5 * ctrlY + 0.25 * tgt.y;

    let lineColor: string, dash: string, boxBg: string, boxText: string;
    let mEnd: string, mStart: string | undefined;

    switch (link.type) {
      case "subClassOf":       lineColor = V.subLine;   dash = "none"; boxBg = "transparent"; boxText = V.subLine;   mEnd = "url(#arr-sub)";   break;
      case "objectProperty":   lineColor = V.obj.line;  dash = "none"; boxBg = V.obj.box;  boxText = V.obj.text;  mEnd = "url(#arr-obj)";   break;
      case "datatypeProperty": lineColor = V.dtype.line; dash = "6,3"; boxBg = V.dtype.box; boxText = V.dtype.text; mEnd = "url(#arr-dtype)"; break;
      case "annotationProperty": lineColor = V.annot.line; dash = "2,4"; boxBg = V.annot.box; boxText = V.annot.text; mEnd = "url(#arr-annot)"; break;
      case "inverseOf":        lineColor = V.inv.line;  dash = "none"; boxBg = V.inv.box;  boxText = V.inv.text;  mEnd = "url(#arr-inv)"; mStart = "url(#arr-inv-s)"; break;
    }

    const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

    let labelEl: React.ReactNode = null;
    if (link.type !== "subClassOf") {
      if (link.type === "inverseOf") {
        const parts = link.label.split(" ⇌ ");
        const fwd = trunc(parts[0] ?? "", 16), inv = trunc(parts[1] ?? "", 16);
        const bgW = Math.max(fwd.length, inv.length + 2) * EDGE_CHAR_W + 14;
        labelEl = (
          <g>
            <rect x={lx - bgW / 2} y={ly - 19} width={bgW} height={30} rx={3} fill={boxBg} opacity={0.93} />
            <text textAnchor="middle" fill={boxText} fontSize={FS_EDGE} fontFamily={FONT} fontWeight={500}>
              <tspan x={lx} y={ly - 5}>{fwd}</tspan>
              <tspan x={lx} dy={15}>⇌ {inv}</tspan>
            </text>
          </g>
        );
      } else {
        const lbl = trunc(link.label, 18);
        const bgW = lbl.length * EDGE_CHAR_W + 14;
        labelEl = (
          <g>
            <rect x={lx - bgW / 2} y={ly - 13} width={bgW} height={18} rx={3} fill={boxBg} opacity={0.93} />
            <text x={lx} y={ly - 1} textAnchor="middle" fill={boxText} fontSize={FS_EDGE} fontFamily={FONT} fontWeight={500}>{lbl}</text>
          </g>
        );
      }
    }

    return (
      <g key={link.id} data-link-id={link.id}>
        {/* Transparent wide hit area so right-click is easy */}
        <path
          d={`M ${src.x} ${src.y} Q ${ctrlX} ${ctrlY} ${tgt.x} ${tgt.y}`}
          fill="none" stroke="transparent" strokeWidth={18}
        />
        <path
          d={`M ${src.x} ${src.y} Q ${ctrlX} ${ctrlY} ${tgt.x} ${tgt.y}`}
          fill="none" stroke={lineColor}
          strokeWidth={link.type === "subClassOf" ? 1.5 : 1.8}
          strokeDasharray={dash}
          markerEnd={mEnd} markerStart={mStart}
          opacity={0.85}
        />
        {labelEl}
      </g>
    );
  }, []);

  // ── Class node ────────────────────────────────────────────────────
  // ── Wrap label text to fit inside a circle ──────────────────────
  // Returns an array of lines, each short enough to fit within the chord
  // at the y-offset where that line sits (chord width = 2*sqrt(r²-y²)).
  // We use a simple word-split strategy: greedy packing with a char-width estimate.
  const wrapLabel = (label: string, r: number, fontSize: number): string[] => {
    const charW = fontSize * 0.58; // monospace-ish estimate
    const words = label.split(/(?=[A-Z])|[_\s-]+/g).filter(Boolean); // split camelCase + spaces
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const test = current ? current + " " + word : word;
      // Available chord width at this line's vertical position
      const lineIdx  = lines.length;
      const totalLines = Math.ceil(label.length * charW / (r * 1.55)); // rough estimate
      const yOff = (lineIdx - (totalLines - 1) / 2) * (fontSize + 2);
      const chordW = 2 * Math.sqrt(Math.max(0, r * r - yOff * yOff)) * 0.88; // 88% of chord
      if (test.length * charW > chordW && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const renderClassNode = useCallback((node: SimNode) => {
    const x     = node.x ?? 0, y = node.y ?? 0;
    const r     = classR(node);
    const isHov = hoveredId === node.id;
    const isPinned = node.fx != null;

    // Wrap label to fit inside circle
    const lines   = wrapLabel(node.label, r, FS_CLASS);
    const nLines  = lines.length;
    const lineH   = 17; // px between baselines (was 14, bigger for FS_CLASS=14)
    const hasProps = node.propertyCount > 0;
    // Shift text block up slightly when property count is shown below
    const blockTopY = y - ((nLines - 1) * lineH) / 2 - (hasProps ? lineH * 0.4 : 0);

    return (
      <g key={node.id} data-node-id={node.id}
        style={{ cursor: dragNodeRef.current?.id === node.id ? "grabbing" : "grab" }}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}>
        {isHov && <circle cx={x} cy={y} r={r + 7} fill="none" stroke={V.classStroke} strokeWidth={1.5} opacity={0.4} />}
        <circle cx={x} cy={y} r={r} fill={V.classFill} stroke={isHov ? V.classStroke : "#5577aa"} strokeWidth={isHov ? 2.5 : 2} />
        {lines.map((line, i) => (
          <text key={i}
            x={x} y={blockTopY + i * lineH}
            textAnchor="middle" dominantBaseline="middle"
            fill={V.classText} fontSize={FS_CLASS} fontWeight={600} fontFamily={FONT} pointerEvents="none">
            {line}
          </text>
        ))}
        {hasProps && (
          <text x={x} y={blockTopY + nLines * lineH - 2} textAnchor="middle" dominantBaseline="middle"
            fill="#3355aa" fontSize={FS_META} fontFamily={FONT} pointerEvents="none">
            {node.propertyCount} prop{node.propertyCount !== 1 ? "s" : ""}
          </text>
        )}
        {/* Pin indicator */}
        {isPinned && (
          <circle cx={x + r * 0.72} cy={y - r * 0.72} r={4}
            fill="#335599" stroke="white" strokeWidth={1} pointerEvents="none" />
        )}
      </g>
    );
  }, [hoveredId]);

  // ── Datatype node ─────────────────────────────────────────────────
  const renderDtypeNode = useCallback((node: SimNode) => {
    const x = node.x ?? 0, y = node.y ?? 0;
    const hw = DTYPE_W / 2, hh = DTYPE_H / 2;
    const isHov = hoveredId === node.id;
    const lbl = node.label.length > 16 ? node.label.slice(0, 15) + "…" : node.label;
    return (
      <g key={node.id} data-node-id={node.id}
        style={{ cursor: "grab" }}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}>
        {isHov && <rect x={x - hw - 4} y={y - hh - 4} width={DTYPE_W + 8} height={DTYPE_H + 8} rx={5} fill="none" stroke={V.dtypeStroke} strokeWidth={1.5} opacity={0.4} />}
        <rect x={x - hw} y={y - hh} width={DTYPE_W} height={DTYPE_H} rx={4}
          fill={V.dtypeFill} stroke={isHov ? V.dtypeStroke : "#447722"} strokeWidth={isHov ? 2.5 : 2} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
          fill={V.dtypeText} fontSize={FS_DTYPE} fontFamily={FONT} fontWeight={500} pointerEvents="none">
          {lbl}
        </text>
      </g>
    );
  }, [hoveredId]);

  if (!activeOntology) return null;

  const simNodes = simNodesRef.current;
  const simLinks = simLinksRef.current;

  return (
    <div className="flex h-full flex-col bg-th-base" ref={containerRef} style={{ position: "relative" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-th-border px-3 py-2">
        <h3 className="text-xs font-semibold text-th-fg">Ontology Graph</h3>

        <div className="ml-4 flex items-center gap-3 text-2xs text-th-fg-3">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill={V.classFill} stroke={V.classStroke} strokeWidth="1.5" /></svg>
            Class
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="14"><rect x="1" y="2" width="20" height="10" rx="2" fill={V.dtypeFill} stroke={V.dtypeStroke} strokeWidth="1.5" /></svg>
            Datatype
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.subLine} strokeWidth="1.5" />
              <polygon points="14,1 24,4 14,7" fill="white" stroke={V.subLine} strokeWidth="1" />
            </svg>
            subClassOf
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.obj.line} strokeWidth="1.8" />
              <polygon points="14,1 24,4 14,7" fill={V.obj.line} />
            </svg>
            Object
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.dtype.line} strokeWidth="1.8" strokeDasharray="4,2" />
              <polygon points="14,1 24,4 14,7" fill={V.dtype.line} />
            </svg>
            Datatype
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.inv.line} strokeWidth="1.8" />
              <polygon points="2,1 12,4 2,7" fill={V.inv.line} />
              <polygon points="14,1 24,4 14,7" fill={V.inv.line} />
            </svg>
            Inverse
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <label className="mr-3 flex items-center gap-1.5 text-2xs text-th-fg-3">
            <input type="checkbox" checked={showDatatypes} onChange={(e) => setShowDatatypes(e.target.checked)} className="accent-th-fg" />
            Datatypes
          </label>
          <label className="mr-3 flex items-center gap-1.5 text-2xs text-th-fg-3">
            <input type="checkbox" checked={showAnnotations} onChange={(e) => setShowAnnotations(e.target.checked)} className="accent-th-fg" />
            Annotations
          </label>
          <button
            onClick={() => openPanel({ kind: "new-class", x: 80, y: 60 })}
            className="mr-1 flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium text-blue-400 hover:bg-blue-400/10"
            title="Create a new class"
          >
            <Plus size={12} /> New Class
          </button>
          <span className="mr-2 text-2xs text-th-fg-4" title="Right-click canvas/nodes/edges to create or edit. Drag to pin. Shift+click to unpin.">
            right-click to edit · drag=pin
          </span>
          <button onClick={reheat} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Unpin all nodes and reheat layout"><RefreshCw size={13} /></button>
          <button onClick={() => zoom(0.8)}  className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Zoom in"><ZoomIn    size={14} /></button>
          <button onClick={() => zoom(1.25)} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Zoom out"><ZoomOut   size={14} /></button>
          <button onClick={fitToView}        className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Fit to view"><Maximize2 size={14} /></button>
          <button onClick={onClose}          className="ml-2 rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Close"><X size={14} /></button>
        </div>
      </div>

      {/* Canvas */}
      {simNodes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-th-fg-3">No classes to visualise.</p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="flex-1"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          style={{ cursor: panDrag ? "grabbing" : "default" }}
        >
          <defs>
            <marker id="arr-sub"   viewBox="0 0 12 10" refX="11" refY="5" markerWidth="8"  markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--th-base, #fff)" stroke={V.subLine} strokeWidth="1.5" />
            </marker>
            <marker id="arr-obj"   viewBox="0 0 10 10" refX="9"  refY="5" markerWidth="6"  markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.obj.line} />
            </marker>
            <marker id="arr-dtype" viewBox="0 0 10 10" refX="9"  refY="5" markerWidth="6"  markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.dtype.line} />
            </marker>
            <marker id="arr-annot" viewBox="0 0 10 10" refX="9"  refY="5" markerWidth="6"  markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.annot.line} />
            </marker>
            <marker id="arr-inv"   viewBox="0 0 10 10" refX="9"  refY="5" markerWidth="6"  markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.inv.line} />
            </marker>
            <marker id="arr-inv-s" viewBox="0 0 10 10" refX="1"  refY="5" markerWidth="6"  markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.inv.line} />
            </marker>
          </defs>

          {simLinks.map((l) => renderEdge(l))}
          {simNodes.filter((n) => n.kind === "class").map(renderClassNode)}
          {simNodes.filter((n) => n.kind === "datatype").map(renderDtypeNode)}
        </svg>
      )}

      {/* Hover tooltip */}
      {hoveredId && (() => {
        const node = nodeMapRef.current.get(hoveredId);
        if (!node) return null;
        if (node.kind === "class") {
          const cls = classes.find((c) => c.id === node.id);
          const prefixes = activeOntology?.metadata.prefixes ?? {};
          const ownDatatype = properties.filter((p) => p.type === "owl:DatatypeProperty" && p.domainUri === node.uri);
          const ownAnnotation = properties.filter((p) => p.type === "owl:AnnotationProperty" && p.domainUri === node.uri);
          return (
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-sm rounded border border-th-border bg-th-surface px-3 py-2 shadow-lg">
              <div className="text-xs font-semibold text-th-fg">{node.label}</div>
              <div className="truncate font-mono text-2xs text-th-fg-3">{node.uri}</div>
              {cls?.descriptions[0]?.value && (
                <div className="mt-1 text-2xs text-th-fg-2">{cls.descriptions[0].value}</div>
              )}
              {ownDatatype.length > 0 && (
                <div className="mt-2">
                  <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-prop-datatype-500">
                    Datatype properties
                  </div>
                  <ul className="space-y-0.5">
                    {ownDatatype.map((p) => {
                      const rng = (p.ranges ?? []).map((r) => compact(r, prefixes)).join(", ");
                      return (
                        <li key={p.id} className="flex items-baseline gap-2 text-2xs">
                          <span className="text-th-fg">{p.labels[0]?.value || p.localName}</span>
                          {rng && <span className="font-mono text-th-fg-4">{rng}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {ownAnnotation.length > 0 && (
                <div className="mt-2">
                  <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-prop-annotation-500">
                    Annotation properties
                  </div>
                  <ul className="space-y-0.5">
                    {ownAnnotation.map((p) => (
                      <li key={p.id} className="text-2xs text-th-fg">{p.labels[0]?.value || p.localName}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ownDatatype.length === 0 && ownAnnotation.length === 0 && (
                <div className="mt-1 text-2xs italic text-th-fg-4">No datatype or annotation properties on this class.</div>
              )}
            </div>
          );
        }
        return (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-th-border bg-th-surface px-3 py-2 shadow-lg">
            <div className="text-xs font-semibold text-th-fg">{node.label}</div>
            <div className="font-mono text-2xs text-th-fg-3">{node.uri}</div>
          </div>
        );
      })()}

      {/* ── Context menu ────────────────────────────────────────────── */}
      {contextMenu && (
        <>
          {/* Backdrop to dismiss */}
          <div className="fixed inset-0 z-40" onMouseDown={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-44 rounded-lg border border-th-border bg-th-surface py-1 shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* ── Canvas right-click ── */}
            {contextMenu.type === "canvas" && (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
                onClick={() => openPanel({ kind: "new-class", ...panelFromClientXY(contextMenu.x, contextMenu.y) })}
              >
                <Plus size={13} className="text-blue-400" />
                New Class
              </button>
            )}

            {/* ── Class node right-click ── */}
            {contextMenu.type === "class-node" && contextMenu.nodeId && (() => {
              const nodeId = contextMenu.nodeId!;
              const cls = classes.find((c) => c.id === nodeId);
              return (
                <>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
                    onClick={() => openPanel({ kind: "edit-class", classId: nodeId, ...panelFromClientXY(contextMenu.x, contextMenu.y) })}
                  >
                    <Pencil size={12} className="text-th-fg-3" />
                    Edit Class
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
                    onClick={() => openPanel({ kind: "new-property", defaultDomainUri: cls?.uri ?? "", ...panelFromClientXY(contextMenu.x, contextMenu.y) })}
                  >
                    <CirclePlus size={13} className="text-emerald-400" />
                    Add Property
                  </button>
                  <div className="my-1 border-t border-th-border" />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10"
                    onClick={() => { deleteClass(nodeId); setContextMenu(null); }}
                  >
                    <Trash2 size={12} />
                    Delete Class
                  </button>
                </>
              );
            })()}

            {/* ── Edge right-click ── */}
            {contextMenu.type === "edge" && contextMenu.linkId && (() => {
              const link = simLinksRef.current.find((l) => l.id === contextMenu.linkId);
              if (!link) return null;
              // Derive property id from link id: "obj-<propId>", "dtype-<propId>", "annot-<propId>"
              // Link IDs are: "obj-<propId>-<rngId>", "dtype-<propId>-<rangeUri>", etc.
              // prop.id is always the first 8-char hex segment after the prefix.
              const afterPrefix = link.id.replace(/^(obj|dtype|annot|inv)-/, "");
              const propId = afterPrefix.split("-")[0]!;
              const prop = properties.find((p) => p.id === propId);
              return (
                <>
                  {prop && (
                    <button
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
                      onClick={() => openPanel({ kind: "edit-property", propertyId: prop.id, ...panelFromClientXY(contextMenu.x, contextMenu.y) })}
                    >
                      <Pencil size={12} className="text-th-fg-3" />
                      Edit Property
                    </button>
                  )}
                  {prop && (
                    <>
                      <div className="my-1 border-t border-th-border" />
                      <button
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10"
                        onClick={() => { deleteProperty(prop.id); setContextMenu(null); }}
                      >
                        <Trash2 size={12} />
                        Delete Property
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* ── Floating editor panels ───────────────────────────────────── */}
      {floatingPanel && (() => {
        const close = () => setFloatingPanel(null);
        // Clamp so the panel's bottom never exceeds the container.
        // We don't know the panel's render height upfront, so we express it as:
        //   top = min(floatingPanel.y, containerHeight - PANEL_MAX_H - toolbar)
        // by using bottom = containerHeight - (floatingPanel.y + PANEL_MAX_H) when it would clip,
        // or simply anchor "bottom" from the container edge when y is too large.
        const PANEL_W = 370;
        const PANEL_MAX_H = 560; // generous max so Save is always reachable
        const containerH = containerRef.current?.clientHeight ?? 600;
        const containerW = containerRef.current?.clientWidth  ?? 900;
        const toolbar    = 44; // approx toolbar height
        const clampedX   = Math.min(Math.max(floatingPanel.x, 8), containerW - PANEL_W - 8);
        const clampedY   = Math.min(Math.max(floatingPanel.y, toolbar + 4), containerH - PANEL_MAX_H - 8);

        const panelStyle: React.CSSProperties = {
          position: "absolute",
          left: clampedX,
          top: clampedY,
          width: PANEL_W,
          zIndex: 50,
          maxHeight: containerH - clampedY - 8,
          display: "flex",
          flexDirection: "column",
        };
        const headerCls = "flex items-center justify-between rounded-t border-b border-th-border-muted bg-th-surface px-3 py-1.5";

        if (floatingPanel.kind === "edit-class") {
          const cls = classes.find((c) => c.id === floatingPanel.classId);
          if (!cls) return null;
          return (
            <div style={panelStyle} className="rounded-lg border border-th-border shadow-2xl">
              <div className={headerCls}>
                <span className="text-xs font-semibold text-th-fg">Edit Class · {cls.labels[0]?.value || cls.localName}</span>
                <button onClick={close} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={13} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ClassForm existing={cls} onDone={close} />
              </div>
            </div>
          );
        }

        if (floatingPanel.kind === "new-class") {
          return (
            <div style={panelStyle} className="rounded-lg border border-th-border shadow-2xl">
              <div className={headerCls}>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-th-fg">
                  <Plus size={12} className="text-blue-400" /> New Class
                </span>
                <button onClick={close} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={13} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ClassForm onDone={close} />
              </div>
            </div>
          );
        }

        if (floatingPanel.kind === "edit-property") {
          const prop = properties.find((p) => p.id === floatingPanel.propertyId);
          if (!prop) return null;
          return (
            <div style={panelStyle} className="rounded-lg border border-th-border shadow-2xl">
              <div className={headerCls}>
                <span className="text-xs font-semibold text-th-fg">Edit Property · {prop.labels[0]?.value || prop.localName}</span>
                <button onClick={close} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={13} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PropertyForm existing={prop} onDone={close} />
              </div>
            </div>
          );
        }

        if (floatingPanel.kind === "new-property") {
          return (
            <div style={panelStyle} className="rounded-lg border border-th-border shadow-2xl">
              <div className={headerCls}>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-th-fg">
                  <CirclePlus size={12} className="text-emerald-400" /> New Property
                </span>
                <button onClick={close} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={13} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <PropertyForm defaultDomainUri={floatingPanel.defaultDomainUri} onDone={close} />
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Legacy double-click class editor (kept as fallback) */}
      {editingClassId && !floatingPanel && (() => {
        const cls = classes.find((c) => c.id === editingClassId);
        if (!cls) return null;
        return (
          <div
            style={{ position: "absolute", left: editPanelPos.x, top: editPanelPos.y, width: 360, zIndex: 50 }}
            className="rounded-lg border border-th-border shadow-2xl"
          >
            <div className="flex items-center justify-between rounded-t border-b border-th-border-muted bg-th-surface px-3 py-1.5">
              <span className="text-xs font-semibold text-th-fg">Edit: {cls.labels[0]?.value || cls.localName}</span>
              <button onClick={() => setEditingClassId(null)} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={13} /></button>
            </div>
            <div className="max-h-[440px] overflow-y-auto">
              <ClassForm existing={cls} onDone={() => setEditingClassId(null)} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
