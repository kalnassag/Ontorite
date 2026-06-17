/**
 * Interactive SVG graph visualisation of individuals (instances).
 * Nodes = individuals, edges = object property assertions.
 * Supports pan/zoom/drag, entity creation, edge creation, and right-click context menu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Plus, Link, Trash2 } from "lucide-react";
import { useStore } from "../../lib/store";
import { computeLayout } from "../../lib/graph-utils";
import { localName } from "../../lib/uri-utils";
import CreateEntityDialog from "../dialogs/CreateEntityDialog";
import CreateEdgeDialog from "../dialogs/CreateEdgeDialog";
import type { Individual, IndividualPropertyValue } from "../../types";

/* ── Node and edge types ─────────────────────────────────────── */

interface EntityNode {
  id: string;
  label: string;
  uri: string;
  typeUri: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface EntityEdge {
  source: string;
  target: string;
  propertyUri: string;
  label: string;
}

/* ── Colour palette for node types ─────────────────────────────── */

const PALETTE = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

function buildColorMap(individuals: Individual[]): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  for (const ind of individuals) {
    const typeUri = ind.typeUris[0] ?? "";
    if (typeUri && !map.has(typeUri)) {
      map.set(typeUri, PALETTE[i % PALETTE.length]!);
      i++;
    }
  }
  return map;
}

/* ── Context menu state ──────────────────────────────────────── */

interface ContextMenu {
  x: number;
  y: number;
  type: "canvas" | "node";
  nodeId?: string;
}

/* ── Component ────────────────────────────────────────────────── */

export default function EntityGraph() {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const addIndividual = useStore((s) => s.addIndividual);
  const deleteIndividual = useStore((s) => s.deleteIndividual);
  const addIndividualProperty = useStore((s) => s.addIndividualProperty);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [dragging, setDragging] = useState<
    | { nodeId: string }
    | { pan: true; startX: number; startY: number; startVB: typeof viewBox }
    | null
  >(null);
  const [dragNodePos, setDragNodePos] = useState<{ id: string; x: number; y: number } | null>(null);

  const [nodes, setNodes] = useState<EntityNode[]>([]);
  const [edges, setEdges] = useState<EntityEdge[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Edge creation mode
  const [edgeCreationMode, setEdgeCreationMode] = useState(false);
  const [pendingEdgeSourceId, setPendingEdgeSourceId] = useState<string | null>(null);
  const [edgeDialogProps, setEdgeDialogProps] = useState<{
    source: Individual;
    target: Individual;
  } | null>(null);

  // Entity creation dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const individuals = activeOntology?.individuals ?? [];
  const classes = activeOntology?.classes ?? [];
  const properties = activeOntology?.properties ?? [];
  const objectProperties = properties.filter((p) => p.type === "owl:ObjectProperty");

  const colorMap = useMemo(() => buildColorMap(individuals), [individuals]);

  // Rebuild graph when individuals change
  useEffect(() => {
    if (individuals.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const indMap = new Map<string, Individual>();
    for (const ind of individuals) indMap.set(ind.uri, ind);

    const newNodes: EntityNode[] = individuals.map((ind) => ({
      id: ind.id,
      label: ind.localName,
      uri: ind.uri,
      typeUri: ind.typeUris[0] ?? "",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    }));

    const newEdges: EntityEdge[] = [];
    for (const ind of individuals) {
      for (const pv of ind.propertyValues) {
        if (!pv.isLiteral) {
          const targetInd = indMap.get(pv.value);
          if (targetInd) {
            const prop = properties.find((p) => p.uri === pv.propertyUri);
            newEdges.push({
              source: ind.id,
              target: targetInd.id,
              propertyUri: pv.propertyUri,
              label: prop?.labels[0]?.value || localName(pv.propertyUri),
            });
          }
        }
      }
    }

    const N = newNodes.length;
    const w = Math.max(1600, 280 * Math.sqrt(N));
    const h = Math.max(1000, 220 * Math.sqrt(N));

    // Scale layout parameters
    const idealEdgeLength = Math.max(220, 100 + 40 * Math.sqrt(N));
    const minDist = Math.max(150, 100 + 20 * Math.sqrt(N));
    const repulsion = Math.max(28000, 10000 + 5000 * Math.sqrt(N));

    computeLayout(newNodes, newEdges, w, h, { idealEdgeLength, minDist, repulsion });

    // Preserve manual drag positions for existing nodes
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, { x: n.x, y: n.y }]));
      return newNodes.map((n) => {
        const existing = posMap.get(n.id);
        return existing ? { ...n, x: existing.x, y: existing.y } : n;
      });
    });
    setEdges(newEdges);
    setViewBox({ x: 0, y: 0, w, h });
  }, [individuals, properties]);

  const getNodePos = useCallback(
    (id: string) => {
      if (dragNodePos?.id === id) return { x: dragNodePos.x, y: dragNodePos.y };
      const node = nodes.find((n) => n.id === id);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    },
    [nodes, dragNodePos]
  );

  /* ── Zoom ──────────────────────────────────────────────────── */

  const zoom = (factor: number) => {
    setViewBox((vb) => {
      const newW = vb.w * factor;
      const newH = vb.h * factor;
      return {
        x: vb.x + (vb.w - newW) / 2,
        y: vb.y + (vb.h - newH) / 2,
        w: newW,
        h: newH,
      };
    });
  };

  const fitToView = () => {
    if (nodes.length === 0) return;
    const padding = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    setViewBox({
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
    });
  };

  /* ── Mouse handling ──────────────────────────────────────────── */

  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");

    if (nodeId) {
      if (edgeCreationMode) {
        // Edge creation: first click sets source, second click sets target
        if (!pendingEdgeSourceId) {
          setPendingEdgeSourceId(nodeId);
        } else if (nodeId !== pendingEdgeSourceId) {
          const sourceInd = individuals.find((i) => i.id === pendingEdgeSourceId);
          const targetInd = individuals.find((i) => i.id === nodeId);
          if (sourceInd && targetInd) {
            setEdgeDialogProps({ source: sourceInd, target: targetInd });
          }
          setPendingEdgeSourceId(null);
        }
        return;
      }
      setSelectedEntityId(nodeId === selectedEntityId ? null : nodeId);
      setDragging({ nodeId });
      e.preventDefault();
    } else {
      setDragging({ pan: true, startX: e.clientX, startY: e.clientY, startVB: { ...viewBox } });
      if (!edgeCreationMode) setSelectedEntityId(null);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    if ("pan" in dragging) {
      const dx =
        ((e.clientX - dragging.startX) / (containerRef.current?.clientWidth ?? 1)) *
        dragging.startVB.w;
      const dy =
        ((e.clientY - dragging.startY) / (containerRef.current?.clientHeight ?? 1)) *
        dragging.startVB.h;
      setViewBox({ ...dragging.startVB, x: dragging.startVB.x - dx, y: dragging.startVB.y - dy });
    } else if ("nodeId" in dragging) {
      const pt = svgPoint(e.clientX, e.clientY);
      setDragNodePos({ id: dragging.nodeId, x: pt.x, y: pt.y });
    }
  };

  const handleMouseUp = () => {
    if (dragging && "nodeId" in dragging && dragNodePos) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragNodePos.id ? { ...n, x: dragNodePos.x, y: dragNodePos.y } : n
        )
      );
      setDragNodePos(null);
    }
    setDragging(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
    const my = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;
    setViewBox((vb) => {
      const newW = vb.w * factor;
      const newH = vb.h * factor;
      return {
        x: mx - (mx - vb.x) * factor,
        y: my - (my - vb.y) * factor,
        w: newW,
        h: newH,
      };
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as SVGElement;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? undefined;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: nodeId ? "node" : "canvas",
      nodeId,
    });
  };

  /* ── Entity creation ─────────────────────────────────────────── */

  const handleCreateEntity = (label: string, typeUri: string) => {
    setShowCreateDialog(false);
    const newId = addIndividual(label, typeUri);
    setSelectedEntityId(newId);
  };

  /* ── Edge creation ───────────────────────────────────────────── */

  const handleConfirmEdge = (propertyUri: string) => {
    if (!edgeDialogProps) return;
    const propVal: IndividualPropertyValue = {
      propertyUri,
      value: edgeDialogProps.target.uri,
      isLiteral: false,
    };
    addIndividualProperty(edgeDialogProps.source.id, propVal);
    setEdgeDialogProps(null);
  };

  /* ── Edge rendering ──────────────────────────────────────────── */

  const renderEdge = (edge: EntityEdge, index: number) => {
    const s = getNodePos(edge.source);
    const t = getNodePos(edge.target);

    // ── Self-loop branch (e.g. :alice :knows :alice) ──────────────────
    if (edge.source === edge.target) {
      const r = 26; // approximate node radius used in renderNode
      const loopR = 22;
      const phi = Math.PI / 7;
      const ax = s.x + r * Math.cos(-phi);
      const ay = s.y + r * Math.sin(-phi);
      const bx = s.x + r * Math.cos(phi);
      const by = s.y + r * Math.sin(phi);
      const lx = s.x + r + loopR * 1.8;
      const ly = s.y;
      return (
        <g key={`edge-${index}`}>
          <path
            d={`M ${ax} ${ay} A ${loopR} ${loopR} 0 1 1 ${bx} ${by}`}
            fill="none"
            stroke="#6366f1"
            strokeWidth={1.5}
            markerEnd="url(#arrow-entity)"
            opacity={0.7}
          />
          <text
            x={lx}
            y={ly + 2}
            textAnchor="middle"
            fill="#6366f1"
            fontSize={12}
            fontWeight={500}
            fontFamily="IBM Plex Sans, sans-serif"
            opacity={0.9}
          >
            {edge.label}
          </text>
        </g>
      );
    }

    // Offset parallel edges
    const parallels = edges.filter(
      (e) =>
        (e.source === edge.source && e.target === edge.target) ||
        (e.source === edge.target && e.target === edge.source)
    );
    const pIdx = parallels.indexOf(edge);
    const offset = parallels.length > 1 ? (pIdx - (parallels.length - 1) / 2) * 28 : 0;

    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const cx2 = mx + px * offset;
    const cy2 = my + py * offset;

    return (
      <g key={`edge-${index}`}>
        <path
          d={`M ${s.x} ${s.y} Q ${cx2} ${cy2} ${t.x} ${t.y}`}
          fill="none"
          stroke="#6366f1"
          strokeWidth={1.5}
          markerEnd="url(#arrow-entity)"
          opacity={0.7}
        />
        <text
          x={cx2}
          y={cy2 - 6}
          textAnchor="middle"
          fill="#6366f1"
          fontSize={9}
          fontFamily="IBM Plex Sans, sans-serif"
          opacity={0.9}
        >
          {edge.label}
        </text>
      </g>
    );
  };

  /* ── Node rendering ──────────────────────────────────────────── */

  const renderNode = (node: EntityNode) => {
    const pos = getNodePos(node.id);
    const isHovered = hoveredNodeId === node.id;
    const isSelected = selectedEntityId === node.id;
    const isPendingSource = pendingEdgeSourceId === node.id;
    const color = colorMap.get(node.typeUri) ?? "#6b7280";
    const r = isHovered || isSelected ? 28 : 24;

    return (
      <g
        key={node.id}
        data-node-id={node.id}
        style={{ cursor: edgeCreationMode ? "crosshair" : "grab" }}
        onMouseEnter={() => setHoveredNodeId(node.id)}
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        {/* Selection/source ring */}
        {(isSelected || isPendingSource) && (
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 6}
            fill="none"
            stroke={isPendingSource ? "#f59e0b" : "#3b82f6"}
            strokeWidth={2}
            opacity={0.5}
          />
        )}
        {/* Hover glow */}
        {isHovered && !isSelected && (
          <circle cx={pos.x} cy={pos.y} r={r + 5} fill={color} opacity={0.15} />
        )}
        {/* Node circle */}
        <circle
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill={isSelected ? color : "var(--th-surface)"}
          stroke={color}
          strokeWidth={isSelected ? 0 : 2}
        />
        {/* Label */}
        <text
          x={pos.x}
          y={pos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={isSelected ? "white" : "var(--th-fg)"}
          fontSize={13}
          fontWeight={600}
          fontFamily="IBM Plex Sans, sans-serif"
          pointerEvents="none"
        >
          {node.label.length > 14 ? node.label.slice(0, 12) + "…" : node.label}
        </text>
      </g>
    );
  };

  if (!activeOntology) return null;

  /* ── Selected entity side panel ─────────────────────────────── */

  const selectedIndividual = selectedEntityId
    ? individuals.find((i) => i.id === selectedEntityId)
    : null;

  /* ── Legend ──────────────────────────────────────────────────── */

  const legendEntries = Array.from(colorMap.entries()).map(([typeUri, color]) => {
    const cls = classes.find((c) => c.uri === typeUri);
    return { label: cls?.labels[0]?.value || localName(typeUri), color };
  });

  return (
    <div className="flex h-full flex-col bg-th-base" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-th-border px-3 py-2">
        <h3 className="text-xs font-semibold text-th-fg">Entity Graph</h3>

        {/* Legend */}
        {legendEntries.length > 0 && (
          <div className="ml-3 flex items-center gap-3">
            {legendEntries.map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1 text-2xs text-th-fg-3">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* New entity */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1 rounded px-2 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            title="New entity"
          >
            <Plus size={13} />
            New Entity
          </button>

          {/* Edge creation mode */}
          <button
            onClick={() => {
              setEdgeCreationMode((m) => !m);
              setPendingEdgeSourceId(null);
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium ${
              edgeCreationMode
                ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-400"
                : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            }`}
            title={edgeCreationMode ? "Cancel relationship mode" : "Add relationship between entities"}
          >
            <Link size={13} />
            {edgeCreationMode
              ? pendingEdgeSourceId
                ? "Click target…"
                : "Click source…"
              : "Add Relationship"}
          </button>

          <div className="ml-1 flex items-center">
            <button
              onClick={() => zoom(0.8)}
              className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => zoom(1.25)}
              className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={fitToView}
              className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
              title="Fit to view"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Graph area */}
      <div className="relative flex-1 overflow-hidden">
        {individuals.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-th-fg-3">No entities yet.</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus size={13} />
              Create your first entity
            </button>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="h-full w-full"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            style={{
              cursor:
                edgeCreationMode
                  ? "crosshair"
                  : dragging && "pan" in dragging
                  ? "grabbing"
                  : "default",
            }}
          >
            <defs>
              <marker
                id="arrow-entity"
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
                fill="#6366f1"
              >
                <path d="M 0 2 L 10 5 L 0 8 z" />
              </marker>
            </defs>

            {edges.map((edge, i) => renderEdge(edge, i))}
            {nodes.map(renderNode)}
          </svg>
        )}

        {/* Hover tooltip */}
        {hoveredNodeId && !selectedEntityId && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-th-border bg-th-surface px-3 py-2 shadow-lg">
            {(() => {
              const node = nodes.find((n) => n.id === hoveredNodeId);
              if (!node) return null;
              const ind = individuals.find((i) => i.id === hoveredNodeId);
              const cls = classes.find((c) => c.uri === node.typeUri);
              return (
                <div>
                  <div className="text-xs font-semibold text-th-fg">{node.label}</div>
                  <div className="font-mono text-2xs text-th-fg-3">{node.uri}</div>
                  {cls && (
                    <div className="mt-0.5 text-2xs text-th-fg-4">
                      {cls.labels[0]?.value || cls.localName}
                    </div>
                  )}
                  {ind && ind.propertyValues.length > 0 && (
                    <div className="mt-0.5 text-2xs text-th-fg-4">
                      {ind.propertyValues.length} property value
                      {ind.propertyValues.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Selected entity panel */}
        {selectedIndividual && (
          <div className="absolute bottom-3 left-3 w-64 rounded border border-th-border bg-th-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-th-border px-3 py-2">
              <span className="truncate text-xs font-semibold text-th-fg">
                {selectedIndividual.localName}
              </span>
              <button
                onClick={() => {
                  deleteIndividual(selectedIndividual.id);
                  setSelectedEntityId(null);
                }}
                className="ml-2 rounded p-1 text-red-400 hover:bg-red-400/10"
                title="Delete entity"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1.5">
              <div className="font-mono text-2xs text-th-fg-4 break-all">
                {selectedIndividual.uri}
              </div>
              {selectedIndividual.typeUris.map((tUri) => {
                const cls = classes.find((c) => c.uri === tUri);
                return (
                  <div key={tUri} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: colorMap.get(tUri) ?? "#6b7280" }}
                    />
                    <span className="text-2xs text-th-fg-3">
                      {cls?.labels[0]?.value || localName(tUri)}
                    </span>
                  </div>
                );
              })}
              {selectedIndividual.propertyValues.length > 0 && (
                <div className="mt-1 space-y-0.5 border-t border-th-border pt-1">
                  {selectedIndividual.propertyValues.map((pv, i) => {
                    const prop = properties.find((p) => p.uri === pv.propertyUri);
                    const targetInd = !pv.isLiteral
                      ? individuals.find((ind) => ind.uri === pv.value)
                      : null;
                    return (
                      <div key={i} className="flex items-start gap-1 text-2xs">
                        <span className="flex-shrink-0 text-th-fg-4">
                          {prop?.labels[0]?.value || localName(pv.propertyUri)}:
                        </span>
                        <span className="truncate text-th-fg-3">
                          {targetInd ? targetInd.localName : pv.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
            />
            <div
              className="fixed z-50 min-w-36 rounded border border-th-border bg-th-surface py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.type === "canvas" && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
                  onClick={() => {
                    setShowCreateDialog(true);
                    setContextMenu(null);
                  }}
                >
                  <Plus size={12} />
                  New Entity
                </button>
              )}
              {contextMenu.type === "node" && contextMenu.nodeId && (
                <>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
                    onClick={() => {
                      setEdgeCreationMode(true);
                      setPendingEdgeSourceId(contextMenu.nodeId!);
                      setContextMenu(null);
                    }}
                  >
                    <Link size={12} />
                    Add Relationship from here
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10"
                    onClick={() => {
                      deleteIndividual(contextMenu.nodeId!);
                      if (selectedEntityId === contextMenu.nodeId) setSelectedEntityId(null);
                      setContextMenu(null);
                    }}
                  >
                    <Trash2 size={12} />
                    Delete Entity
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create entity dialog */}
      {showCreateDialog && (
        <CreateEntityDialog
          classes={classes}
          baseUri={activeOntology.metadata.baseUri}
          onConfirm={handleCreateEntity}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {/* Create edge dialog */}
      {edgeDialogProps && (
        <CreateEdgeDialog
          source={edgeDialogProps.source}
          target={edgeDialogProps.target}
          objectProperties={objectProperties}
          onConfirm={handleConfirmEdge}
          onCancel={() => setEdgeDialogProps(null)}
        />
      )}
    </div>
  );
}
