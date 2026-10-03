"use client";

import "client-only";

import * as React from "react";
import {
  queryRelationshipGraph,
  RELATIONSHIP_DIMENSION_LABELS,
  relationshipGraphNeighborhood,
} from "@oppulence/relationship-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConsoleResources } from "@/hooks/queries/use-console";
import {
  consoleResourcePageHasMore,
  consoleResourceRows,
  fetchConsoleResources,
} from "@/hooks/queries/utils/fetch-console";
import { companyName, promiseDirectionLabel } from "@/lib/revenue/revenue-records";
import { getRelationshipGraph } from "@/lib/revenue/revenue";
import {
  activitySourceLabel,
  enumLabel,
  participantRoleLabel,
} from "@/lib/revenue/source-product-copy";
import { useRelationshipGraph } from "@/hooks/queries/use-relationships";
import { consoleKeys } from "@/hooks/queries/utils/console-keys";
import { relationshipKeys } from "@/hooks/queries/utils/relationship-keys";
import {
  ArrowCounterClockwise,
  Buildings,
  Check,
  CircleNotch,
  ClockCounterClockwise,
  FileText,
  FlagBanner,
  FloppyDisk,
  Graph,
  Handshake,
  Link,
  ListBullets,
  Note,
  PaperPlaneTilt,
  PlugsConnected,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
  UserCircle,
  WarningDiamond,
  X,
} from "@/lib/icons";
import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  errMessage,
  ListRefreshFailure,
  listRefreshFailureCopy,
} from "@/components/features/revenue/shared/shared";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@oppulence/ui/components/dialog";
import { ItemMedia } from "@oppulence/ui/components/item";
import { Label } from "@oppulence/ui/components/label";
import { Checkbox } from "@oppulence/ui/components/checkbox";
import { DateTimePicker } from "@oppulence/ui/components/date-time-picker";
import { Input } from "@oppulence/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import { Slider } from "@oppulence/ui/components/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@oppulence/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@oppulence/ui/components/toggle-group";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import {
  approveAction,
  createAction,
  evaluateAction,
  friendlyRevenueError,
  rejectAction,
} from "@/lib/revenue/revenue";
import { createConsoleResource, deleteConsoleResource } from "@/lib/console/console";
import {
  GRAPH_VIEWS_MIGRATED_KEY,
  LEGACY_GRAPH_VIEWS_KEY,
  graphSavedViews,
  migrateLegacyGraphViews,
  readLegacyGraphViews,
  type GraphSavedViewResource,
} from "@/lib/console/console-resources";
import {
  RelationshipGraphSavedViewSchema,
  type RelationshipGraph,
  type RelationshipGraphEdge,
  type RelationshipGraphNode,
  type RelationshipGraphSavedView,
  type RelationshipGraphSavedViewState,
  type RevenueRelationship,
} from "@/lib/revenue/types";

const GRAPH_CAPABILITIES =
  "relationship-graph graph-query graph-saved-views graph-governed-actions";

const DEFAULT_STATE: RelationshipGraphSavedViewState = {
  scope: "portfolio",
  query: "",
  layout: "force",
  density: 0.72,
  hideIsolated: false,
  focusDepth: 0,
  changedSinceReview: false,
};

const KIND_ORDER: RelationshipGraphNode["kind"][] = [
  "relationship",
  "person",
  "commitment",
  "risk",
  "milestone",
  "action",
  "evidence",
  "source",
  "note",
];

const KIND_LABEL: Record<RelationshipGraphNode["kind"], string> = {
  relationship: "Company",
  person: "Person",
  commitment: "Promise",
  risk: "Risk",
  milestone: "Milestone",
  action: "Action",
  evidence: "Detail",
  source: "Source",
  note: "Note",
};

const NODE_RING: Record<string, string> = {
  healthy: "border-emerald-500/70 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]",
  needs_attention: "border-amber-500/75 shadow-[0_0_0_2px_rgba(245,158,11,0.14)]",
  critical: "border-red-500/80 shadow-[0_0_0_2px_rgba(239,68,68,0.16)]",
  current: "border-cyan-500/60",
  aging: "border-amber-500/60",
  stale: "border-red-500/65",
  approved: "border-emerald-500/60",
  rejected: "border-red-500/60",
  pending: "border-amber-500/60",
};

const nodeTone = (node: RelationshipGraphNode) =>
  NODE_RING[node.health || node.freshness || node.approvalStatus || ""] || "border-border";

const nodeShape = (kind: RelationshipGraphNode["kind"]) => {
  if (kind === "person") return "rounded-full";
  if (kind === "risk") return "rounded-none";
  if (kind === "milestone") return "rounded-none";
  if (kind === "source") return "rounded-none";
  return "rounded-[2px]";
};

const NodeIcon = ({
  kind,
  className = "size-4",
}: {
  kind: RelationshipGraphNode["kind"];
  className?: string;
}) => {
  const props = { className, weight: "duotone" as const, "aria-hidden": true };
  switch (kind) {
    case "relationship":
      return <Buildings {...props} />;
    case "person":
      return <UserCircle {...props} />;
    case "commitment":
      return <Handshake {...props} />;
    case "risk":
      return <WarningDiamond {...props} />;
    case "milestone":
      return <FlagBanner {...props} />;
    case "action":
      return <PaperPlaneTilt {...props} />;
    case "evidence":
      return <FileText {...props} />;
    case "source":
      return <PlugsConnected {...props} />;
    default:
      return <Note {...props} />;
  }
};

type GraphNodeData = { graphNode: RelationshipGraphNode };
type FlowNode = Node<GraphNodeData, "relationshipNode">;
type FlowEdge = Edge<{ graphEdge: RelationshipGraphEdge }, "typedEdge">;

function GraphNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const node = data.graphNode;
  const badges = [
    node.role ? participantRoleLabel(node.role) : "",
    node.kind === "relationship" && node.health
      ? graphNodeFieldLabel(node.kind, "health", node.health)
      : node.health && node.health !== "unknown"
        ? graphNodeFieldLabel(node.kind, "health", node.health)
        : "",
    node.approvalStatus ? graphNodeFieldLabel(node.kind, "approval", node.approvalStatus) : "",
    node.freshness ? graphNodeFieldLabel(node.kind, "freshness", node.freshness) : "",
    node.confidence === undefined ? "" : `${Math.round(node.confidence * 100)}%`,
  ].filter(Boolean);

  return (
    <div
      className={`w-44 border bg-background/95 px-3 py-2 text-left shadow-sm backdrop-blur ${nodeShape(node.kind)} ${nodeTone(node)} ${selected ? "ring-2 ring-oppulence-orange/60" : ""}`}
      aria-label={`${KIND_LABEL[node.kind]}: ${node.label}. ${badges.join(", ")}`}
    >
      <div className="flex items-start gap-2">
        <ItemMedia
          className="mt-0.5 size-7 shrink-0 rounded-none bg-primary/7 text-primary/70"
          variant="icon"
        >
          <NodeIcon kind={node.kind} />
        </ItemMedia>
        <div className="min-w-0 flex-1">
          <Label className="block font-mono text-[9px] uppercase tracking-wider text-primary/40">
            {KIND_LABEL[node.kind]}
          </Label>
          <Label className="mt-0.5 block line-clamp-2 text-xs font-medium leading-4 text-primary">
            {node.label}
          </Label>
        </div>
        {node.changedSinceReview ? (
          <Badge
            className="size-2 shrink-0 rounded-full border-0 bg-oppulence-orange p-0"
            title="Changed since you last looked"
            variant="outline"
          />
        ) : null}
      </div>
      {badges.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.slice(0, 2).map((badge) => (
            <Badge
              key={badge}
              className="rounded-none bg-primary/6 px-1.5 py-0.5 text-[9px] font-normal text-primary/55"
              variant="outline"
            >
              {badge}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TypedGraphEdge(props: EdgeProps<FlowEdge>) {
  const [hovered, setHovered] = React.useState(false);
  const [path, labelX, labelY] = getBezierPath(props);
  const showLabel = hovered || props.selected;
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        style={{
          stroke: props.selected
            ? "var(--oppulence-orange, #f97316)"
            : "color-mix(in oklab, var(--foreground) 42%, transparent)",
          strokeWidth: props.selected ? 2.25 : 1.5,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`${graphEdgeLabel(props.data?.graphEdge.label || "") || "connection"} edge`}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-[2px] border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-primary/65 shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {graphEdgeLabel(props.data?.graphEdge.label || "")}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const NODE_TYPES = { relationshipNode: GraphNodeCard };
const EDGE_TYPES = { typedEdge: TypedGraphEdge };

function timestampForNode(node: RelationshipGraphNode): number {
  const raw = node.dueAt || node.occurredAt || node.updatedAt;
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Saved views and the URL still store `force`, `radial`, and `timeline`.
 * `force` draws one column per kind, so the menu says Grouped rather than
 * the physics name the value still uses.
 */
export function graphLayoutLabel(layout: RelationshipGraphSavedViewState["layout"]): string {
  if (layout === "radial") return "Circle";
  if (layout === "timeline") return "By time";
  return "Grouped";
}

/**
 * The company menu's visible placeholder is "Choose a company". Chrome does
 * not use that text as the combobox name, so the name has to carry it.
 */
export function graphAccountChoice(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || "Choose a company";
}

/** Same gap for the saved-view menu, which only renders once a view exists. */
export function graphSavedViewChoice(label: string | null | undefined): string {
  const trimmed = label?.trim() ?? "";
  return trimmed || "Saved views";
}

export function nextSavedViewsLabel(): string {
  return "Show the next saved views";
}

function layoutNodes(
  nodes: RelationshipGraphNode[],
  layout: RelationshipGraphSavedViewState["layout"],
  density: number,
): FlowNode[] {
  const spacing = 0.72 + density * 0.7;
  if (layout === "radial") {
    const radius = Math.max(260, nodes.length * 18) * spacing;
    return nodes.map((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      return {
        id: node.id,
        type: "relationshipNode",
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { graphNode: node },
        ariaLabel: `${KIND_LABEL[node.kind]} ${node.label}`,
      };
    });
  }

  if (layout === "timeline") {
    const ordered = [...nodes].sort(
      (left, right) => timestampForNode(left) - timestampForNode(right),
    );
    const rows = new Map(KIND_ORDER.map((kind, index) => [kind, index]));
    return ordered.map((node, index) => ({
      id: node.id,
      type: "relationshipNode",
      position: {
        x: index * 205 * spacing,
        y: (rows.get(node.kind) || 0) * 118 * spacing,
      },
      data: { graphNode: node },
      ariaLabel: `${KIND_LABEL[node.kind]} ${node.label}`,
    }));
  }

  const grouped = new Map<RelationshipGraphNode["kind"], RelationshipGraphNode[]>();
  for (const node of nodes) grouped.set(node.kind, [...(grouped.get(node.kind) || []), node]);
  return KIND_ORDER.flatMap((kind, column) =>
    (grouped.get(kind) || []).map((node, row) => ({
      id: node.id,
      type: "relationshipNode" as const,
      position: { x: column * 220 * spacing, y: row * 112 * spacing },
      data: { graphNode: node },
      ariaLabel: `${KIND_LABEL[node.kind]} ${node.label}`,
    })),
  );
}

/**
 * A graph link often carries only the moment. A missing scope used to fail the
 * whole parse, so the graph opened on today's data and the date was gone.
 */
export function graphStateFromSearch(search: string): RelationshipGraphSavedViewState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("graph") !== "1") return DEFAULT_STATE;
  const density = Number(params.get("graphDensity"));
  const focusRaw = Number(params.get("graphFocusDepth") || 0);
  const scopeParam = params.get("graphScope");
  const layoutParam = params.get("graphLayout");
  const candidate = {
    scope: scopeParam === "relationship" || scopeParam === "portfolio" ? scopeParam : "portfolio",
    relationshipId: params.get("graphRelationship") || undefined,
    query: params.get("graphQuery") || "",
    layout:
      layoutParam === "force" || layoutParam === "radial" || layoutParam === "timeline"
        ? layoutParam
        : "force",
    density:
      Number.isFinite(density) && density >= 0.25 && density <= 1 ? density : DEFAULT_STATE.density,
    hideIsolated: params.get("graphHideIsolated") === "1",
    selectedNodeId: params.get("graphNode") || undefined,
    focusDepth: focusRaw === 1 || focusRaw === 2 ? focusRaw : 0,
    asOf: params.get("graphAsOf") || undefined,
    changedSinceReview: params.get("graphChanged") === "1",
  };
  const parsed = RelationshipGraphSavedViewSchema.shape.state.safeParse(candidate);
  if (parsed.success) return parsed.data;
  const withoutMoment = RelationshipGraphSavedViewSchema.shape.state.safeParse({
    ...candidate,
    asOf: undefined,
  });
  return withoutMoment.success ? withoutMoment.data : DEFAULT_STATE;
}

function readURLState(): RelationshipGraphSavedViewState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  return graphStateFromSearch(window.location.search);
}

const COMPANY_GRAPH_PARAMS = [
  "graph",
  "graphScope",
  "graphRelationship",
  "graphQuery",
  "graphLayout",
  "graphDensity",
  "graphHideIsolated",
  "graphNode",
  "graphFocusDepth",
  "graphAsOf",
  "graphChanged",
] as const;

/**
 * The list and the graph share one address. The graph writes these params
 * while it is open. Leaving them in place after List is chosen makes a
 * refresh, or the next visit to Companies, open the graph again.
 */
export function searchWithoutCompanyGraph(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of COMPANY_GRAPH_PARAMS) params.delete(key);
  return params.toString();
}

export function clearCompanyGraphURL() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const next = searchWithoutCompanyGraph(url.search);
  if (next === url.searchParams.toString()) return;
  url.search = next;
  window.history.replaceState(null, "", url);
}

function writeURLState(state: RelationshipGraphSavedViewState) {
  const url = new URL(window.location.href);
  url.searchParams.set("graph", "1");
  url.searchParams.set("graphScope", state.scope);
  url.searchParams.set("graphLayout", state.layout);
  url.searchParams.set("graphDensity", state.density.toFixed(2));
  const optional: Array<[string, string | undefined]> = [
    ["graphRelationship", state.relationshipId],
    ["graphQuery", state.query || undefined],
    ["graphNode", state.selectedNodeId],
    ["graphAsOf", state.asOf],
  ];
  for (const [key, value] of optional) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (state.hideIsolated) url.searchParams.set("graphHideIsolated", "1");
  else url.searchParams.delete("graphHideIsolated");
  if (state.focusDepth) url.searchParams.set("graphFocusDepth", String(state.focusDepth));
  else url.searchParams.delete("graphFocusDepth");
  if (state.changedSinceReview) url.searchParams.set("graphChanged", "1");
  else url.searchParams.delete("graphChanged");
  window.history.replaceState(null, "", url);
}

function GraphCanvas({
  nodes: graphNodes,
  edges: graphEdges,
  layout,
  density,
  selectedNodeId,
  onSelectNode,
  resetSignal,
}: {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  layout: RelationshipGraphSavedViewState["layout"];
  density: number;
  selectedNodeId?: string;
  onSelectNode: (id?: string) => void;
  resetSignal: number;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const topologyKey = React.useMemo(
    () =>
      `${layout}:${density}:${graphNodes.map((node) => node.id).join("|")}:${graphEdges
        .map((edge) => edge.id)
        .join("|")}`,
    [density, graphEdges, graphNodes, layout],
  );

  React.useEffect(() => {
    setNodes(
      layoutNodes(graphNodes, layout, density).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    );
    setEdges(
      graphEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "typedEdge",
        data: { graphEdge: edge },
        markerEnd: edge.directed
          ? { type: MarkerType.ArrowClosed, width: 14, height: 14 }
          : undefined,
        selectable: true,
        selected: Boolean(
          selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId),
        ),
      })),
    );
  }, [density, graphEdges, graphNodes, layout, selectedNodeId, setEdges, setNodes]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(
      () => void flow.fitView({ padding: 0.18, duration: 0 }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [flow, topologyKey]);

  React.useEffect(() => {
    void flow.fitView({ padding: 0.18, duration: 0 });
  }, [flow, resetSignal]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onPaneClick={() => onSelectNode(undefined)}
      nodesFocusable
      edgesFocusable
      elementsSelectable
      panOnDrag
      panOnScroll
      minZoom={0.15}
      maxZoom={2}
      fitView
      proOptions={{ hideAttribution: true }}
      aria-label="Company graph"
    >
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => {
          const graphNode = (node.data as GraphNodeData | undefined)?.graphNode;
          if (graphNode?.kind === "risk") return "#ef4444";
          if (graphNode?.kind === "relationship") return "#f97316";
          if (graphNode?.kind === "action") return "#22c55e";
          return "#64748b";
        }}
        className="!border !border-border !bg-background/90"
      />
      <Controls showInteractive={false} className="!border-border !bg-background" />
      <Panel
        position="top-right"
        className="rounded-[2px] border border-border bg-background/90 px-2 py-1 text-[10px] text-primary/50 backdrop-blur"
      >
        {graphCountLabel(graphNodes.length, "item", "items")} ·{" "}
        {graphCountLabel(graphEdges.length, "connection", "connections")}
      </Panel>
    </ReactFlow>
  );
}

function Inspector({
  node,
  graph,
  visibleCount,
  busy,
  onSelectNode,
  onOpen,
  onAction,
  onPropose,
  focusDepth,
  onFocusDepth,
  actionError,
}: {
  node?: RelationshipGraphNode;
  graph: RelationshipGraph;
  visibleCount: number;
  busy: boolean;
  onSelectNode: (id: string) => void;
  onOpen: (relationshipId: string) => void;
  onAction: (kind: "evaluate" | "approve" | "reject", actionId: string) => void;
  onPropose: (node: RelationshipGraphNode) => void;
  focusDepth: RelationshipGraphSavedViewState["focusDepth"];
  onFocusDepth: (depth: RelationshipGraphSavedViewState["focusDepth"]) => void;
  actionError?: string | null;
}) {
  const [expandedConnections, setExpandedConnections] = React.useState(false);
  const [expandedDetails, setExpandedDetails] = React.useState(false);
  React.useEffect(() => {
    setExpandedConnections(false);
    setExpandedDetails(false);
  }, [node?.id]);

  if (!node) {
    const prompt = graphInspectorPrompt(graph.nodes.length, visibleCount);
    return (
      <aside className="flex min-h-56 flex-col items-center justify-center border-l border-border p-6 text-center">
        <Graph className="size-7 text-primary/25" />
        <p className="mt-3 text-sm font-medium text-primary">{prompt.title}</p>
        <p className="mt-1 max-w-56 text-xs text-primary/45">{prompt.body}</p>
      </aside>
    );
  }

  const relationshipIds = [
    ...new Set([node.relationshipId, ...node.relationshipIds].filter(Boolean)),
  ] as string[];
  const relationshipRecords = relationshipIds.map((id) => ({
    id,
    label:
      graph.nodes.find(
        (candidate) => candidate.kind === "relationship" && candidate.relationshipIds.includes(id),
      )?.label || "company",
  }));
  const connected = graph.edges.flatMap((edge) => {
    if (edge.source !== node.id && edge.target !== node.id) return [];
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = graph.nodes.find((candidate) => candidate.id === otherId);
    return other ? [{ edge, other }] : [];
  });
  const shownConnections = expandedConnections
    ? connected
    : connected.slice(0, GRAPH_CONNECTION_PAGE);
  const hiddenConnections = connected.length - shownConnections.length;
  const actionId = node.kind === "action" ? node.resourceRef : undefined;
  const evidenceNodes = graphDetailNodes(node, graph.nodes);
  const inspectorSummary = graphInspectorSummary(node);
  const shownEvidence = expandedDetails ? evidenceNodes : evidenceNodes.slice(0, GRAPH_DETAIL_PAGE);
  const hiddenEvidence = evidenceNodes.length - shownEvidence.length;

  return (
    <aside
      className="min-h-0 overflow-y-auto border-l border-border bg-background-50/70 p-4 dark:bg-background-100/25"
      aria-label="Graph inspector"
    >
      <div className="flex items-start gap-3">
        <ItemMedia
          className={`size-9 shrink-0 border bg-background ${nodeShape(node.kind)} ${nodeTone(node)}`}
          variant="icon"
        >
          <NodeIcon kind={node.kind} className="size-5" />
        </ItemMedia>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary/40">
            {KIND_LABEL[node.kind]}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-primary">{node.label}</h3>
        </div>
      </div>

      {inspectorSummary ? (
        <p className="mt-3 text-xs leading-5 text-primary/60">{inspectorSummary}</p>
      ) : null}
      <div className="mt-4 border border-border bg-background px-2 py-2">
        <p className="font-mono text-[9px] uppercase tracking-wide text-primary/35">
          How far to look
        </p>
        <ToggleGroup
          type="single"
          value={String(focusDepth)}
          onValueChange={(value) => value && onFocusDepth(Number(value) as 0 | 1 | 2)}
          variant="outline"
          size="sm"
          className="mt-2 grid w-full grid-cols-3"
          aria-label="How far to look"
        >
          {([1, 2] as const).map((depth) => (
            <ToggleGroupItem
              key={depth}
              value={String(depth)}
              className="w-full text-xs data-[state=on]:border-oppulence-orange data-[state=on]:bg-oppulence-orange/10"
            >
              {depth === 1 ? "Nearby" : "Wider"}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem
            value="0"
            className="w-full text-xs data-[state=on]:border-primary/40 data-[state=on]:bg-primary/5"
          >
            Full graph
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="mt-1.5 text-[9px] leading-4 text-primary/35">
          This follows what you select, one step at a time.
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {(
          [
            ["Role", "other", node.role ? participantRoleLabel(node.role) : undefined],
            ["Status", "status", node.status],
            [
              "Direction",
              "other",
              node.kind === "commitment" ? graphPromiseDirection(node.metadata.direction) : undefined,
            ],
            ["Health", "health", node.health],
            ["Lifecycle", "lifecycle", node.lifecycle],
            ["Approval", "approval", node.approvalStatus],
            ["Policy", "policy", node.policyStatus],
            ["Execution", "execution", graphExecutionLabel(node.executionStatus)],
            ["Freshness", "freshness", node.freshness],
            [
              "Confidence",
              "other",
              node.confidence === undefined ? undefined : `${Math.round(node.confidence * 100)}%`,
            ],
            ["Due", "other", node.dueAt ? new Date(node.dueAt).toLocaleDateString() : undefined],
          ] as const
        )
          .filter((entry) => entry[2])
          .map(([label, field, value]) => (
            <div key={label} className="border border-border bg-background px-2 py-2">
              <dt className="font-mono text-[9px] uppercase tracking-wide text-primary/35">
                {label}
              </dt>
              <dd className="mt-0.5 text-primary/70">
                {field === "other" || field === "execution"
                  ? value
                  : graphNodeFieldLabel(node.kind, field, String(value))}
              </dd>
            </div>
          ))}
      </dl>

      {node.changedSinceReview ? (
        <div className="mt-3 border border-oppulence-orange/25 bg-oppulence-orange/5 p-2 text-xs text-primary/65">
          <ClockCounterClockwise className="mr-1 inline size-4 text-oppulence-orange" />
          {graphChangedDetail(node.changedDimensions)}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-primary/40">Connections</p>
        <ul className="mt-2 space-y-1">
          {shownConnections.map(({ edge, other }) => (
            <li key={edge.id}>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onSelectNode(other.id)}
                className="h-auto w-full justify-start rounded-none px-2 py-1.5 text-left"
              >
                <NodeIcon kind={other.kind} />
                <Label className="min-w-0 flex-1 truncate font-normal">{other.label}</Label>
                <Label
                  className="font-mono text-[9px] font-normal text-primary/35"
                  aria-label={`${edge.source === node.id ? "Outgoing" : "Incoming"}: ${graphEdgeLabel(edge.label)}`}
                >
                  {edge.source === node.id ? "→" : "←"} {graphEdgeLabel(edge.label)}
                </Label>
              </Button>
            </li>
          ))}
          {!connected.length ? (
            <li className="text-xs text-primary/35">No visible connections.</li>
          ) : null}
        </ul>
        {hiddenConnections > 0 ? (
          <Button
            className="mt-2"
            onClick={() => setExpandedConnections(true)}
            size="xs"
            type="button"
            variant="outline"
          >
            {graphListRemainderLabel(hiddenConnections, "connection", "connections")}
          </Button>
        ) : null}
      </div>

      {node.evidenceRefs.length ? (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-primary/40">
            Details · {node.evidenceRefs.length}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {shownEvidence.map((evidence) => (
              <Button
                key={evidence.id}
                variant="outline"
                size="xs"
                onClick={() => onSelectNode(evidence.id)}
                className="max-w-full truncate text-primary/55"
                title={graphEvidenceChipLabel(evidence)}
              >
                {graphEvidenceChipLabel(evidence)}
              </Button>
            ))}
            {!evidenceNodes.length ? (
              <Label className="text-[10px] font-normal text-primary/40">
                Details kept on this record.
              </Label>
            ) : null}
          </div>
          {hiddenEvidence > 0 ? (
            <Button
              className="mt-2"
              onClick={() => setExpandedDetails(true)}
              size="xs"
              type="button"
              variant="outline"
            >
              {graphListRemainderLabel(hiddenEvidence, "detail", "details")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {relationshipRecords.map((relationship) => (
          <Button key={relationship.id} size="sm" onClick={() => onOpen(relationship.id)}>
            {relationshipRecords.length === 1
              ? "Open complete record"
              : `Open ${relationship.label}`}
          </Button>
        ))}
        {node.kind !== "action" &&
        relationshipRecords.length === 1 &&
        graph.permissions.canContribute ? (
          <Button size="sm" variant="outline" onClick={() => onPropose(node)} disabled={busy}>
            <Sparkle /> Propose follow-up
          </Button>
        ) : null}
        {actionId && node.policyStatus !== "allowed" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("evaluate", actionId)}
            disabled={busy}
          >
            <ShieldCheck /> Evaluate
          </Button>
        ) : null}
        {actionId && node.approvalStatus === "pending" && graph.permissions.canApprove ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("approve", actionId)}
              disabled={busy}
            >
              <Check /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("reject", actionId)}
              disabled={busy}
            >
              <X /> Reject
            </Button>
          </>
        ) : null}
      </div>
      {actionId ? (
        <p className="mt-2 text-[10px] leading-4 text-primary/40">
          Approval changes authorization only. Execution remains a separate explicit action in the
          full record.
        </p>
      ) : null}
      {node.kind !== "action" && relationshipRecords.length > 1 ? (
        <p className="mt-2 text-[10px] leading-4 text-primary/40">
          This node is shared across companies. Open one company before proposing an action so the
          approval is scoped correctly.
        </p>
      ) : null}
    </aside>
  );
}

function GraphTable({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  empty,
  onReset,
}: {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
  /** Shown in the table when the current view has no rows. */
  empty?: { message: string; offerReset: boolean };
  onReset?: () => void;
}) {
  return (
    <div
      className="h-full overflow-auto"
      role="region"
      aria-label="Company graph list"
      tabIndex={0}
    >
      <Table className="border-collapse text-left text-xs">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="border-border font-mono text-xs uppercase text-primary/40">
            <TableHead className="px-3 py-2 font-normal">Name</TableHead>
            <TableHead className="px-3 py-2 font-normal">Type</TableHead>
            <TableHead className="px-3 py-2 font-normal">State</TableHead>
            <TableHead className="px-3 py-2 font-normal">Links</TableHead>
            <TableHead className="px-3 py-2 font-normal">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.length === 0 && empty ? (
            <TableRow>
              <TableCell className="px-3 py-16 text-center text-sm text-primary/55" colSpan={5}>
                {empty.message}
                {empty.offerReset && onReset ? (
                  <div>
                    <Button
                      className="mt-2"
                      onClick={onReset}
                      size="sm"
                      type="button"
                      variant="link"
                    >
                      Reset filters
                    </Button>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ) : null}
          {nodes.map((node) => (
            <TableRow
              key={node.id}
              className={`border-b border-border/70 ${selectedNodeId === node.id ? "bg-oppulence-orange/5" : ""}`}
            >
              <TableCell className="px-3 py-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onSelectNode(node.id)}
                  className="max-w-80 justify-start px-0 text-left text-primary hover:bg-transparent hover:underline"
                >
                  <NodeIcon kind={node.kind} />{" "}
                  <Label className="truncate font-normal">{node.label}</Label>
                </Button>
              </TableCell>
              <TableCell className="px-3 py-2 text-primary/55">{KIND_LABEL[node.kind]}</TableCell>
              <TableCell className="px-3 py-2 text-primary/55">
                {graphNodeSummaryLabel(node)}
              </TableCell>
              <TableCell className="px-3 py-2 text-primary/45">
                {edges.filter((edge) => edge.source === node.id || edge.target === node.id).length}
              </TableCell>
              <TableCell className="px-3 py-2 text-primary/45">
                {node.evidenceRefs.length}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** One item reads differently from many. The canvas count is the only place this is shown. */
/**
 * Lower settings keep the canvas readable. The top setting shows every node
 * the graph already returned, instead of stopping at 220 and asking for more.
 */
export function graphNodeCap(density: number): number | null {
  if (density >= 1) return null;
  return Math.round(40 + density * 180);
}

export function graphCanvasCapLabel(shown: number, total: number): string {
  return `Showing ${shown} of ${total} · raise how many to show for more`;
}

/**
 * A question or an isolation filter can hide nodes without the slider being
 * the reason. The slider note appears only after that filter, when the
 * remaining nodes still do not fit.
 */
export function graphCanvasCapState(
  matchedCount: number,
  cap: number | null,
): { capped: boolean; shown: number } {
  const matched = Number.isFinite(matchedCount) ? Math.max(0, matchedCount) : 0;
  if (cap == null || matched <= cap) return { capped: false, shown: matched };
  return { capped: true, shown: cap };
}

/** One graph response is the same page as the company directory. */
export const GRAPH_COMPANY_PAGE = 200;

export function graphNextCompaniesLabel(): string {
  return "Show the next companies";
}

export const GRAPH_ACCOUNT_EVIDENCE_PAGE = 100;
export const GRAPH_PORTFOLIO_EVIDENCE_PAGE = 500;

export function graphEvidencePage(scope: "portfolio" | "relationship"): number {
  return scope === "relationship" ? GRAPH_ACCOUNT_EVIDENCE_PAGE : GRAPH_PORTFOLIO_EVIDENCE_PAGE;
}

export function graphEarlierEvidenceLabel(): string {
  return "Show earlier evidence";
}

export function graphCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** First screen of the inspector lists. The rest stay one click away. */
export const GRAPH_CONNECTION_PAGE = 12;
export const GRAPH_DETAIL_PAGE = 6;

/** The rows past the first screen, in the same words as the graph counts. */
export function graphListRemainderLabel(hidden: number, singular: string, plural: string): string {
  return `Show the other ${graphCountLabel(hidden, singular, plural)}`;
}

/**
 * A detail chip opens another node that shares this record's evidence. The
 * open detail used to list itself, so "Promise confirmed" appeared again
 * under its own heading.
 */
export function graphDetailNodes<
  T extends { id: string; kind: string; evidenceRefs?: readonly string[] | null },
>(node: { id: string; evidenceRefs?: readonly string[] | null }, nodes: readonly T[]): T[] {
  const refs = node.evidenceRefs ?? [];
  if (refs.length === 0) return [];
  return nodes.filter(
    (candidate) =>
      candidate.id !== node.id &&
      candidate.kind === "evidence" &&
      (candidate.evidenceRefs ?? []).some((ref) => refs.includes(ref)),
  );
}

/**
 * A detail chip opens that node. The sentence on the node is the name. A
 * blank sentence falls back to the source the activity list already uses,
 * so a Gmail detail does not read as the stored slug.
 */
export function graphEvidenceChipLabel(evidence: {
  label?: string | null;
  source?: string | null;
}): string {
  const label = evidence.label?.trim() ?? "";
  if (label) return label;
  const source = evidence.source?.trim() ?? "";
  if (source) return activitySourceLabel(source);
  return "Detail";
}

/**
 * The toolbar date is a moment to view, not a mode called "historical".
 * The banner uses the same words once a moment is chosen.
 */
/**
 * Approve already ends in e, so appending "d" spelled it. Reject does not:
 * "Action rejectd." is what the inspector used to say after a successful reject.
 */
export function graphActionNotice(kind: "evaluate" | "approve" | "reject"): string {
  switch (kind) {
    case "evaluate":
      return "Sending check finished.";
    case "approve":
      return "Action approved.";
    case "reject":
      return "Action rejected.";
  }
}

export function graphAsOfLabel(asOf: string): string {
  const parsed = new Date(asOf);
  const when = Number.isNaN(parsed.getTime()) ? asOf : parsed.toLocaleString();
  return `As of ${when}`;
}

/**
 * The graph line between a company and a promise used to say "has commitment".
 * A link that replaces another promise used to say "supersedes".
 */
export function graphEdgeLabel(label: string): string {
  switch (label.trim().toLowerCase().replaceAll("_", " ")) {
    case "has commitment":
    case "has promise":
      return "has promise";
    case "supersedes":
    case "replaces":
      return "replaces";
    default:
      return label.trim();
  }
}

/**
 * A quote that repeats the node title is not a second fact. The confirmation
 * still shows the promise sentence, because that title is the event name.
 */
export function graphInspectorSummary(node: {
  label?: string | null;
  summary?: string | null;
}): string | undefined {
  const summary = node.summary?.trim() ?? "";
  if (!summary || summary === (node.label?.trim() ?? "")) return undefined;
  return summary;
}

/**
 * The company record says who owes a promise. The graph inspector used to
 * leave that off, so an open promise had a status and no side.
 */
export function graphPromiseDirection(direction: unknown): string | undefined {
  if (direction !== "promised_by_me" && direction !== "promised_by_them" && direction !== "mutual") {
    return undefined;
  }
  const label = promiseDirectionLabel(direction);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** A graph field is a stored token. A date before the record existed is not a status. */
export function graphDetailLabel(value: string): string {
  switch (value) {
    case "unknown":
      return "Not known";
    case "historical_unknown":
      return "Not recorded for this date";
    case "review_required":
      return "Needs review";
    case "needs_attention":
      return "Needs attention";
    case "at_risk":
      return "At risk";
    case "active_customer":
      return "Active customer";
    case "former_customer":
      return "Former customer";
    case "stale":
      return "Out of date";
    default: {
      const trimmed = value.trim();
      // The graph already receives phrases such as "Promise confirmed".
      // Title-casing those turns the second word into a heading.
      if (!/^[a-z0-9_./]+$/.test(trimmed)) return trimmed;
      return enumLabel(trimmed);
    }
  }
}

type GraphField = "status" | "health" | "lifecycle" | "approval" | "policy" | "freshness";

/**
 * The same stored token means different things on different nodes. An open
 * promise is still open. An open follow-up is held, and a passed policy is
 * cleared — the words the recovery queue already uses.
 */
export function graphNodeFieldLabel(kind: string, field: GraphField, value: string): string {
  if (kind === "action" && field === "status") {
    switch (value) {
      case "open":
        return "Held";
      case "snoozed":
        return "Snoozed";
      case "handled":
        return "Handled";
      case "dismissed":
        return "Dismissed";
      default:
        break;
    }
  }
  if (kind === "action" && field === "policy") {
    switch (value) {
      case "passed":
        return "Cleared";
      case "review_required":
        return "Review required";
      case "blocked":
        return "Blocked";
      case "stale":
        return "Re-check needed";
      case "pending":
        return "Not checked";
      default:
        break;
    }
  }
  if (kind === "action" && field === "approval") {
    switch (value) {
      case "pending":
        return "Awaiting approval";
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      default:
        break;
    }
  }
  if (kind === "source" && field === "status") {
    switch (value) {
      case "live":
      case "connected":
        return "Active";
      case "stale":
        return "Out of date";
      case "reconnect_required":
        return "Reconnect required";
      case "disconnected":
        return "Disconnected";
      case "not_connected":
        return "Not connected";
      case "backfilling":
      case "rebuilding":
        return "Syncing";
      default:
        break;
    }
  }
  if (kind === "commitment" && field === "status") {
    switch (value) {
      case "at_risk":
        return "At risk";
      case "met":
        return "Met";
      case "missed":
        return "Missed";
      case "waived":
        return "Waived";
      case "disputed":
        return "Disputed";
      case "open":
        return "Open";
      case "review":
        return "Review";
      case "cancelled":
        return "Cancelled";
      case "superseded":
        return "Superseded";
      default:
        break;
    }
  }
  if (field === "freshness") {
    switch (value) {
      case "current":
        return "Up to date";
      case "aging":
        return "Getting old";
      case "unknown":
        return "Not known";
      default:
        break;
    }
  }
  return graphDetailLabel(value);
}

/** A send that has not started yet stays off the inspector. Pending is the default. */
export function graphExecutionLabel(status: string | undefined): string | undefined {
  switch (status) {
    case undefined:
    case "":
    case "pending":
      return undefined;
    case "requested":
      return "Sending…";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "ambiguous":
      return "Needs reconcile";
    case "cancelled":
      return "Cancelled";
    default:
      return graphDetailLabel(status);
  }
}

export function graphNodeSummaryLabel(node: {
  kind: string;
  role?: string;
  health?: string;
  status?: string;
  approvalStatus?: string;
  freshness?: string;
}): string {
  if (node.kind === "person" && node.role) return participantRoleLabel(node.role);
  if (node.health && node.health !== "unknown") {
    return graphNodeFieldLabel(node.kind, "health", node.health);
  }
  // The diagram badge shows approval, then freshness. The table's one State
  // cell has to use that same word, and only then the stored status.
  if (node.approvalStatus) return graphNodeFieldLabel(node.kind, "approval", node.approvalStatus);
  if (node.freshness && node.freshness !== "unknown") {
    return graphNodeFieldLabel(node.kind, "freshness", node.freshness);
  }
  // A new company is stored as active. That is not a health reading. The
  // company record says Not known until health is actually supported.
  if (
    node.kind === "relationship" &&
    (!node.status || node.status === "active") &&
    (!node.health || node.health === "unknown")
  ) {
    return "Not known";
  }
  if (node.status) return graphNodeFieldLabel(node.kind, "status", node.status);
  if (node.health === "unknown" || node.freshness === "unknown") return "Not known";
  return "—";
}

/** A review note names the fields that moved. The company record already says "Next action". */
export function graphChangedDetail(dimensions: readonly string[]): string {
  const labels = dimensions
    .map((dimension) => {
      switch (dimension) {
        case "evidence":
          return "Supporting evidence";
        case "risks":
          return "Risks";
        case "milestones":
          return "Milestones";
        default:
          return RELATIONSHIP_DIMENSION_LABELS[dimension] ?? enumLabel(dimension);
      }
    })
    .filter((label) => label !== "Unknown");
  if (!labels.length) return "Changed since you last looked.";
  return `Changed since you last looked: ${labels.join(", ")}.`;
}

/**
 * The query engine still says "relationship", and a typed question comes back
 * as `text: …`. The graph is a company graph, so the answer should read that way.
 */
/**
 * Reset returns the graph to the first view. A saved view, a typed question,
 * or any changed filter is something to return from.
 */
export function graphCanReset(
  state: RelationshipGraphSavedViewState,
  queryDraft: string,
  activeSavedViewId?: string,
): boolean {
  if (activeSavedViewId) return true;
  if (queryDraft.trim() !== state.query) return true;
  return (
    state.scope !== DEFAULT_STATE.scope ||
    state.query !== DEFAULT_STATE.query ||
    state.layout !== DEFAULT_STATE.layout ||
    state.density !== DEFAULT_STATE.density ||
    state.hideIsolated !== DEFAULT_STATE.hideIsolated ||
    state.focusDepth !== DEFAULT_STATE.focusDepth ||
    state.changedSinceReview !== DEFAULT_STATE.changedSinceReview ||
    Boolean(state.asOf) ||
    Boolean(state.relationshipId) ||
    Boolean(state.selectedNodeId)
  );
}

/** Ask rewrites the question and clears the selected company. Skip a click that would do neither. */
export function graphAskChanges(
  draft: string,
  state: Pick<RelationshipGraphSavedViewState, "query" | "focusDepth" | "selectedNodeId">,
): boolean {
  return draft.trim() !== state.query || Boolean(state.selectedNodeId) || state.focusDepth !== 0;
}

/** A question only sees companies already drawn. A later page can still hold the match. */
export function graphQueryMissLabel(): string {
  return "No loaded companies match this question. Show the next companies to keep looking.";
}

export function graphQueryAnswer(answer: string, companyCount: number, hasMore = false): string {
  if (companyCount === 0) return "No companies are in this graph yet.";
  const rewritten = answer
    .replace(/\b1 relationship matches\b/g, "1 company matches")
    .replace(/\b(\d+) relationships match\b/g, (_, count: string) => `${count} companies match`)
    .replace(/ (match(?:es)?) (.*)\.$/, (_, verb: string, rest: string) => {
      const labeled = String(rest)
        .split(" · ")
        .map((part) => graphQueryFilterLabel(part))
        .join(" · ");
      return ` ${verb} ${labeled}.`;
    });
  if (hasMore && /^0 companies match\b/.test(rewritten)) return graphQueryMissLabel();
  return rewritten;
}

/**
 * A question chip names each filter the way the inspector already names that
 * field. "Sources: desktop note" and "Approval: pending" are the stored tokens.
 */
function graphQueryTokenLabel(kind: string, token: string): string {
  const raw = token.trim();
  if (!raw) return "";
  switch (kind) {
    case "lifecycle":
    case "health":
      return graphDetailLabel(raw);
    case "approval":
      return graphNodeFieldLabel("action", "approval", raw);
    case "sources":
      return activitySourceLabel(raw);
    case "nodes":
      return KIND_LABEL[raw as RelationshipGraphNode["kind"]] ?? enumLabel(raw);
    case "edges": {
      const named = graphEdgeLabel(raw);
      if (named === "has promise") return "Has promise";
      if (named === "replaces") return "Replaces";
      return enumLabel(raw);
    }
    case "text": {
      const words = raw.replaceAll("_", " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    default:
      return enumLabel(raw);
  }
}

/** Parsed filters are query tokens such as "lifecycle: renewal". Show the value. */
export function graphQueryFilterLabel(filter: string): string {
  const named = /^([^:]+): (.+)$/.exec(filter);
  if (!named) return filter;
  const kind = named[1] ?? "";
  const labels = (named[2] ?? "")
    .split(",")
    .map((part) => graphQueryTokenLabel(kind, part))
    .filter(Boolean);
  if (!labels.length) return filter;
  const value = labels.join(", ");
  if (kind === "lifecycle" || kind === "health" || kind === "text") return value;
  const titles: Record<string, string> = {
    nodes: "Included",
    approval: "Approval",
    sources: "Sources",
    edges: "Connections",
  };
  const title = titles[kind];
  return title ? `${title}: ${value}` : filter;
}
export function accountGraphPrompt(companyCount: number): string {
  if (companyCount === 0) return "Add a company before this graph can be built.";
  return "Choose a company to build its graph.";
}

function graphNodeRelationshipIDs(node: RelationshipGraphNode): string[] {
  const ids = new Set<string>();
  if (node.relationshipId) ids.add(node.relationshipId);
  for (const id of node.relationshipIds) {
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * People added from the directory are stored as relationships with
 * metadata.kind "person". The graph labels every relationship node "Company",
 * so those records draw a second company with the person's name. Drop that
 * cluster. A person who also belongs to a real company stays.
 */
export function withoutPersonDirectoryRecords(
  nodes: RelationshipGraphNode[],
  edges: RelationshipGraphEdge[],
): { nodes: RelationshipGraphNode[]; edges: RelationshipGraphEdge[] } {
  const personDirectoryIDs = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== "relationship" || node.metadata.kind !== "person") continue;
    personDirectoryIDs.add(node.id);
    for (const id of graphNodeRelationshipIDs(node)) personDirectoryIDs.add(id);
  }
  if (personDirectoryIDs.size === 0) return { nodes, edges };

  const onlyPersonDirectory = (node: RelationshipGraphNode) => {
    if (node.kind === "relationship" && node.metadata.kind === "person") return true;
    const ids = graphNodeRelationshipIDs(node);
    return ids.length > 0 && ids.every((id) => personDirectoryIDs.has(id));
  };

  const removedIDs = new Set(nodes.filter(onlyPersonDirectory).map((node) => node.id));
  let kept = nodes.filter((node) => !removedIDs.has(node.id));
  const keptIDs = new Set(kept.map((node) => node.id));
  let keptEdges = edges.filter((edge) => keptIDs.has(edge.source) && keptIDs.has(edge.target));
  const connected = new Set<string>();
  for (const edge of keptEdges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  kept = kept.filter((node) => {
    if (node.kind === "relationship" || connected.has(node.id)) return true;
    return !edges.some(
      (edge) =>
        (edge.source === node.id && removedIDs.has(edge.target)) ||
        (edge.target === node.id && removedIDs.has(edge.source)),
    );
  });
  const finalIDs = new Set(kept.map((node) => node.id));
  keptEdges = keptEdges.filter((edge) => finalIDs.has(edge.source) && finalIDs.has(edge.target));
  return { nodes: kept, edges: keptEdges };
}

/**
 * An empty canvas means two different things. Zero nodes in the payload means
 * the workspace has nothing to draw. Nodes that exist but are hidden were
 * removed by density, isolation, or a graph query, and Reset is the way back.
 */
export function graphCanvasEmptyState(totalNodes: number) {
  if (totalNodes === 0) {
    return { message: "No companies are in this graph yet.", offerReset: false };
  }
  return { message: "Nothing matches this view.", offerReset: true };
}

/** Nothing is selected. An empty graph has nothing to select. A filtered view does too. */
export function graphInspectorPrompt(
  nodeCount: number,
  visibleCount = nodeCount,
): { title: string; body: string } {
  if (nodeCount === 0) {
    return {
      title: "Nothing to inspect",
      body: "No companies are in this graph yet.",
    };
  }
  const shown = Number.isFinite(visibleCount) ? Math.max(0, visibleCount) : 0;
  if (shown === 0) {
    return {
      title: "Nothing to inspect",
      body: "Nothing in this view can be selected.",
    };
  }
  return {
    title: "Inspect the graph",
    body: "Select a company or a person to see how it connects.",
  };
}

function GraphCanvasEmpty({ totalNodes, onReset }: { totalNodes: number; onReset: () => void }) {
  const state = graphCanvasEmptyState(totalNodes);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <Graph className="size-7 text-primary/25" />
      <p className="mt-2 text-sm text-primary/55">{state.message}</p>
      {state.offerReset ? (
        <Button type="button" variant="link" size="sm" onClick={onReset} className="mt-2">
          Reset filters
        </Button>
      ) : null}
    </div>
  );
}

export function RelationshipGraphWorkspace({
  relationships,
  hasMoreCompanies = false,
  loadingMoreCompanies = false,
  onLoadMoreCompanies,
  onOpenRelationship,
  onError,
  onNotice,
}: {
  relationships: RevenueRelationship[];
  /** The account menu only lists companies the directory has already loaded. */
  hasMoreCompanies?: boolean;
  loadingMoreCompanies?: boolean;
  onLoadMoreCompanies?: () => void;
  onOpenRelationship: (id: string) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [viewState, setViewState] = React.useState<RelationshipGraphSavedViewState>(readURLState);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<"canvas" | "table">("canvas");
  const [queryDraft, setQueryDraft] = React.useState(() => readURLState().query);
  const [activeSavedViewId, setActiveSavedViewId] = React.useState<string>();
  const [namingView, setNamingView] = React.useState(false);
  const [viewName, setViewName] = React.useState("");
  const [viewError, setViewError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [resetSignal, setResetSignal] = React.useState(0);
  const migrationStartedRef = React.useRef(false);
  const graphEnabled = !(viewState.scope === "relationship" && !viewState.relationshipId);
  const graphQuery = useRelationshipGraph(
    {
      scope: viewState.scope,
      relationshipId: viewState.relationshipId,
      depth: 2,
      asOf: viewState.asOf,
    },
    graphEnabled,
  );
  const loadedGraph = graphEnabled ? (graphQuery.data ?? null) : null;
  const [laterCompanies, setLaterCompanies] = React.useState<RelationshipGraph[]>([]);
  const [laterHasMore, setLaterHasMore] = React.useState<boolean | null>(null);
  const [loadingLaterCompanies, setLoadingLaterCompanies] = React.useState(false);
  const [laterEvidence, setLaterEvidence] = React.useState<RelationshipGraph[]>([]);
  const [evidenceHasMore, setEvidenceHasMore] = React.useState<boolean | null>(null);
  const [loadingEarlierEvidence, setLoadingEarlierEvidence] = React.useState(false);
  React.useEffect(() => {
    setLaterCompanies([]);
    setLaterHasMore(null);
    setLoadingLaterCompanies(false);
  }, [viewState.scope, viewState.relationshipId, viewState.asOf]);
  React.useEffect(() => {
    setLaterEvidence([]);
    setEvidenceHasMore(null);
    setLoadingEarlierEvidence(false);
  }, [viewState.scope, viewState.relationshipId, viewState.asOf, laterCompanies.length]);
  const graph = React.useMemo(() => {
    if (!loadedGraph) return null;
    const companyPages = [loadedGraph, ...laterCompanies];
    const pages = [...companyPages, ...laterEvidence];
    const nodes = [
      ...new Map(pages.flatMap((page) => page.nodes).map((node) => [node.id, node])).values(),
    ];
    const edges = [
      ...new Map(pages.flatMap((page) => page.edges).map((edge) => [edge.id, edge])).values(),
    ];
    const visible = withoutPersonDirectoryRecords(nodes, edges);
    const titles = new Map(
      relationships
        .filter((row) => row.kind !== "person")
        .map((row) => [row.id, companyName(row)]),
    );
    return {
      ...loadedGraph,
      ...visible,
      hasMore: laterHasMore ?? loadedGraph.hasMore,
      observationHasMore:
        evidenceHasMore ?? companyPages.some((page) => page.observationHasMore),
      nodes: visible.nodes.map((node) => {
        if (node.kind !== "relationship" || !node.relationshipId) return node;
        const title = titles.get(node.relationshipId);
        return title ? { ...node, label: title } : node;
      }),
    };
  }, [evidenceHasMore, laterCompanies, laterEvidence, laterHasMore, loadedGraph, relationships]);
  const loading = graphEnabled && graphQuery.isPending;
  const loadLaterCompanies = async () => {
    if (!graph?.hasMore || loadingLaterCompanies || viewState.scope !== "portfolio") return;
    setLoadingLaterCompanies(true);
    try {
      const page = await getRelationshipGraph({
        scope: "portfolio",
        depth: 2,
        asOf: viewState.asOf,
        offset: (laterCompanies.length + 1) * GRAPH_COMPANY_PAGE,
      });
      setLaterCompanies((current) => [...current, page]);
      setLaterHasMore(Boolean(page.hasMore));
    } catch (error) {
      onError(errMessage(error, "Could not load the next companies."));
    } finally {
      setLoadingLaterCompanies(false);
    }
  };
  const loadEarlierEvidence = async () => {
    if (!graph?.observationHasMore || loadingEarlierEvidence) return;
    setLoadingEarlierEvidence(true);
    try {
      const observationOffset =
        (laterEvidence.length + 1) * graphEvidencePage(viewState.scope);
      const base = {
        scope: viewState.scope,
        relationshipId: viewState.relationshipId,
        depth: 2 as const,
        asOf: viewState.asOf,
        observationOffset,
      };
      const pages = await Promise.all([
        getRelationshipGraph(base),
        ...laterCompanies.map((_, index) =>
          getRelationshipGraph({
            ...base,
            scope: "portfolio",
            relationshipId: undefined,
            offset: (index + 1) * GRAPH_COMPANY_PAGE,
          }),
        ),
      ]);
      setLaterEvidence((current) => [...current, ...pages]);
      setEvidenceHasMore(pages.some((page) => page.observationHasMore));
    } catch (error) {
      onError(errMessage(error, "Could not load earlier evidence."));
    } finally {
      setLoadingEarlierEvidence(false);
    }
  };
  // The canvas explains a first load that never arrived. A later refresh still
  // has the graph, so the sentence stays on the canvas instead of the page banner.
  const loadError =
    graphQuery.error && !loadedGraph
      ? friendlyRevenueError(errMessage(graphQuery.error, "Could not load the company graph."))
      : null;
  const graphRefreshError =
    graphQuery.error && loadedGraph ? listRefreshFailureCopy("the company graph") : null;
  const savedViewsQuery = useConsoleResources("graph_saved_view", graphSavedViews);
  const remoteSavedViews = savedViewsQuery.data?.items ?? [];
  const [extraSavedViews, setExtraSavedViews] = React.useState<GraphSavedViewResource[]>([]);
  const [laterSavedViewsHasMore, setLaterSavedViewsHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreSavedViews, setLoadingMoreSavedViews] = React.useState(false);
  React.useEffect(() => {
    setExtraSavedViews([]);
    setLaterSavedViewsHasMore(null);
  }, [savedViewsQuery.dataUpdatedAt]);
  const savedViewResources = React.useMemo(() => {
    const seen = new Set(remoteSavedViews.map((view) => view.id));
    return [...remoteSavedViews, ...extraSavedViews.filter((view) => !seen.has(view.id))];
  }, [extraSavedViews, remoteSavedViews]);
  const hasMoreSavedViews = laterSavedViewsHasMore ?? Boolean(savedViewsQuery.data?.hasMore);
  const loadMoreSavedViews = async () => {
    if (loadingMoreSavedViews || !hasMoreSavedViews) return;
    setLoadingMoreSavedViews(true);
    try {
      const page = await fetchConsoleResources(
        "graph_saved_view",
        undefined,
        remoteSavedViews.length + extraSavedViews.length,
      );
      setLaterSavedViewsHasMore(consoleResourcePageHasMore(page));
      setExtraSavedViews((current) => [
        ...current,
        ...graphSavedViews(consoleResourceRows(page)),
      ]);
    } catch (error) {
      onError(errMessage(error, "Could not load more saved views."));
    } finally {
      setLoadingMoreSavedViews(false);
    }
  };
  const legacyViews = React.useMemo(
    () => (typeof window === "undefined" ? [] : readLegacyGraphViews(window.localStorage)),
    [],
  );
  const savedViews: RelationshipGraphSavedView[] =
    savedViewsQuery.isError && savedViewResources.length === 0
      ? legacyViews
      : savedViewResources.map((resource) => ({
        id: resource.id,
        label: resource.name,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
        state: resource.payload.state,
      }));
  const saveViewMutation = useMutation({
    mutationFn: ({ label, state }: { label: string; state: RelationshipGraphSavedViewState }) =>
      createConsoleResource({
        kind: "graph_saved_view",
        name: label,
        payload: { state },
      }),
    onSuccess: (resource) => {
      setActiveSavedViewId(resource.id);
      setNamingView(false);
      void queryClient.invalidateQueries({
        queryKey: consoleKeys.resourceKind("graph_saved_view"),
      });
      onNotice(`Saved “${resource.name}”.`);
    },
    onError: (error) => {
      const message = errMessage(error, "Could not save this graph view.");
      setViewError(message);
      onError(message);
    },
  });
  const deleteViewMutation = useMutation({
    mutationFn: (resourceId: string) => deleteConsoleResource(resourceId),
    onSuccess: () => {
      setActiveSavedViewId(undefined);
      void queryClient.invalidateQueries({
        queryKey: consoleKeys.resourceKind("graph_saved_view"),
      });
      onNotice("Saved graph view deleted.");
    },
    onError: (error) => onError(errMessage(error, "Could not delete this graph view.")),
  });
  const [migrationSettled, setMigrationSettled] = React.useState(false);
  const { mutate: migrateLegacyViews, isPending: migrationPending } = useMutation({
    mutationFn: ({
      remote,
      legacy,
    }: {
      remote: ReturnType<typeof graphSavedViews>;
      legacy: RelationshipGraphSavedView[];
    }) =>
      migrateLegacyGraphViews({
        storage: window.localStorage,
        remote,
        legacy,
        create: (view) =>
          createConsoleResource({
            kind: "graph_saved_view",
            name: view.label,
            payload: { state: view.state },
          }),
      }),
    onSuccess: (changed) => {
      if (changed) {
        void queryClient.invalidateQueries({
          queryKey: consoleKeys.resourceKind("graph_saved_view"),
        });
      }
    },
    onError: (error) => onError(errMessage(error, "Could not import local saved graph views.")),
    onSettled: () => setMigrationSettled(true),
  });

  React.useEffect(() => {
    if (!savedViewsQuery.data || migrationStartedRef.current) return;
    migrationStartedRef.current = true;
    // Read before the snapshot effect replaces this key with the server list.
    // Otherwise the import treats views that already exist as new local views.
    if (window.localStorage.getItem(GRAPH_VIEWS_MIGRATED_KEY) === "true") {
      setMigrationSettled(true);
      return;
    }
    migrateLegacyViews({
      remote: savedViewsQuery.data.items,
      legacy: readLegacyGraphViews(window.localStorage),
    });
  }, [migrateLegacyViews, savedViewsQuery.data]);

  React.useEffect(() => {
    if (!savedViewsQuery.data || !migrationSettled || migrationPending) return;
    const snapshot = savedViewResources.map((resource) => ({
      id: resource.id,
      label: resource.name,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      state: resource.payload.state,
    }));
    try {
      window.localStorage.setItem(LEGACY_GRAPH_VIEWS_KEY, JSON.stringify(snapshot));
    } catch {
      // The durable API remains authoritative when browser storage is unavailable.
    }
  }, [migrationPending, migrationSettled, savedViewResources, savedViewsQuery.data]);

  const load = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: relationshipKeys.graphs() });
  }, [queryClient]);

  React.useEffect(() => {
    if (!graph) return;
    setViewState((current) =>
      current.selectedNodeId && !graph.nodes.some((node) => node.id === current.selectedNodeId)
        ? { ...current, selectedNodeId: undefined, focusDepth: 0 }
        : current,
    );
  }, [graph]);

  React.useEffect(() => {
    writeURLState(viewState);
  }, [viewState]);

  const queryResult = React.useMemo(
    () =>
      graph && viewState.query
        ? queryRelationshipGraph(graph, viewState.query, { asOf: graph.asOf })
        : null,
    [graph, viewState.query],
  );

  const visible = React.useMemo(() => {
    if (!graph) return { nodes: [], edges: [], capped: false, matchedCount: 0 };
    let nodes = graph.nodes;
    let edges = graph.edges;
    if (viewState.changedSinceReview) {
      const changedRelationships = new Set(
        graph.nodes
          .filter((node) => node.kind === "relationship" && node.changedSinceReview)
          .flatMap((node) => node.relationshipIds),
      );
      nodes = nodes.filter((node) =>
        node.relationshipIds.some((id) => changedRelationships.has(id)),
      );
    }
    if (queryResult) {
      const ids = new Set(queryResult.visibleNodeIds);
      nodes = nodes.filter((node) => ids.has(node.id));
      edges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    }
    if (viewState.focusDepth && viewState.selectedNodeId) {
      const neighborhood = relationshipGraphNeighborhood(
        { nodes, edges },
        viewState.selectedNodeId,
        viewState.focusDepth,
      );
      if (neighborhood.nodeIds.length) {
        const focusedNodeIds = new Set(neighborhood.nodeIds);
        nodes = nodes.filter((node) => focusedNodeIds.has(node.id));
        edges = edges.filter(
          (edge) => focusedNodeIds.has(edge.source) && focusedNodeIds.has(edge.target),
        );
      }
    }
    if (viewState.hideIsolated) {
      const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
      nodes = nodes.filter((node) => connected.has(node.id));
    }
    const available = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => available.has(edge.source) && available.has(edge.target));

    const matchedCount = nodes.length;
    const capState = graphCanvasCapState(matchedCount, graphNodeCap(viewState.density));
    if (capState.capped) {
      nodes = [...nodes]
        .sort((left, right) => {
          const score = (node: RelationshipGraphNode) =>
            (node.kind === "relationship" ? 100 : 0) +
            (node.changedSinceReview ? 50 : 0) +
            (node.kind === "risk" ? 30 : 0) +
            (node.kind === "action" ? 20 : 0) +
            (node.evidenceRefs.length ? 10 : 0);
          return score(right) - score(left);
        })
        .slice(0, capState.shown);
      const cappedIds = new Set(nodes.map((node) => node.id));
      edges = edges.filter((edge) => cappedIds.has(edge.source) && cappedIds.has(edge.target));
    }
    return { nodes, edges, capped: capState.capped, matchedCount };
  }, [
    graph,
    queryResult,
    viewState.changedSinceReview,
    viewState.density,
    viewState.focusDepth,
    viewState.hideIsolated,
    viewState.selectedNodeId,
  ]);

  const selectedNode = graph?.nodes.find((node) => node.id === viewState.selectedNodeId);
  const updateState = React.useCallback((patch: Partial<RelationshipGraphSavedViewState>) => {
    setViewState((current) => ({ ...current, ...patch }));
  }, []);
  const selectNode = React.useCallback(
    (selectedNodeId?: string) => {
      setActionError(null);
      updateState({
        selectedNodeId,
        focusDepth: selectedNodeId ? viewState.focusDepth : 0,
      });
    },
    [updateState, viewState.focusDepth],
  );

  const openSaveDialog = () => {
    if (!graph?.permissions.canSaveViews) return;
    setViewError(null);
    setViewName(`Graph view ${savedViews.length + 1}`);
    setNamingView(true);
  };

  const confirmSaveView = () => {
    const label = viewName.trim();
    if (!label || !graph?.permissions.canSaveViews) return;
    setViewError(null);
    saveViewMutation.mutate({ label, state: viewState });
  };

  const applySavedView = (id: string) => {
    const saved = savedViews.find((item) => item.id === id);
    if (!saved) return;
    setViewState(saved.state);
    setQueryDraft(saved.state.query);
    setActiveSavedViewId(saved.id);
  };

  const deleteSavedView = () => {
    if (!activeSavedViewId) return;
    deleteViewMutation.mutate(activeSavedViewId);
  };

  const shareView = async () => {
    writeURLState(viewState);
    try {
      await navigator.clipboard.writeText(window.location.href);
      onNotice("Link copied.");
    } catch {
      onError("Could not copy the graph link.");
    }
  };

  const governAction = async (kind: "evaluate" | "approve" | "reject", actionId: string) => {
    setActionError(null);
    setBusy(true);
    try {
      if (kind === "evaluate") await evaluateAction(actionId);
      if (kind === "approve") await approveAction(actionId);
      if (kind === "reject")
        await rejectAction(actionId, "Rejected from relationship graph review.");
      onNotice(graphActionNotice(kind));
      await load();
    } catch (error) {
      const verb = kind === "evaluate" ? "check" : kind;
      const message = errMessage(error, `Could not ${verb} this action.`);
      setActionError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const proposeAction = async (node: RelationshipGraphNode) => {
    const relationshipId = node.relationshipId || node.relationshipIds[0];
    if (!relationshipId) return;
    setActionError(null);
    setBusy(true);
    try {
      await createAction({
        relationshipId,
        actionType: "follow_up_task",
        channel: "task",
        executionMode: "draft",
        reason: `Follow up on ${KIND_LABEL[node.kind].toLowerCase()}: ${node.label}`,
        proposedMessage: node.summary || `Review and follow up on ${node.label}.`,
      });
      onNotice("Follow-up proposed. It still needs your approval.");
      await load();
    } catch (error) {
      const message = errMessage(error, "Could not propose a follow-up.");
      setActionError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    const next = { ...DEFAULT_STATE, relationshipId: undefined };
    setViewState(next);
    setQueryDraft("");
    setActiveSavedViewId(undefined);
    setResetSignal((value) => value + 1);
  };

  return (
    <section
      className="overflow-hidden rounded-[2px] border border-border bg-background"
      data-capability={GRAPH_CAPABILITIES}
      data-slot="relationship-graph"
    >
      <div className="border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex items-center gap-2">
            <ItemMedia
              className="size-8 rounded-none bg-oppulence-orange/10 text-oppulence-orange"
              variant="icon"
            >
              <ShareNetwork className="size-4" weight="duotone" />
            </ItemMedia>
            <div>
              <h2 className="text-sm font-semibold text-primary">Company graph</h2>
              <p className="text-[10px] text-primary/40">
                Companies, people, and the promises between them
              </p>
            </div>
          </div>
          <ToggleGroup
            type="single"
            value={viewState.scope}
            onValueChange={(value) => {
              const scope = value as RelationshipGraphSavedViewState["scope"];
              if (!scope) return;
              updateState({
                scope,
                relationshipId:
                  scope === "portfolio"
                    ? undefined
                    : viewState.relationshipId || relationships[0]?.id,
                selectedNodeId: undefined,
                focusDepth: 0,
              });
            }}
            variant="outline"
            size="sm"
            aria-label="Graph scope"
          >
            {(["portfolio", "relationship"] as const).map((scope) => (
              // The words are already sentence case. capitalize showed All Companies.
              <ToggleGroupItem
                key={scope}
                value={scope}
                className="data-[state=on]:bg-primary data-[state=on]:text-background"
              >
                {scope === "relationship" ? "One company" : "All companies"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {viewState.scope === "relationship" && relationships.length > 0 ? (
            <Select
              value={viewState.relationshipId}
              onValueChange={(relationshipId) =>
                updateState({ relationshipId, selectedNodeId: undefined, focusDepth: 0 })
              }
            >
              <SelectTrigger
                aria-label={comboboxFilterName(
                  "Company",
                  graphAccountChoice(
                    (() => {
                      const selected = relationships.find(
                        (relationship) => relationship.id === viewState.relationshipId,
                      );
                      return selected ? companyName(selected) : undefined;
                    })(),
                  ),
                )}
                size="sm"
                className="w-52"
              >
                <SelectValue placeholder="Choose a company" />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-[2px]">
                {relationships.map((relationship) => (
                  <SelectItem key={relationship.id} value={relationship.id}>
                    {companyName(relationship)}
                  </SelectItem>
                ))}
                {hasMoreCompanies ? (
                  <Button
                    className={
                      "sticky bottom-0 z-10 h-8 w-full justify-start rounded-none " +
                      "border-t border-border bg-background px-2 text-[12px]"
                    }
                    disabled={loadingMoreCompanies}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      onLoadMoreCompanies?.();
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {loadingMoreCompanies ? "Loading…" : graphNextCompaniesLabel()}
                  </Button>
                ) : null}
              </SelectContent>
            </Select>
          ) : null}
          {graph?.hasMore ? (
            <Button
              disabled={loadingLaterCompanies}
              onClick={() => void loadLaterCompanies()}
              size="sm"
              type="button"
              variant="outline"
            >
              {loadingLaterCompanies ? "Loading…" : graphNextCompaniesLabel()}
            </Button>
          ) : null}
          {graph?.observationHasMore ? (
            <Button
              disabled={loadingEarlierEvidence}
              onClick={() => void loadEarlierEvidence()}
              size="sm"
              type="button"
              variant="outline"
            >
              {loadingEarlierEvidence ? "Loading…" : graphEarlierEvidenceLabel()}
            </Button>
          ) : null}
        </div>

        {/* Ask, layout, and filters read a built graph. An account graph with no
            company has nothing for them to change. */}
        {graphEnabled ? (
        <form
          className="mt-3 flex flex-col gap-2 lg:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !graphAskChanges(queryDraft, {
                query: viewState.query,
                focusDepth: viewState.focusDepth,
                selectedNodeId: viewState.selectedNodeId,
              })
            ) {
              return;
            }
            updateState({ query: queryDraft.trim(), selectedNodeId: undefined, focusDepth: 0 });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Sparkle className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-oppulence-orange" />
            <Input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              className="pl-8"
              aria-label="Ask this graph"
              placeholder="Ask about a company or a promise."
            />
          </div>
          <Button
            disabled={
              !graphAskChanges(queryDraft, {
                query: viewState.query,
                focusDepth: viewState.focusDepth,
                selectedNodeId: viewState.selectedNodeId,
              })
            }
            type="submit"
            size="sm"
          >
            Ask
          </Button>
          {viewState.query ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQueryDraft("");
                updateState({ query: "" });
              }}
            >
              <X /> Clear
            </Button>
          ) : null}
        </form>
        ) : null}

        {queryResult ? (
          <div
            className="mt-2 flex flex-wrap items-center gap-2 border border-oppulence-orange/20 bg-oppulence-orange/5 px-3 py-2 text-xs text-primary/65"
            aria-live="polite"
          >
            <Sparkle className="size-4 shrink-0 text-oppulence-orange" />
            <Label className="mr-auto font-normal">
              {graphQueryAnswer(
                queryResult.answer,
                relationships.length,
                Boolean(graph?.hasMore),
              )}
            </Label>
            {relationships.length === 0
              ? null
              : queryResult.parsed.applied.map((filter) => (
                  <Badge key={filter} variant="outline" className="rounded-full font-normal">
                    {graphQueryFilterLabel(filter)}
                  </Badge>
                ))}
            {relationships.length === 0 ? null : (
              <Badge
                className="rounded-none font-mono text-[10px] font-normal text-primary/45"
                variant="outline"
              >
                {graphCountLabel(queryResult.evidenceRefs.length, "detail", "details")}
              </Badge>
            )}
          </div>
        ) : null}
      </div>

      {graphEnabled ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => value && setMode(value as "canvas" | "table")}
          variant="outline"
          size="sm"
          aria-label="Graph presentation"
        >
          <ToggleGroupItem value="canvas" className="data-[state=on]:bg-primary/10">
            <Graph /> Diagram
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className="data-[state=on]:bg-primary/10">
            <ListBullets /> Table
          </ToggleGroupItem>
        </ToggleGroup>
        {/* Grouped, Circle, and By time place the diagram. The table uses the same rows. */}
        {mode === "canvas" ? (
          <Select
            value={viewState.layout}
            onValueChange={(layout: RelationshipGraphSavedViewState["layout"]) =>
              updateState({ layout })
            }
          >
            <SelectTrigger
              aria-label={comboboxFilterName("Layout", graphLayoutLabel(viewState.layout))}
              size="sm"
              className="w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="app-shell rounded-[2px]">
              <SelectItem value="force">{graphLayoutLabel("force")}</SelectItem>
              <SelectItem value="radial">{graphLayoutLabel("radial")}</SelectItem>
              <SelectItem value="timeline">{graphLayoutLabel("timeline")}</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <label className="flex items-center gap-2 text-xs text-primary/50">
          How many to show
          <Slider
            min={0.25}
            max={1}
            step={0.05}
            value={[viewState.density]}
            onValueChange={(value) => updateState({ density: value[0] ?? DEFAULT_STATE.density })}
            className="w-20"
            aria-label="How many to show"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-primary/55">
          <Checkbox
            checked={viewState.hideIsolated}
            onCheckedChange={(checked) => updateState({ hideIsolated: checked === true })}
          />
          Hide unconnected
        </label>
        <label className="flex items-center gap-1.5 text-xs text-primary/55">
          <Checkbox
            checked={viewState.changedSinceReview}
            onCheckedChange={(checked) => updateState({ changedSinceReview: checked === true })}
          />
          Changed since you last looked
        </label>
        <DateTimePicker
          value={viewState.asOf}
          onChange={(value) =>
            updateState({
              asOf: value || undefined,
              selectedNodeId: undefined,
              focusDepth: 0,
            })
          }
          aria-label="View the graph as of a date"
          placeholder="As of a date"
          className="w-64"
        />
        <div className="ml-auto flex items-center gap-1">
          {savedViewsQuery.isLoading ? (
            <Badge variant="outline">
              <CircleNotch className="animate-spin" /> Loading views
            </Badge>
          ) : null}
          {savedViewsQuery.isError ? (
            <Button
              onClick={() => void savedViewsQuery.refetch()}
              size="sm"
              title="Saved views on this computer stay readable until Oppulence is reachable again."
              variant="outline"
            >
              <WarningDiamond /> Saved views unavailable · Retry
            </Button>
          ) : null}
          {savedViews.length ? (
            <Select value={activeSavedViewId} onValueChange={applySavedView}>
              <SelectTrigger
                aria-label={comboboxFilterName(
                  "Saved view",
                  graphSavedViewChoice(
                    savedViews.find((view) => view.id === activeSavedViewId)?.label,
                  ),
                )}
                size="sm"
                className="w-36"
              >
                <SelectValue placeholder="Saved views" />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-[2px]">
                {savedViews.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    {view.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {hasMoreSavedViews ? (
            <Button
              disabled={loadingMoreSavedViews}
              onClick={() => void loadMoreSavedViews()}
              size="sm"
              type="button"
              variant="outline"
            >
              {loadingMoreSavedViews ? "Loading…" : nextSavedViewsLabel()}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={openSaveDialog}
            disabled={
              !graph?.permissions.canSaveViews ||
              savedViewsQuery.isError ||
              saveViewMutation.isPending
            }
          >
            <FloppyDisk /> Save
          </Button>
          {activeSavedViewId ? (
            <Button
              disabled={deleteViewMutation.isPending || savedViewsQuery.isError}
              type="button"
              size="sm"
              variant="ghost"
              onClick={deleteSavedView}
            >
              <X /> Delete
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => void shareView()}>
            <Link /> Share
          </Button>
          <Button
            disabled={!graphCanReset(viewState, queryDraft, activeSavedViewId)}
            type="button"
            size="sm"
            variant="ghost"
            onClick={reset}
          >
            <ArrowCounterClockwise /> Reset
          </Button>
        </div>
      </div>
      ) : null}

      {graphRefreshError ? (
        <ListRefreshFailure message={graphRefreshError} onRetry={() => void load()} />
      ) : null}

      <div
        className={`grid min-h-[620px] grid-cols-1 ${graph ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <div className="relative min-h-[500px] bg-background">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-primary/45">
              <CircleNotch className="mr-2 size-4 animate-spin" /> Building the company graph…
            </div>
          ) : loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <WarningDiamond className="size-7 text-destructive" />
              <p className="mt-2 max-w-lg text-sm text-primary/65">{loadError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void load()}
              >
                Retry
              </Button>
            </div>
          ) : !graph ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-primary/45">
              {accountGraphPrompt(relationships.length)}
            </div>
          ) : mode === "table" ? (
            <GraphTable
              edges={visible.edges}
              empty={graphCanvasEmptyState(graph.nodes.length)}
              nodes={visible.nodes}
              onReset={reset}
              onSelectNode={selectNode}
              selectedNodeId={viewState.selectedNodeId}
            />
          ) : !visible.nodes.length ? (
            <GraphCanvasEmpty onReset={reset} totalNodes={graph.nodes.length} />
          ) : (
            <ReactFlowProvider>
              <GraphCanvas
                nodes={visible.nodes}
                edges={visible.edges}
                layout={viewState.layout}
                density={viewState.density}
                selectedNodeId={viewState.selectedNodeId}
                onSelectNode={selectNode}
                resetSignal={resetSignal}
              />
            </ReactFlowProvider>
          )}
          {/* The graph response echoes asOf and still leaves historical false, so the
              banner follows the moment the user chose. */}
          {viewState.asOf ? (
            <div className="absolute bottom-3 left-3 flex items-center gap-1 border border-amber-500/30 bg-background/90 px-2 py-1 text-[10px] text-amber-600 backdrop-blur dark:text-amber-400">
              <ClockCounterClockwise /> {graphAsOfLabel(viewState.asOf)}
            </div>
          ) : null}
          {graph && viewState.focusDepth && viewState.selectedNodeId ? (
            <div className="absolute bottom-3 right-3 border border-oppulence-orange/25 bg-background/90 px-2 py-1 text-[10px] text-primary/55 backdrop-blur">
              Focused · {viewState.focusDepth === 1 ? "Nearby" : "Wider"} ·{" "}
              {graphCountLabel(visible.nodes.length, "item", "items")}
              <Button
                variant="link"
                size="xs"
                onClick={() => updateState({ focusDepth: 0 })}
                className="ml-1 h-auto p-0 text-oppulence-orange"
              >
                Show all
              </Button>
            </div>
          ) : graph && visible.capped ? (
            <div className="absolute bottom-3 right-3 border border-border bg-background/90 px-2 py-1 text-[10px] text-primary/45">
              {graphCanvasCapLabel(visible.nodes.length, visible.matchedCount)}
            </div>
          ) : null}
        </div>
        {graph ? (
          <Inspector
            node={selectedNode}
            graph={graph}
            visibleCount={visible.nodes.length}
            busy={busy}
            onSelectNode={selectNode}
            onOpen={onOpenRelationship}
            onAction={(kind, actionId) => void governAction(kind, actionId)}
            onPropose={(node) => void proposeAction(node)}
            focusDepth={viewState.focusDepth}
            onFocusDepth={(focusDepth) => updateState({ focusDepth })}
            actionError={actionError}
          />
        ) : null}
      </div>
      <Dialog open={namingView} onOpenChange={setNamingView}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name this graph view</DialogTitle>
            <DialogDescription>
              Saved views keep the current filters, focus, and layout for this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="graph-view-name">View name</Label>
            <Input
              id="graph-view-name"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  confirmSaveView();
                }
              }}
            />
            {viewError ? <p className="text-sm text-destructive">{viewError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNamingView(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!viewName.trim() || saveViewMutation.isPending}
              onClick={confirmSaveView}
            >
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
