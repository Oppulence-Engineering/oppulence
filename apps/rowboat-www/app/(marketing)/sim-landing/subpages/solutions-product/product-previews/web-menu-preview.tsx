import { Badge, Chip } from "@sim/emcn";
import {
  CaretDown as ChevronDown,
  FunnelSimple as ListFilter,
  Layout,
  Tag as TagIcon,
  TextT as TypeText,
} from "@/lib/icons";

import { cn } from "@/lib/sim/cn";

import {
  MenuPreviewHeader,
  MenuPreviewToolbar,
} from "../../../shared/menu-preview-header/menu-preview-header";
import { MenuPreviewFrame } from "../../../shared/menu-preview-frame";

interface WebMenuPreviewProps {
  layout?: "menu" | "hero" | "stage";
}

const ITEMS = [
  {
    name: "Customer reply",
    status: "Review",
    source: "2 emails",
    next: "Check the prepared draft",
  },
  {
    name: "Meeting follow-up",
    status: "Approve",
    source: "Meeting",
    next: "Review two next steps",
  },
  {
    name: "Relationship match",
    status: "Confirm",
    source: "Voice note",
    next: "Choose the right person",
  },
  { name: "Rollout schedule", status: "Waiting", source: "Email", next: "Awaiting a response" },
] as const;

const COLUMNS = [
  { name: "Needs you", icon: TypeText },
  { name: "State", icon: TagIcon },
  { name: "Source", icon: TypeText },
  { name: "Next step", icon: TypeText },
] as const;

/** Oppulence Web account list — production-style ruled table in a menu preview frame. */
export function WebMenuPreview({ layout = "menu" }: WebMenuPreviewProps) {
  return (
    <MenuPreviewFrame kind="web" layout={layout}>
      <div className="w-[620px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-body)] text-small shadow-xs">
        <MenuPreviewHeader icon={Layout} title="Today" actions="Concept preview" />
        <MenuPreviewToolbar>
          <Chip rightIcon={ChevronDown}>Your day</Chip>
          <Chip leftIcon={ListFilter}>Filter</Chip>
        </MenuPreviewToolbar>
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[100px]" />
            <col className="w-[90px]" />
            <col className="w-[250px]" />
          </colgroup>
          <thead>
            <tr className="h-[34px] border-[var(--border)] border-b">
              {COLUMNS.map(({ name, icon: Icon }) => (
                <th
                  className="border-[var(--border)] border-r px-2.5 font-normal last:border-r-0"
                  key={name}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className="size-[14px] text-[var(--text-icon)]" />
                    {name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ITEMS.map((item, index) => (
              <tr
                className={cn(
                  "h-[37px] border-[var(--border)] border-b",
                  index === 0 && "bg-[var(--surface-3)]",
                )}
                key={item.name}
              >
                <td className="border-[var(--border)] border-r px-2.5 font-medium text-[var(--text-primary)]">
                  {item.name}
                </td>
                <td className="border-[var(--border)] border-r px-2.5">
                  <Badge>{item.status}</Badge>
                </td>
                <td className="border-[var(--border)] border-r px-2.5 tabular-nums">
                  {item.source}
                </td>
                <td className="px-2.5 text-[var(--text-secondary)]">{item.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MenuPreviewFrame>
  );
}
