/** The views the main and side panes can show (top bar tabs, side pane picker). */

import { FileCode, GitCompare, GitFork, Layers, Network, Share2, Users, type LucideIcon } from "lucide-react";

export type ViewMode = "classes" | "individuals" | "graph" | "tree" | "entity-graph" | "diff" | "source";

export const VIEWS: Array<{ mode: ViewMode; label: string; icon: LucideIcon; title: string }> = [
  { mode: "classes", label: "Classes", icon: Layers, title: "Classes view" },
  { mode: "individuals", label: "Individuals", icon: Users, title: "Individuals view" },
  { mode: "graph", label: "Graph", icon: Network, title: "Force-directed class graph" },
  { mode: "tree", label: "Tree", icon: GitFork, title: "Branching tree of the class hierarchy" },
  { mode: "entity-graph", label: "Entities", icon: Share2, title: "Entity graph view" },
  { mode: "diff", label: "Diff", icon: GitCompare, title: "Diff / merge view" },
  { mode: "source", label: "Source", icon: FileCode, title: "Edit the ontology as Turtle" },
];

export type CardsMode = "classes" | "individuals";
export const isCardsMode = (mode: ViewMode | null): mode is CardsMode => mode === "classes" || mode === "individuals";
