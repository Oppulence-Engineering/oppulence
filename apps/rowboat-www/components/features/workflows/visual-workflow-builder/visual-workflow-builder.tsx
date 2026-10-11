"use client";

import "client-only";

import * as React from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarBlank,
  EnvelopeSimple,
  Lightning,
  MagnifyingGlass,
  NotePencil,
  Plus,
  Trash,
  UserFocus,
} from "@/lib/icons";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";

import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { CardDescription } from "@oppulence/ui/components/card";
import { ItemMedia } from "@oppulence/ui/components/item";
import { Input } from "@oppulence/ui/components/input";
import { Label } from "@oppulence/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import { Textarea } from "@oppulence/ui/components/textarea";
import { cn } from "@oppulence/ui/lib/utils";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import {
  cronClockLabel,
  type VisualWorkflowDefinition,
  type WorkflowActionKind,
  type WorkflowTriggerKind,
} from "@/lib/workflows/cloud-workflows";

type Option = { value: string; label: string };
type StepField = {
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  options?: Option[];
};

const triggers: Array<{
  value: WorkflowTriggerKind;
  label: string;
  detail: string;
}> = [
  { value: "manual", label: "Manually started", detail: "Run only when someone starts it" },
  { value: "schedule", label: "Scheduled time", detail: "Run on a repeating schedule." },
  {
    value: "communication",
    label: "Mail or message received",
    detail: "Gmail, Calendar, or HubSpot",
  },
  {
    value: "profile-change",
    label: "Company or person updated",
    detail: "A company or person field changes.",
  },
  {
    value: "relationship-risk",
    label: "Company risk changed",
    detail: "A company needs attention for a new reason.",
  },
  {
    value: "commitment-risk",
    label: "A promise needs a follow-up",
    detail: "A promise is due, disputed, or overdue.",
  },
];

const actions: Array<{
  value: WorkflowActionKind;
  label: string;
  detail: string;
  icon: ReactNode;
  fields: StepField[];
}> = [
  {
    value: "review-account",
    label: "Review company",
    detail: "Read the company, the people on it, and its open promises.",
    icon: <MagnifyingGlass />,
    fields: [
      {
        key: "scope",
        label: "Which companies",
        defaultValue: "matching-record",
        options: [
          { value: "matching-record", label: "Matching company and people" },
          { value: "relationship-portfolio", label: "Every company" },
        ],
      },
    ],
  },
  {
    value: "draft-email",
    label: "Draft a follow-up",
    detail: "Create a Gmail draft that waits for your approval.",
    icon: <EnvelopeSimple />,
    fields: [
      {
        key: "recipient",
        label: "Recipient",
        defaultValue: "promise-recipient",
        options: [
          { value: "promise-recipient", label: "Promise recipient" },
          { value: "primary-contact", label: "Primary contact" },
          { value: "relationship-owner", label: "Company owner" },
        ],
      },
      {
        key: "tone",
        label: "Tone",
        defaultValue: "concise",
        options: [
          { value: "concise", label: "Concise and direct" },
          { value: "warm", label: "Warm and collaborative" },
          { value: "executive", label: "Executive brief" },
        ],
      },
    ],
  },
  {
    value: "create-crm-task",
    label: "Create a HubSpot task",
    detail: "Create a HubSpot task with an owner and a due date.",
    icon: <Lightning />,
    fields: [
      {
        key: "assignee",
        label: "Assign to",
        defaultValue: "relationship-owner",
        options: [
          { value: "relationship-owner", label: "Company owner" },
          { value: "commitment-owner", label: "Promise owner" },
        ],
      },
      {
        key: "due-window",
        label: "Due",
        defaultValue: "24-hours",
        options: [
          { value: "same-day", label: "Same day" },
          { value: "24-hours", label: "Within 24 hours" },
          { value: "72-hours", label: "Within 72 hours" },
        ],
      },
    ],
  },
  {
    value: "update-crm-note",
    label: "Add a HubSpot note",
    detail: "Add a HubSpot note from this workflow.",
    icon: <NotePencil />,
    fields: [
      {
        key: "format",
        label: "Note format",
        defaultValue: "timeline",
        options: [
          { value: "timeline", label: "Timeline entry" },
          { value: "summary", label: "Company summary" },
        ],
      },
    ],
  },
  {
    value: "schedule-meeting",
    label: "Schedule meeting",
    detail: "Propose a meeting that waits for your approval.",
    icon: <CalendarBlank />,
    fields: [
      {
        key: "duration",
        label: "Duration",
        defaultValue: "30-minutes",
        options: [
          { value: "15-minutes", label: "15 minutes" },
          { value: "30-minutes", label: "30 minutes" },
          { value: "45-minutes", label: "45 minutes" },
          { value: "60-minutes", label: "60 minutes" },
        ],
      },
    ],
  },
  {
    value: "write-brief",
    // Every maintained workflow draws this step. The label names the brief, not a publish pipeline.
    label: "Save a brief",
    detail: "Keep a brief this workflow can update.",
    icon: <UserFocus />,
    fields: [
      {
        key: "audience",
        label: "Audience",
        defaultValue: "account-team",
        options: [
          { value: "account-team", label: "Company team" },
          { value: "leadership", label: "Leadership" },
          { value: "customer", label: "Customer-ready" },
        ],
      },
    ],
  },
];

const scheduleOptions: Option[] = [
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 8 * * *", label: cronClockLabel("0 8 * * *") },
  { value: "0 9 * * *", label: cronClockLabel("0 9 * * *") },
  { value: "0 9 * * 1-5", label: cronClockLabel("0 9 * * 1-5") },
  { value: "0 8 * * 1", label: cronClockLabel("0 8 * * 1") },
];

const actionFor = (kind: WorkflowActionKind) =>
  actions.find((action) => action.value === kind) ?? actions[0];
const triggerFor = (kind: WorkflowTriggerKind) =>
  triggers.find((trigger) => trigger.value === kind) ?? triggers[0];

/** The closed menu shows the choice. Its name has to say which menu and which choice. */
function workflowChoiceName(category: string, choice: string): string {
  return comboboxFilterName(category, choice);
}

function scheduleChoiceLabel(cronExpr: string | undefined): string {
  const value = cronExpr || "0 9 * * 1-5";
  return scheduleOptions.find((option) => option.value === value)?.label ?? cronClockLabel(value);
}

function NodeLabel({
  eyebrow,
  title,
  detail,
  icon,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-3 text-left">
      <ItemMedia
        className="mt-0.5 size-8 shrink-0 rounded-none border border-border bg-muted/40 text-foreground [&>svg]:size-4"
        variant="icon"
      >
        {icon}
      </ItemMedia>
      <div className="min-w-0">
        <Label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {eyebrow}
        </Label>
        <Label className="mt-0.5 block truncate text-[13px] font-medium text-foreground">
          {title}
        </Label>
        <CardDescription className="mt-0.5 block truncate text-[11px]">{detail}</CardDescription>
      </div>
    </div>
  );
}

const nodeStyle = {
  backgroundColor: "var(--background)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  color: "var(--foreground)",
  padding: 0,
  width: 300,
};

function graph(
  definition: VisualWorkflowDefinition,
  selectedId: string,
): {
  nodes: Node[];
  edges: Edge[];
} {
  const trigger = triggerFor(definition.trigger.kind);
  const nodes: Node[] = [
    {
      id: "trigger",
      position: { x: 80, y: 24 },
      data: {
        label: (
          <NodeLabel
            detail={trigger.detail}
            eyebrow="When"
            icon={<Lightning />}
            title={trigger.label}
          />
        ),
      },
      selected: selectedId === "trigger",
      style: nodeStyle,
    },
    ...definition.actions.map((kind, index) => {
      const action = actionFor(kind);
      return {
        id: `action:${index}`,
        position: { x: 80, y: 166 + index * 142 },
        data: {
          label: (
            <NodeLabel
              detail={action.detail}
              eyebrow={`Step ${index + 1}`}
              icon={action.icon}
              title={action.label}
            />
          ),
        },
        selected: selectedId === `action:${index}`,
        style: nodeStyle,
      };
    }),
  ];
  return {
    nodes,
    edges: definition.actions.map((_, index) => ({
      id: `edge:${index}`,
      source: index === 0 ? "trigger" : `action:${index - 1}`,
      target: `action:${index}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
      style: { stroke: "var(--muted-foreground)", strokeWidth: 1 },
    })),
  };
}

function actionConfig(
  definition: VisualWorkflowDefinition,
  index: number,
  kind: WorkflowActionKind,
): Record<string, string> {
  const stored = definition.stepConfig?.[`action:${index}`] ?? {};
  return Object.fromEntries(
    actionFor(kind).fields.map((field) => [field.key, stored[field.key] ?? field.defaultValue]),
  );
}

function moveAction(
  definition: VisualWorkflowDefinition,
  from: number,
  to: number,
): VisualWorkflowDefinition {
  const nextActions = [...definition.actions];
  [nextActions[from], nextActions[to]] = [nextActions[to], nextActions[from]];
  const nextConfig = { ...(definition.stepConfig ?? {}) };
  const fromConfig = nextConfig[`action:${from}`];
  const toConfig = nextConfig[`action:${to}`];
  if (toConfig) nextConfig[`action:${from}`] = toConfig;
  else delete nextConfig[`action:${from}`];
  if (fromConfig) nextConfig[`action:${to}`] = fromConfig;
  else delete nextConfig[`action:${to}`];
  return { ...definition, actions: nextActions, stepConfig: nextConfig };
}

function removeAction(
  definition: VisualWorkflowDefinition,
  index: number,
): VisualWorkflowDefinition {
  const nextConfig: Record<string, Record<string, string>> = {};
  definition.actions.forEach((_, currentIndex) => {
    if (currentIndex === index) return;
    const config = definition.stepConfig?.[`action:${currentIndex}`];
    if (config)
      nextConfig[`action:${currentIndex > index ? currentIndex - 1 : currentIndex}`] = config;
  });
  return {
    ...definition,
    actions: definition.actions.filter((_, currentIndex) => currentIndex !== index),
    stepConfig: nextConfig,
  };
}

export type VisualWorkflowBuilderProps = Omit<ComponentPropsWithoutRef<"section">, "onChange"> & {
  value: VisualWorkflowDefinition;
  onChange: (value: VisualWorkflowDefinition) => void;
  disabled?: boolean;
};

export function VisualWorkflowBuilder({
  className,
  value,
  onChange,
  disabled = false,
  ...props
}: VisualWorkflowBuilderProps) {
  const [selectedId, setSelectedId] = React.useState("trigger");
  const [initial] = React.useState(() => graph(value, "trigger"));
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges] = useEdgesState(initial.edges);
  const fieldID = React.useId();
  const selectedActionIndex = selectedId.startsWith("action:")
    ? Number(selectedId.split(":")[1])
    : -1;
  const selectedAction = selectedActionIndex >= 0 ? value.actions[selectedActionIndex] : undefined;

  React.useEffect(() => {
    const next = graph(value, selectedId);
    setNodes((current) =>
      next.nodes.map((node) => ({
        ...node,
        position: current.find((item) => item.id === node.id)?.position ?? node.position,
      })),
    );
    setEdges(next.edges);
  }, [selectedId, setEdges, setNodes, value]);

  const setStepConfig = (key: string, nextValue: string) => {
    if (selectedActionIndex < 0) return;
    onChange({
      ...value,
      stepConfig: {
        ...(value.stepConfig ?? {}),
        [`action:${selectedActionIndex}`]: {
          ...actionConfig(value, selectedActionIndex, value.actions[selectedActionIndex]),
          [key]: nextValue,
        },
      },
    });
  };

  const addAction = () => {
    const nextIndex = value.actions.length;
    const kind: WorkflowActionKind = "draft-email";
    onChange({
      ...value,
      actions: [...value.actions, kind],
      stepConfig: {
        ...(value.stepConfig ?? {}),
        [`action:${nextIndex}`]: actionConfig(value, nextIndex, kind),
      },
    });
    setSelectedId(`action:${nextIndex}`);
  };

  return (
    <section
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(440px,1fr)_auto] overflow-y-auto border-t border-border bg-background md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-1 md:overflow-hidden",
        className,
      )}
      data-slot="visual-workflow-builder"
      {...props}
    >
      <div className="relative min-h-[440px] overflow-hidden bg-muted/[0.035]">
        <ReactFlow
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          maxZoom={1.35}
          minZoom={0.35}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={!disabled}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onNodesChange={onNodesChange}
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={16} size={1} />
          <Controls
            className="!rounded-none !border !border-border !bg-background !shadow-none [&>button]:!rounded-none [&>button]:!border-border [&>button]:!bg-background [&>button]:!fill-foreground"
            showInteractive={false}
          />
        </ReactFlow>
        {disabled ? null : (
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
            <Button
              className="pointer-events-auto rounded-none bg-background shadow-none"
              onClick={addAction}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus /> Add step
            </Button>
          </div>
        )}
      </div>

      <aside className="min-h-0 border-t border-border bg-background md:overflow-y-auto md:border-l md:border-t-0">
        <div className="sticky top-0 z-10 flex h-11 items-center justify-between border-b border-border bg-background px-4">
          <p className="text-[12px] font-medium">Workflow</p>
          <Badge className="rounded-none text-[10px]" variant="outline">
            {selectedAction ? `Step ${selectedActionIndex + 1}` : "Trigger"}
          </Badge>
        </div>
        <div className="space-y-5 p-4">
          <div className="space-y-1.5">
            <Label className="text-[11px]" htmlFor={`${fieldID}-objective`}>
              Workflow objective
            </Label>
            <Textarea
              className="min-h-20 rounded-none text-[12px] leading-5"
              disabled={disabled}
              id={`${fieldID}-objective`}
              onChange={(event) => onChange({ ...value, objective: event.target.value })}
              placeholder="What should this workflow accomplish?"
              value={value.objective ?? ""}
            />
          </div>

          {selectedAction ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px]" htmlFor={`${fieldID}-action`}>
                  Action
                </Label>
                <Select
                  disabled={disabled}
                  onValueChange={(kind: WorkflowActionKind) => {
                    const nextActions = [...value.actions];
                    nextActions[selectedActionIndex] = kind;
                    onChange({
                      ...value,
                      actions: nextActions,
                      stepConfig: {
                        ...(value.stepConfig ?? {}),
                        [`action:${selectedActionIndex}`]: actionConfig(
                          { ...value, actions: nextActions },
                          selectedActionIndex,
                          kind,
                        ),
                      },
                    });
                  }}
                  value={selectedAction}
                >
                  <SelectTrigger
                    aria-label={workflowChoiceName("Action", actionFor(selectedAction).label)}
                    className="rounded-none text-[12px]"
                    id={`${fieldID}-action`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {actions.map((action) => (
                      <SelectItem className="rounded-none" key={action.value} value={action.value}>
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {actionFor(selectedAction).detail}
                </p>
              </div>

              {actionFor(selectedAction).fields.map((field) => {
                const current = actionConfig(value, selectedActionIndex, selectedAction)[field.key];
                return (
                  <div className="space-y-1.5" key={field.key}>
                    <Label className="text-[11px]" htmlFor={`${fieldID}-${field.key}`}>
                      {field.label}
                    </Label>
                    {field.options ? (
                      <Select
                        disabled={disabled}
                        onValueChange={(nextValue) => setStepConfig(field.key, nextValue)}
                        value={current}
                      >
                        <SelectTrigger
                          aria-label={workflowChoiceName(
                            field.label,
                            field.options.find((option) => option.value === current)?.label ??
                              current,
                          )}
                          className="rounded-none text-[12px]"
                          id={`${fieldID}-${field.key}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {field.options.map((option) => (
                            <SelectItem
                              className="rounded-none"
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="rounded-none text-[12px]"
                        disabled={disabled}
                        id={`${fieldID}-${field.key}`}
                        onChange={(event) => setStepConfig(field.key, event.target.value)}
                        placeholder={field.placeholder}
                        value={current}
                      />
                    )}
                  </div>
                );
              })}

              {selectedAction === "draft-email" || selectedAction === "schedule-meeting" ? (
                <div className="border border-border bg-muted/20 p-3">
                  <p className="text-[11px] font-medium">Approval required</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    This step pauses before anything is sent or added to a calendar.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
                <Button
                  aria-label="Move step up"
                  className="rounded-none"
                  disabled={disabled || selectedActionIndex === 0}
                  onClick={() => {
                    onChange(moveAction(value, selectedActionIndex, selectedActionIndex - 1));
                    setSelectedId(`action:${selectedActionIndex - 1}`);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowUp />
                </Button>
                <Button
                  aria-label="Move step down"
                  className="rounded-none"
                  disabled={disabled || selectedActionIndex === value.actions.length - 1}
                  onClick={() => {
                    onChange(moveAction(value, selectedActionIndex, selectedActionIndex + 1));
                    setSelectedId(`action:${selectedActionIndex + 1}`);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowDown />
                </Button>
                <Button
                  aria-label={`Remove ${actionFor(selectedAction).label}`}
                  className="rounded-none"
                  disabled={disabled || value.actions.length === 1}
                  onClick={() => {
                    onChange(removeAction(value, selectedActionIndex));
                    setSelectedId(
                      selectedActionIndex > 0 ? `action:${selectedActionIndex - 1}` : "trigger",
                    );
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Trash />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px]" htmlFor={`${fieldID}-trigger`}>
                  Start when
                </Label>
                <Select
                  disabled={disabled}
                  onValueChange={(kind: WorkflowTriggerKind) =>
                    onChange({ ...value, trigger: { kind } })
                  }
                  value={value.trigger.kind}
                >
                  <SelectTrigger
                    aria-label={workflowChoiceName("Start when", triggerFor(value.trigger.kind).label)}
                    className="rounded-none text-[12px]"
                    id={`${fieldID}-trigger`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {triggers.map((trigger) => (
                      <SelectItem
                        className="rounded-none"
                        key={trigger.value}
                        value={trigger.value}
                      >
                        {trigger.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {triggerFor(value.trigger.kind).detail}
                </p>
              </div>

              {value.trigger.kind === "schedule" ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px]" htmlFor={`${fieldID}-schedule`}>
                    How often
                  </Label>
                  <Select
                    disabled={disabled}
                    onValueChange={(cronExpr) =>
                      onChange({ ...value, trigger: { ...value.trigger, cronExpr } })
                    }
                    value={value.trigger.cronExpr || "0 9 * * 1-5"}
                  >
                    <SelectTrigger
                      aria-label={workflowChoiceName(
                        "How often",
                        scheduleChoiceLabel(
                          value.trigger.kind === "schedule" ? value.trigger.cronExpr : undefined,
                        ),
                      )}
                      className="rounded-none text-[12px]"
                      id={`${fieldID}-schedule`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {scheduleOptions.map((option) => (
                        <SelectItem
                          className="rounded-none"
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {value.trigger.kind === "communication" ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px]" htmlFor={`${fieldID}-criteria`}>
                    Matching communication
                  </Label>
                  <Textarea
                    className="min-h-24 rounded-none text-[12px] leading-5"
                    disabled={disabled}
                    id={`${fieldID}-criteria`}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        trigger: { ...value.trigger, criteria: event.target.value },
                      })
                    }
                    placeholder="For example: a customer says a deadline was missed"
                    value={value.trigger.criteria ?? ""}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
