/**
 * Displays ontology classes as a collapsible tree reflecting subClassOf hierarchy.
 */

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useStore } from "../../lib/store";
import type { OntologyClass } from "../../types";

interface TreeNode {
  cls: OntologyClass;
  children: TreeNode[];
  depth: number;
}

interface Props {
  onSelectClass: (id: string) => void;
  onDoubleClickClass: (id: string) => void;
  selectedClassId: string | null;
  search: string;
}

function buildTree(
  classes: OntologyClass[],
  parentUri: string | null,
  depth: number,
  visited: Set<string>
): TreeNode[] {
  const result: TreeNode[] = [];
  for (const cls of classes) {
    const isRoot = cls.subClassOf.length === 0 || cls.subClassOf.every(
      (pUri) => !classes.some((c) => c.uri === pUri)
    );
    const isChild = parentUri !== null && cls.subClassOf.includes(parentUri);

    if (parentUri === null ? isRoot : isChild) {
      // Guard against cycles
      if (visited.has(cls.uri)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(cls.uri);
      result.push({
        cls,
        children: buildTree(classes, cls.uri, depth + 1, nextVisited),
        depth,
      });
    }
  }
  return result;
}

function matchesSearch(cls: OntologyClass, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    cls.localName.toLowerCase().includes(q) ||
    cls.labels.some((l) => l.value.toLowerCase().includes(q))
  );
}

function nodeMatchesOrHasMatchingDescendant(node: TreeNode, search: string): boolean {
  if (matchesSearch(node.cls, search)) return true;
  return node.children.some((child) => nodeMatchesOrHasMatchingDescendant(child, search));
}

interface TreeRowProps {
  node: TreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  selectedClassId: string | null;
  search: string;
  propertyCountMap: Map<string, number>;
  parentUri: string | null;
}

function TreeRow({
  node,
  collapsed,
  onToggle,
  onSelect,
  onDoubleClick,
  selectedClassId,
  search,
  propertyCountMap,
  parentUri,
}: TreeRowProps) {
  if (search && !nodeMatchesOrHasMatchingDescendant(node, search)) return null;

  const isCollapsed = collapsed.has(node.cls.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedClassId === node.cls.id;
  const propCount = propertyCountMap.get(node.cls.uri) ?? 0;
  const label = node.cls.labels[0]?.value || node.cls.localName;
  const highlight = search && matchesSearch(node.cls, search);

  // Unique key when the same class appears under multiple parents
  const rowKey = `${node.cls.id}-${parentUri ?? "root"}`;

  return (
    <div key={rowKey}>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors ${
          isSelected
            ? "bg-blue-500/20 text-th-fg"
            : highlight
            ? "text-th-fg"
            : "text-th-fg-2 hover:bg-th-hover hover:text-th-fg"
        }`}
        style={{ paddingLeft: `${4 + node.depth * 12}px` }}
        onClick={() => onSelect(node.cls.id)}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(node.cls.id); }}
      >
        {/* Expand/collapse toggle */}
        <span
          className="flex-shrink-0 text-th-fg-4"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.cls.id);
          }}
          style={{ width: 14 }}
        >
          {hasChildren ? (
            isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />
          ) : null}
        </span>

        <span
          className={`flex-1 truncate font-medium ${
            highlight ? "text-blue-400" : ""
          }`}
        >
          {label}
        </span>

        {propCount > 0 && (
          <span className="ml-1 flex-shrink-0 rounded bg-th-hover px-1.5 text-2xs font-medium text-th-fg-2">
            {propCount}
          </span>
        )}
      </div>

      {!isCollapsed &&
        hasChildren &&
        node.children.map((child) => (
          <TreeRow
            key={`${child.cls.id}-${node.cls.uri}`}
            node={child}
            collapsed={collapsed}
            onToggle={onToggle}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            selectedClassId={selectedClassId}
            search={search}
            propertyCountMap={propertyCountMap}
            parentUri={node.cls.uri}
          />
        ))}
    </div>
  );
}

export default function ClassHierarchyTree({ onSelectClass, onDoubleClickClass, selectedClassId, search }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const classes = activeOntology?.classes ?? [];
  const properties = activeOntology?.properties ?? [];

  const propertyCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const prop of properties) {
      if (prop.domainUri) {
        map.set(prop.domainUri, (map.get(prop.domainUri) ?? 0) + 1);
      }
    }
    return map;
  }, [properties]);

  const tree = useMemo(
    () => buildTree(classes, null, 0, new Set<string>()),
    [classes]
  );

  const handleToggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-th-fg-4">
        No classes yet.
      </div>
    );
  }

  return (
    <div className="space-y-px">
      {tree.map((node) => (
        <TreeRow
          key={`${node.cls.id}-root`}
          node={node}
          collapsed={collapsed}
          onToggle={handleToggle}
          onSelect={onSelectClass}
          onDoubleClick={onDoubleClickClass}
          selectedClassId={selectedClassId}
          search={search}
          propertyCountMap={propertyCountMap}
          parentUri={null}
        />
      ))}
    </div>
  );
}
