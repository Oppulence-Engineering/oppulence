"use client";

import "client-only";

import * as React from "react";
import type { Value } from "platejs";
import { Plate, PlateContent, createPlatePlugin, usePlateEditor } from "platejs/react";
import {
  ArrowsOut,
  ArrowClockwise,
  BookmarkSimple,
  CalendarBlank,
  CaretDown,
  DotsThree,
  Funnel,
  GridFour,
  Link,
  List,
  MagnifyingGlass,
  Minus,
  Note,
  NotePencil,
  Plus,
  Quotes,
  SlidersHorizontal,
  TextB,
  TextHTwo,
  TextItalic,
  TextUnderline,
  Trash,
  User,
  X,
} from "@/lib/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/components/auth/auth-gate";
import { useWorkspaceLabel } from "@/components/features/dashboard/app-shell/app-shell";
import { useConsoleResources } from "@/hooks/queries/use-console";
import {
  consoleResourcePageHasMore,
  consoleResourceRows,
  fetchConsoleResources,
} from "@/hooks/queries/utils/fetch-console";
import { useRevenueActions } from "@/hooks/queries/use-revenue-actions";
import {
  ACTION_QUEUE_PAGE,
  actionPageHasMore,
  actionRows,
  fetchRevenueActions,
} from "@/hooks/queries/utils/fetch-revenue-actions";
import { usePersons, useRelationships } from "@/hooks/queries/use-relationships";
import { relationshipRows } from "@/hooks/queries/utils/fetch-relationships";
import {
  fetchPersons,
  personPageHasMore,
  personRows,
} from "@/hooks/queries/utils/fetch-relationships";
import { useWorkspaceNotes } from "@/hooks/queries/use-workspace";
import {
  fetchMoreWorkspaceNotes,
  type NoteTimelineCursor,
} from "@/hooks/queries/utils/fetch-workspace-notes";
import { consoleKeys } from "@/hooks/queries/utils/console-keys";
import { relationshipKeys } from "@/hooks/queries/utils/relationship-keys";
import { revenueActionKeys } from "@/hooks/queries/utils/revenue-action-keys";
import { workspaceKeys } from "@/hooks/queries/utils/workspace-keys";

import {
  EmptyBlock,
  errMessage,
  ListSkeleton,
  WorkspaceEmptyState,
} from "@/components/features/revenue/shared/shared";
import { Avatar, AvatarFallback } from "@oppulence/ui/components/avatar";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@oppulence/ui/components/card";
import { Checkbox } from "@oppulence/ui/components/checkbox";
import { Label } from "@oppulence/ui/components/label";
import { Spinner } from "@oppulence/ui/components/spinner";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@oppulence/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@oppulence/ui/components/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@oppulence/ui/components/dialog";
import { Input } from "@oppulence/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import { Textarea } from "@oppulence/ui/components/textarea";
import { cn } from "@oppulence/ui/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@oppulence/ui/components/sheet";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import { noteIdFromHash, workspaceNoteHref } from "@/lib/revenue/note-link";
import { removePersonConfirmCopy } from "@/lib/revenue/source-product-copy";
import {
  companyName,
  personCompanyTitle,
  groupWorkspaceNotes,
  isWorkspaceTask,
  mergeWorkspaceNotes,
  plateText,
  taskIsDueToday,
  taskIsOverdue,
  type WorkspaceNote,
} from "@/lib/revenue/revenue-records";
import {
  createConsoleResource,
  deleteConsoleResource,
  patchConsoleResource,
} from "@/lib/console/console";
import {
  noteFavorites,
  noteTemplates,
  type NoteFavoriteResource,
  type NoteTemplateResource,
} from "@/lib/console/console-resources";
import {
  createRelationship,
  deletePerson,
  dismissAction,
  explainedRevenueError,
  getPersonAttributes,
  ingestRelationshipObservations,
  relativeTime,
  safeResearchCitationURL,
  webAddressHref,
} from "@/lib/revenue/revenue";
import type {
  RelationshipPerson,
  RelationshipPersonAttribute,
  RevenueAction,
  RevenueRelationship,
} from "@/lib/revenue/types";
import { TaskCreateDialog } from "@/components/features/revenue/task-create-dialog/task-create-dialog";
import { openCompanyCreate } from "@/lib/dashboard/company-create-request";

type ViewProps = {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

/** Notes are written by the signed-in account. The mark matches the sidebar label, not a hardcoded "Y". */
function useNoteAuthor() {
  const session = useAuthSession();
  const label = useWorkspaceLabel({
    name: session.user.email || session.user.workosUserId || "You",
    email: session.user.email || "",
  });
  return { label, mark: initials(label) };
}

const notePlugins = [
  createPlatePlugin({ key: "bold", node: { isLeaf: true }, render: { as: "strong" } }),
  createPlatePlugin({ key: "italic", node: { isLeaf: true }, render: { as: "em" } }),
  createPlatePlugin({ key: "underline", node: { isLeaf: true }, render: { as: "u" } }),
  createPlatePlugin({ key: "h2", node: { isElement: true, type: "h2" }, render: { as: "h2" } }),
  createPlatePlugin({
    key: "blockquote",
    node: { isElement: true, type: "blockquote" },
    render: { as: "blockquote" },
  }),
];

function SearchBar({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-[220px] max-w-sm flex-1">
      <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-primary/35" />
      <Input
        aria-label={label}
        className="h-8 border-border bg-background pl-8 text-[13px]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        value={value}
      />
    </div>
  );
}

function RecordHeader({
  icon,
  label,
  count,
  action,
  filtered = false,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  count: number | string;
  action: React.ReactNode;
  filtered?: boolean;
  onClear?: () => void;
}) {
  const summary = (
    <>
      {icon} {label}{" "}
      <Badge className="font-normal text-primary/40" variant="secondary">
        {count}
      </Badge>
    </>
  );
  return (
    <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
      {filtered && onClear ? (
        <Button
          aria-label="Clear people filters"
          className="h-8 gap-2 rounded-none border border-border bg-background px-3 text-[13px] font-medium text-primary hover:bg-background-100"
          onClick={onClear}
          type="button"
          variant="ghost"
        >
          {summary}
        </Button>
      ) : (
        <Badge
          className="h-8 gap-2 border border-border bg-background px-3 text-[13px] font-medium text-primary"
          variant="outline"
        >
          {summary}
        </Badge>
      )}
      {action}
    </div>
  );
}

/**
 * The people list is every active person, newest interaction first, including
 * people who have never been contacted. "Recently contacted" described a
 * filter the API does not apply. A search should say the list is filtered,
 * and that control clears the query.
 */
export function personDirectoryTitle(query: string): { label: string; filtered: boolean } {
  const filtered = query.trim().length > 0;
  return { label: filtered ? "Filtered" : "All people", filtered };
}

export function personDirectoryCount(shown: number, hasMore: boolean): string {
  return hasMore ? `${shown}+` : String(shown);
}

export function personRemainderLabel(): string {
  return "Show the next people";
}

/** A search with no hits is not an empty workspace. */
export function peopleListEmptyCopy(filtered: boolean): string {
  if (filtered) return "No people match this search.";
  return "Connect Gmail or add a person to keep a contact for each company.";
}

/**
 * Enrichment is the count of verified profile fields. Location already has
 * its own column; using it as a fallback made a known city look enriched.
 */
const ENRICHMENT_FIELDS = [
  "title",
  "seniority",
  "orgName",
  "orgDomain",
  "location",
  "linkedinUrl",
  "department",
  "timezone",
  "locale",
] as const;

/**
 * Count profile facts the directory can already see. attributesVersion is only
 * the projection counter: adding a name bumps it to 1 and writes a display
 * name plus an alias, which is not enrichment.
 */
export function personEnrichmentLabel(
  person: Pick<RelationshipPerson, (typeof ENRICHMENT_FIELDS)[number] | "employmentStatus">,
): string {
  const verified =
    ENRICHMENT_FIELDS.filter((field) => person[field]?.trim()).length +
    (person.employmentStatus && person.employmentStatus !== "unknown" ? 1 : 0);
  if (verified === 0) return "Not filled in";
  return `${verified} ${verified === 1 ? "detail" : "details"} filled in`;
}

/** The directory already says "No email" when the address is missing. */
export function personSheetSubtitle(person: Pick<RelationshipPerson, "primaryEmail">): string {
  return person.primaryEmail?.trim() || "No email";
}

/**
 * The people list opens a saved LinkedIn page. The sheet has to do the same,
 * and it must not print an address that is not a web link.
 */
export function personSheetDetail(
  label: string,
  value: string | undefined,
): { text: string; href?: string } {
  if (label === "LinkedIn") {
    const href = webAddressHref(value);
    if (href) return { text: "View profile", href };
    return { text: "Not known" };
  }
  if (label === "Domain") {
    const trimmed = value?.trim() ?? "";
    const href = webAddressHref(trimmed);
    if (href) return { text: trimmed, href };
  }
  const text = value?.trim() ?? "";
  return { text: text || "Not known" };
}

/**
 * Creating a person writes display_name and alias so the directory can find
 * them. Those rows are the name the user typed, not enrichment evidence.
 */
const IDENTITY_ATTRIBUTE_DIMENSIONS = new Set(["display_name", "alias"]);

export function enrichmentEvidence<T extends { dimension: string; status: string }>(
  attributes: readonly T[],
): T[] {
  return attributes.filter(
    (attribute) =>
      attribute.status === "active" && !IDENTITY_ATTRIBUTE_DIMENSIONS.has(attribute.dimension),
  );
}

const EVIDENCE_EXTRACTOR_LABELS: Record<string, string> = {
  email_signature: "From their email signature",
  email_header: "From an email header",
  calendar_invite: "From a calendar invite",
  transcript_intro: "From a transcript",
  crm_field: "From the CRM",
  user_entry: "Added by you",
  display_name_header: "From the name on the record",
  mail_delivery_report: "Their mail server reported this",
  parallel: "From public web research",
};

const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  calendar: "Calendar",
  slack: "Slack",
  hubspot: "HubSpot",
  meeting: "A meeting",
  desktop_note: "A note",
  voice_note: "A voice note",
  browser: "The browser",
  crm: "The CRM",
  user: "Added by you",
  web: "The web",
};

/**
 * Prefer the extractor phrase. A fact the user typed still says so, even when
 * the directory stored it with an email-header extractor.
 */
export function personEvidenceProvenance(
  attribute: Pick<RelationshipPersonAttribute, "extractor" | "source">,
): string {
  if (attribute.source === "user") return "Added by you";
  const extractor = EVIDENCE_EXTRACTOR_LABELS[attribute.extractor];
  if (extractor) return extractor;
  return EVIDENCE_SOURCE_LABELS[attribute.source] ?? "Recorded in this workspace";
}

/** Stored person facts use dimension tokens. The sheet names the fact. */
export function personEvidenceLabel(dimension: string): string {
  const labels: Record<string, string> = {
    display_name: "Name",
    alias: "Also known as",
    title: "Title",
    org_name: "Company",
    org_domain: "Company domain",
    phone: "Phone",
    timezone: "Time zone",
    locale: "Locale",
    seniority: "Seniority",
    location: "Location",
    linkedin_url: "LinkedIn",
    department: "Department",
    employment_status: "Employment",
  };
  const known = labels[dimension];
  if (known) return known;
  const words = dimension.replaceAll("_", " ").trim();
  if (!words) return "Detail";
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const SENIORITY_LABELS: Record<string, string> = {
  ic: "Individual contributor",
  manager: "Manager",
  director: "Director",
  vp: "VP",
  executive: "Executive",
  founder: "Founder",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  active: "Current",
  departed: "Left the company",
  unknown: "Not known",
};

function titledToken(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Research stores a seniority band. The directory says the band in words. */
export function personSeniorityLabel(value?: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const known = SENIORITY_LABELS[trimmed];
  if (known) return known;
  if (/^[a-z0-9_]+$/.test(trimmed)) return titledToken(trimmed);
  return trimmed;
}

/**
 * Free-text facts stay as written. Seniority and employment are closed sets,
 * and those tokens are what a reader would otherwise see.
 */
export function personFactValue(dimension: string, value: string): string {
  const trimmed = value.trim();
  if (dimension === "seniority") return personSeniorityLabel(trimmed) || value;
  if (dimension === "employment_status") {
    const known = EMPLOYMENT_LABELS[trimmed];
    if (known) return known;
    if (/^[a-z0-9_]+$/.test(trimmed)) return titledToken(trimmed);
  }
  return value;
}

export function PeopleView({ onError, onNotice }: ViewProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [selected, setSelected] = React.useState<RelationshipPerson | null>(null);
  const [attributes, setAttributes] = React.useState<RelationshipPersonAttribute[]>([]);
  const [removing, setRemoving] = React.useState(false);
  const peopleQuery = usePersons(debouncedQuery);
  const [extraPeople, setExtraPeople] = React.useState<RelationshipPerson[]>([]);
  const [laterPeopleHasMore, setLaterPeopleHasMore] = React.useState<boolean | null>(null);
  const [loadingMorePeople, setLoadingMorePeople] = React.useState(false);
  const peoplePage = personRows(peopleQuery.data);
  const people = React.useMemo(() => {
    if (extraPeople.length === 0) return peoplePage;
    const seen = new Set(peoplePage.map((person) => person.id));
    return [
      ...peoplePage,
      ...extraPeople.filter((person) => {
        if (seen.has(person.id)) return false;
        seen.add(person.id);
        return true;
      }),
    ];
  }, [extraPeople, peoplePage]);
  const hasMorePeople =
    laterPeopleHasMore ?? (peoplePage.length > 0 && personPageHasMore(peopleQuery.data));
  const loading = peopleQuery.isPending;
  React.useEffect(() => {
    setExtraPeople([]);
    setLaterPeopleHasMore(null);
  }, [debouncedQuery]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (peopleQuery.error) {
      onError(errMessage(peopleQuery.error, "Could not load people."));
    }
  }, [onError, peopleQuery.error]);

  const load = React.useCallback(async () => {
    setExtraPeople([]);
    setLaterPeopleHasMore(null);
    await queryClient.invalidateQueries({ queryKey: relationshipKeys.all });
  }, [queryClient]);
  const loadMorePeople = React.useCallback(async () => {
    if (loadingMorePeople || !hasMorePeople) return;
    setLoadingMorePeople(true);
    try {
      const next = await fetchPersons(
        debouncedQuery,
        undefined,
        peoplePage.length + extraPeople.length,
      );
      setLaterPeopleHasMore(personPageHasMore(next));
      setExtraPeople((current) => [...current, ...personRows(next)]);
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next people."));
    } finally {
      setLoadingMorePeople(false);
    }
  }, [debouncedQuery, extraPeople.length, hasMorePeople, loadingMorePeople, onError, peoplePage.length]);

  const openPerson = async (person: RelationshipPerson) => {
    setSelected(person);
    setAttributes([]);
    try {
      setAttributes(await getPersonAttributes(person.id));
    } catch (error) {
      onError(errMessage(error, "Could not load this profile."));
    }
  };

  const removeSelectedPerson = async () => {
    if (!selected) return;
    setRemoving(true);
    try {
      await deletePerson(selected.id);
      setSelected(null);
      onNotice("Person removed.");
      await load();
    } catch (error) {
      onError(errMessage(error, "Could not remove this person."));
    } finally {
      setRemoving(false);
    }
  };

  const directoryTitle = personDirectoryTitle(query);
  return (
    <div className="flex min-h-full flex-col" data-slot="people-view">
      <RecordHeader
        icon={<User />}
        label={directoryTitle.label}
        count={personDirectoryCount(people.length, hasMorePeople)}
        filtered={directoryTitle.filtered}
        onClear={() => {
          setQuery("");
          setDebouncedQuery("");
        }}
        action={
          <Button
            className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
            size="sm"
            onClick={() => setCreating(true)}
          >
            <Plus /> New person
          </Button>
        }
      />
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <SearchBar label="Search people" value={query} onChange={setQuery} />
        <Label className="text-[12px] font-normal text-primary/45">
          Sorted by last interaction
        </Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => void load()}
          disabled={loading}
        >
          <ArrowClockwise className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {loading ? (
        <div className="p-4">
          <ListSkeleton />
        </div>
      ) : people.length === 0 ? (
        <EmptyBlock
          body={peopleListEmptyCopy(directoryTitle.filtered)}
          image="people"
          learnMore={
            directoryTitle.filtered
              ? []
              : [{ label: "See who you are talking to" }, { label: "Fill in their role and company" }]
          }
          title="People"
        >
          {directoryTitle.filtered ? (
            <Button
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear search
            </Button>
          ) : (
            <Button
              className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
              onClick={() => setCreating(true)}
              size="sm"
            >
              <Plus /> New person
            </Button>
          )}
        </EmptyBlock>
      ) : (
        <div className="min-w-0 flex-1 overflow-auto">
          <table
            className="w-full min-w-[1180px] table-fixed border-collapse text-left"
            aria-label="People"
          >
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-border">
              <TableRow className="h-10 border-b text-[12px] font-medium text-primary/55 hover:bg-transparent">
                <TableHead className="h-10 w-[250px] border-r px-3">Person</TableHead>
                <TableHead className="h-10 w-[210px] border-r px-3">Company</TableHead>
                <TableHead className="h-10 w-36 border-r px-3">Role</TableHead>
                <TableHead className="h-10 w-36 border-r px-3">Department</TableHead>
                <TableHead className="h-10 w-40 border-r px-3">Location</TableHead>
                <TableHead className="h-10 w-36 border-r px-3">Last interaction</TableHead>
                <TableHead className="h-10 w-28 border-r px-3 text-center">Companies</TableHead>
                <TableHead className="h-10 w-28 border-r px-3">LinkedIn</TableHead>
                <TableHead className="h-10 px-3">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.id} className="h-11 border-border hover:bg-background-100/70">
                  <TableCell className="border-r px-3">
                    <Button
                      aria-label={`Open ${person.displayName}`}
                      className="flex h-auto w-full items-center justify-start gap-2 px-0 py-0 text-left font-normal hover:bg-transparent"
                      type="button"
                      variant="ghost"
                      onClick={() => void openPerson(person)}
                    >
                      <Avatar className="size-6 rounded-none" size="sm">
                        <AvatarFallback className="rounded-none border border-border bg-background-100 text-[10px] font-semibold text-primary/60">
                          {initials(person.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Label className="block truncate text-[13px] font-medium text-primary">
                          {person.displayName}
                        </Label>
                        <CardDescription className="block truncate text-[11px]">
                          {person.primaryEmail || "No email"}
                        </CardDescription>
                      </div>
                    </Button>
                  </TableCell>
                  <TableCell className="truncate border-r px-3 text-[12px] text-primary/60">
                    {personCompanyTitle(person) || "—"}
                  </TableCell>
                  <TableCell className="truncate border-r px-3 text-[12px] text-primary/60">
                    {person.title || personSeniorityLabel(person.seniority) || "—"}
                  </TableCell>
                  <TableCell className="truncate border-r px-3 text-[12px] text-primary/60">
                    {person.department || "—"}
                  </TableCell>
                  <TableCell className="truncate border-r px-3 text-[12px] text-primary/60">
                    {person.location || "—"}
                  </TableCell>
                  <TableCell className="border-r px-3 text-[12px] text-primary/50">
                    {person.lastInteractionAt ? relativeTime(person.lastInteractionAt) : "—"}
                  </TableCell>
                  <TableCell className="border-r px-3 text-center text-[12px] text-primary/60">
                    {person.relationshipCount}
                  </TableCell>
                  <TableCell className="truncate border-r px-3 text-[12px]">
                    {webAddressHref(person.linkedinUrl) ? (
                      <a
                        className="text-primary/60 underline-offset-2 hover:text-primary hover:underline"
                        href={webAddressHref(person.linkedinUrl) ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View profile
                      </a>
                    ) : (
                      <Badge className="font-normal text-primary/35" variant="ghost">
                        —
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="truncate px-3 text-[12px] text-primary/50">
                    {personEnrichmentLabel(person)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
          {hasMorePeople ? (
            <Button
              className="m-3"
              disabled={loadingMorePeople}
              onClick={() => void loadMorePeople()}
              size="sm"
              type="button"
              variant="outline"
            >
              {personRemainderLabel()}
            </Button>
          ) : null}
        </div>
      )}
      {creating ? (
        <CreatePersonDialog
          onClose={() => setCreating(false)}
          onError={onError}
          onCreated={() => {
            setCreating(false);
            onNotice("Person added.");
            void load();
          }}
        />
      ) : null}
      {selected ? (
        <PersonSheet
          attributes={attributes}
          onClose={() => setSelected(null)}
          onRemove={() => void removeSelectedPerson()}
          person={selected}
          removing={removing}
        />
      ) : null}
    </div>
  );
}

/** The domain half of an address, after a copied mailto link or "Name <addr>" wrapper. */
export function personAccountDomain(email: string): string | undefined {
  let value = email.trim().replace(/^mailto:/i, "");
  const wrapped = value.match(/<([^<>]+)>/);
  if (wrapped?.[1]) value = wrapped[1].trim().replace(/^mailto:/i, "");
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return undefined;
  const domain = value
    .slice(at + 1)
    .trim()
    .replace(/\.+$/, "")
    .toLowerCase();
  if (!domain || /[\s<>]/.test(domain)) return undefined;
  return domain;
}

function CreatePersonDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const relationship = await createRelationship({
        kind: "person",
        displayName: name.trim(),
        primaryEmail: email.trim() || undefined,
        accountDomain: personAccountDomain(email),
      });
      const now = new Date().toISOString();
      await ingestRelationshipObservations([
        {
          relationshipId: relationship.id,
          source: "user",
          externalId: crypto.randomUUID(),
          eventType: "person_added",
          occurredAt: now,
          summary: `${name.trim()} added by the user`,
          normalizedFacts: {},
          participants: [
            { displayName: name.trim(), email: email.trim() || undefined, role: "contact" },
          ],
        },
      ]);
      onCreated();
    } catch (error) {
      onError(errMessage(error, "Could not create the person."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New person</DialogTitle>
          <DialogDescription>
            Add someone you work with. Mail and meetings can fill in the rest later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            aria-label="Full name"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label="Email address"
            type="email"
            placeholder="Email address (optional)"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy ? <Spinner className="size-4" /> : <Plus />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonSheet({
  person,
  attributes,
  onClose,
  onRemove,
  removing,
}: {
  person: RelationshipPerson;
  attributes: RelationshipPersonAttribute[];
  onClose: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  React.useEffect(() => {
    setConfirmingRemove(false);
  }, [person.id]);
  const evidence = enrichmentEvidence(attributes);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{person.displayName}</SheetTitle>
          <SheetDescription>{personSheetSubtitle(person)}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-4">
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
            {[
              ["Company", personCompanyTitle(person) || undefined],
              ["Domain", person.orgDomain],
              ["Role", person.title],
              ["Seniority", personSeniorityLabel(person.seniority)],
              ["Department", person.department],
              ["Location", person.location],
              ["LinkedIn", person.linkedinUrl],
              ["Timezone", person.timezone],
              [
                "Last interaction",
                person.lastInteractionAt ? relativeTime(person.lastInteractionAt) : undefined,
              ],
            ].map(([label, value]) => {
              const detail = personSheetDetail(label, value);
              return (
                <React.Fragment key={label}>
                  <dt className="text-primary/40">{label}</dt>
                  <dd className="text-primary/75">
                    {detail.href ? (
                      <a
                        className="underline-offset-2 hover:underline"
                        href={detail.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {detail.text}
                      </a>
                    ) : (
                      detail.text
                    )}
                  </dd>
                </React.Fragment>
              );
            })}
          </dl>
          <div className="mt-6 border-t border-border pt-4">
            {confirmingRemove ? (
              <div className="space-y-3">
                <p className="text-sm text-primary/70">
                  {removePersonConfirmCopy(person.displayName)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={removing}
                    onClick={onRemove}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {removing ? <Spinner className="size-4" /> : null} Confirm remove
                  </Button>
                  <Button
                    disabled={removing}
                    onClick={() => setConfirmingRemove(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                disabled={removing}
                onClick={() => setConfirmingRemove(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Remove
              </Button>
            )}
          </div>
          <h3 className="mt-8 border-b border-border pb-2 text-xs font-medium uppercase tracking-wide text-primary/45">
            Where details came from
          </h3>
          {evidence.length === 0 ? (
            <p className="py-4 text-sm text-primary/45">No extra details yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {evidence.map((attribute) => (
                <li className="py-3" key={attribute.id}>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium text-primary">
                      {personEvidenceLabel(attribute.dimension)}
                    </Label>
                    <Badge className="rounded-none font-normal text-primary/40" variant="outline">
                      {Math.round(attribute.confidence * 100)}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-primary/65">
                    {personFactValue(attribute.dimension, attribute.value)}
                  </p>
                  <p className="mt-1 text-[11px] text-primary/40">
                    {personEvidenceProvenance(attribute)} · {relativeTime(attribute.observedAt)}
                  </p>
                  {(attribute.citations ?? [])
                    .map((citation) => safeResearchCitationURL(citation.url))
                    .filter((url): url is string => Boolean(url))
                    .map((url, index) => (
                      <a
                        className="mr-3 mt-1 inline-block text-[11px] text-primary/55 underline-offset-2 hover:underline"
                        href={url}
                        key={url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Verify source {index + 1}
                      </a>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const plateValue = (note?: WorkspaceNote): Value => {
  if (Array.isArray(note?.content)) return note.content as Value;
  return [{ type: "p", children: [{ text: note?.body || "" }] }];
};

const todayValue = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function noteCountLabel(shown: number, hasMore: boolean): string {
  return hasMore ? `${shown}+` : String(shown);
}

export function earlierNotesLabel(): string {
  return "Show earlier notes";
}

/** A copied link walks this many earlier pages before asking the reader to continue. */
export const NOTE_LINK_SEEK_PAGES = 8;

export function templateCountLabel(shown: number, hasMore: boolean): string {
  return hasMore ? `${shown}+` : String(shown);
}

export function nextTemplatesLabel(): string {
  return "Show the next templates";
}

export function nextFavoritesLabel(): string {
  return "Show the next favorites";
}

export function NotesView({
  onError,
  onNotice,
  onOpenCompanies,
  onOpenCompany,
}: ViewProps & { onOpenCompanies?: () => void; onOpenCompany?: (relationshipId: string) => void }) {
  const queryClient = useQueryClient();
  const author = useNoteAuthor();
  const notesQuery = useWorkspaceNotes();
  const notesPage = notesQuery.data;
  const [extraNotes, setExtraNotes] = React.useState<WorkspaceNote[]>([]);
  const [extraRelationships, setExtraRelationships] = React.useState<RevenueRelationship[]>([]);
  const [timelineCursors, setTimelineCursors] = React.useState<NoteTimelineCursor[]>([]);
  const [nextRelationshipOffset, setNextRelationshipOffset] = React.useState<number | undefined>();
  const [moreNotes, setMoreNotes] = React.useState(false);
  const [loadingMoreNotes, setLoadingMoreNotes] = React.useState(false);
  const primedNotes = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!notesQuery.isSuccess || !notesPage) return;
    if (primedNotes.current === notesQuery.dataUpdatedAt) return;
    primedNotes.current = notesQuery.dataUpdatedAt;
    setExtraNotes([]);
    setExtraRelationships([]);
    setTimelineCursors(notesPage.timelineCursors ?? []);
    setNextRelationshipOffset(notesPage.nextRelationshipOffset);
    setMoreNotes(Boolean(notesPage.hasMoreNotes));
  }, [notesPage, notesQuery.dataUpdatedAt, notesQuery.isSuccess]);
  const notes = mergeWorkspaceNotes(notesPage?.notes ?? [], extraNotes);
  const relationships = React.useMemo(() => {
    const seen = new Set((notesPage?.relationships ?? []).map((relationship) => relationship.id));
    return [
      ...(notesPage?.relationships ?? []),
      ...extraRelationships.filter((relationship) => {
        if (seen.has(relationship.id)) return false;
        seen.add(relationship.id);
        return true;
      }),
    ];
  }, [extraRelationships, notesPage?.relationships]);
  const hasMoreNotes = primedNotes.current === null ? Boolean(notesPage?.hasMoreNotes) : moreNotes;
  const loading = notesQuery.isPending;
  const [editing, setEditing] = React.useState<
    WorkspaceNote | { template?: NoteTemplateResource } | null
  >(null);
  const [editingTemplate, setEditingTemplate] = React.useState<NoteTemplateResource | "new" | null>(
    null,
  );
  const [tab, setTab] = React.useState<"notes" | "templates">("notes");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");
  const [newestFirst, setNewestFirst] = React.useState(true);
  const [showFavorites, setShowFavorites] = React.useState(true);
  const templatesQuery = useConsoleResources("note_template", noteTemplates);
  const favoritesQuery = useConsoleResources("note_favorite", noteFavorites);
  const [extraTemplates, setExtraTemplates] = React.useState<NoteTemplateResource[]>([]);
  const [laterTemplateHasMore, setLaterTemplateHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreTemplates, setLoadingMoreTemplates] = React.useState(false);
  const [extraFavorites, setExtraFavorites] = React.useState<NoteFavoriteResource[]>([]);
  const [laterFavoriteHasMore, setLaterFavoriteHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreFavorites, setLoadingMoreFavorites] = React.useState(false);
  React.useEffect(() => {
    setExtraTemplates([]);
    setLaterTemplateHasMore(null);
  }, [templatesQuery.dataUpdatedAt]);
  React.useEffect(() => {
    setExtraFavorites([]);
    setLaterFavoriteHasMore(null);
  }, [favoritesQuery.dataUpdatedAt]);
  const templatePage = templatesQuery.data?.items ?? [];
  const templates = React.useMemo(() => {
    const seen = new Set(templatePage.map((template) => template.id));
    return [...templatePage, ...extraTemplates.filter((template) => !seen.has(template.id))];
  }, [extraTemplates, templatePage]);
  const hasMoreTemplates = laterTemplateHasMore ?? Boolean(templatesQuery.data?.hasMore);
  const favoritePage = favoritesQuery.data?.items ?? [];
  const favoriteResources = React.useMemo(() => {
    const seen = new Set(favoritePage.map((favorite) => favorite.id));
    return [...favoritePage, ...extraFavorites.filter((favorite) => !seen.has(favorite.id))];
  }, [extraFavorites, favoritePage]);
  const hasMoreFavorites = laterFavoriteHasMore ?? Boolean(favoritesQuery.data?.hasMore);
  const favoriteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const existing = favoriteResources.find((favorite) => favorite.payload.noteId === noteId);
      if (existing) return deleteConsoleResource(existing.id);
      return createConsoleResource({ kind: "note_favorite", payload: { noteId } });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: consoleKeys.resourceKind("note_favorite") }),
    onError: (error) => onError(errMessage(error, "Could not update the favorite.")),
  });
  const loadMoreTemplates = async () => {
    if (loadingMoreTemplates || !hasMoreTemplates) return;
    setLoadingMoreTemplates(true);
    try {
      const page = await fetchConsoleResources(
        "note_template",
        undefined,
        templatePage.length + extraTemplates.length,
      );
      setLaterTemplateHasMore(consoleResourcePageHasMore(page));
      setExtraTemplates((current) => [...current, ...noteTemplates(consoleResourceRows(page))]);
    } catch (error) {
      onError(explainedRevenueError(error, "Could not load more templates."));
    } finally {
      setLoadingMoreTemplates(false);
    }
  };
  const loadMoreFavorites = async () => {
    if (loadingMoreFavorites || !hasMoreFavorites) return;
    setLoadingMoreFavorites(true);
    try {
      const page = await fetchConsoleResources(
        "note_favorite",
        undefined,
        favoritePage.length + extraFavorites.length,
      );
      setLaterFavoriteHasMore(consoleResourcePageHasMore(page));
      setExtraFavorites((current) => [...current, ...noteFavorites(consoleResourceRows(page))]);
    } catch (error) {
      onError(explainedRevenueError(error, "Could not load more favorites."));
    } finally {
      setLoadingMoreFavorites(false);
    }
  };
  const load = React.useCallback(async () => {
    primedNotes.current = null;
    await queryClient.invalidateQueries({ queryKey: workspaceKeys.notes() });
  }, [queryClient]);
  const loadEarlierNotes = React.useCallback(async () => {
    if (loadingMoreNotes || !hasMoreNotes) return;
    setLoadingMoreNotes(true);
    try {
      const next = await fetchMoreWorkspaceNotes({
        relationships,
        timelineCursors,
        nextRelationshipOffset,
      });
      setExtraNotes((current) => mergeWorkspaceNotes(current, next.notes));
      setExtraRelationships((current) => [...current, ...next.relationships]);
      setTimelineCursors(next.timelineCursors);
      setNextRelationshipOffset(next.nextRelationshipOffset);
      setMoreNotes(next.hasMoreNotes);
      if (next.failedTimelineCount > 0) {
        onNotice(
          `Loaded available notes, but ${String(next.failedTimelineCount)} company timeline${next.failedTimelineCount === 1 ? "" : "s"} could not be read.`,
        );
      }
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load earlier notes."));
    } finally {
      setLoadingMoreNotes(false);
    }
  }, [
    hasMoreNotes,
    loadingMoreNotes,
    nextRelationshipOffset,
    onError,
    onNotice,
    relationships,
    timelineCursors,
  ]);

  React.useEffect(() => {
    if (notesQuery.error) {
      onError(errMessage(notesQuery.error, "Could not load notes."));
    }
  }, [notesQuery.error, onError]);

  React.useEffect(() => {
    const failed = notesQuery.data?.failedTimelineCount ?? 0;
    if (failed > 0) {
      onNotice(
        `Loaded available notes, but ${String(failed)} company timeline${failed === 1 ? "" : "s"} could not be read.`,
      );
    }
  }, [notesQuery.data?.failedTimelineCount, onNotice]);
  const visible = [...notes].sort((left, right) =>
    newestFirst
      ? right.occurredAt.localeCompare(left.occurredAt)
      : left.occurredAt.localeCompare(right.occurredAt),
  );
  const noteGroups = groupWorkspaceNotes(visible, new Date(), newestFirst);
  const openedNoteHash = React.useRef<string | null>(null);
  const noteSeekPages = React.useRef(0);
  const noteSeekPaused = React.useRef<string | null>(null);
  const noteSeeking = React.useRef(false);
  // The hash is read after paint so SSR and the first client render agree.
  // Remembering the id we already opened keeps a refetch from reopening a
  // note the reader just closed. A note that is only on a later page is not
  // gone: walk those pages, and say it is gone only when they run out.
  React.useEffect(() => {
    if (loading) return;
    const openLinkedNote = () => {
      const noteId = noteIdFromHash(window.location.hash);
      if (!noteId || openedNoteHash.current === noteId) return;
      const note = notes.find((item) => item.externalId === noteId);
      if (note) {
        openedNoteHash.current = noteId;
        noteSeekPaused.current = null;
        noteSeekPages.current = 0;
        setEditing(note);
        return;
      }
      if (noteSeeking.current || loadingMoreNotes) return;
      if (hasMoreNotes && noteSeekPaused.current !== noteId) {
        if (noteSeekPages.current >= NOTE_LINK_SEEK_PAGES) {
          noteSeekPaused.current = noteId;
          onNotice("That note is further back than the notes already open.");
          return;
        }
        noteSeeking.current = true;
        noteSeekPages.current += 1;
        void loadEarlierNotes().finally(() => {
          noteSeeking.current = false;
        });
        return;
      }
      if (hasMoreNotes) return;
      openedNoteHash.current = noteId;
      onNotice("That note is no longer in this workspace.");
    };
    openLinkedNote();
    const onHashChange = () => {
      openedNoteHash.current = null;
      noteSeekPaused.current = null;
      noteSeekPages.current = 0;
      openLinkedNote();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [hasMoreNotes, loadEarlierNotes, loading, loadingMoreNotes, notes, onNotice]);
  const favoriteIds = new Set(favoriteResources.map((item) => item.payload.noteId));
  const favoriteNotes = visible.filter((note) => favoriteIds.has(note.externalId));
  return (
    <div className="flex min-h-full flex-col bg-background" data-slot="notes-view">
      <Tabs
        className="shrink-0 gap-0"
        onValueChange={(value) => setTab(value as "notes" | "templates")}
        value={tab}
      >
        <TabsList
          aria-label="Notes and templates"
          className="h-11 w-full justify-start rounded-none border-b border-border bg-transparent px-3"
        >
          <TabsTrigger
            className="h-9 rounded-none border px-3 text-[13px] data-[state=active]:border-border data-[state=active]:bg-background-100"
            value="notes"
          >
            <Note className="size-4" /> Notes{" "}
            <Badge className="font-normal text-primary/40" variant="secondary">
              {noteCountLabel(notes.length, hasMoreNotes)}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            className="h-9 rounded-none border px-3 text-[13px] data-[state=active]:border-border data-[state=active]:bg-background-100"
            value="templates"
          >
            <NotePencil className="size-4" /> Templates{" "}
            <Badge className="font-normal text-primary/40" variant="secondary">
              {templateCountLabel(templates.length, hasMoreTemplates)}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {/* Sort, layout, and favorites change the note list. On Templates they
          only restyled themselves. */}
      {tab === "notes" ? (
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <Button
          type="button"
          className="h-8 rounded-none border border-border bg-background px-3 text-[13px] text-primary/60 hover:bg-background-100"
          variant="ghost"
          onClick={() => setNewestFirst((value) => !value)}
        >
          <List className="size-4" /> Sorted by{" "}
          <Label className="font-normal text-primary">
            {newestFirst ? "Newest first" : "Oldest first"}
          </Label>
          <CaretDown className={cn("size-3 transition-transform", !newestFirst && "rotate-180")} />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 border border-border bg-background p-0.5">
            <Button
              aria-label="List view"
              type="button"
              className={cn(
                "size-7 rounded-none p-0",
                layout === "list" ? "bg-background-200 text-primary" : "text-primary/45",
              )}
              size="icon-xs"
              variant="ghost"
              onClick={() => setLayout("list")}
            >
              <List className="size-4" />
            </Button>
            <Button
              aria-label="Grid view"
              type="button"
              className={cn(
                "size-7 rounded-none p-0",
                layout === "grid" ? "bg-background-200 text-primary" : "text-primary/45",
              )}
              size="icon-xs"
              variant="ghost"
              onClick={() => setLayout("grid")}
            >
              <GridFour className="size-4" />
            </Button>
          </div>
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-2 border border-border bg-background px-3 text-[13px] text-primary hover:bg-background-100">
              <SlidersHorizontal className="size-4" /> View settings
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-52 border border-border bg-background p-3 shadow-xl">
              <label
                htmlFor="notes-show-favorites"
                className="flex cursor-pointer items-center justify-between gap-4 text-[13px] text-primary/70"
              >
                Show favorites
                <Checkbox
                  id="notes-show-favorites"
                  aria-label="Show favorites"
                  checked={showFavorites}
                  onCheckedChange={(checked) => setShowFavorites(checked === true)}
                />
              </label>
            </div>
          </details>
          <Button
            className="h-8 bg-[#3478f6] px-3 text-white hover:bg-[#2f6fe6]"
            size="sm"
            onClick={() => setEditing({})}
          >
            <Plus /> New note
          </Button>
        </div>
      </div>
      ) : null}
      {tab === "templates" && templatesQuery.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">
            {explainedRevenueError(templatesQuery.error, "Could not load note templates.")}
          </p>
          <Button size="sm" variant="outline" onClick={() => void templatesQuery.refetch()}>
            <ArrowClockwise /> Retry
          </Button>
        </div>
      ) : tab === "templates" && templatesQuery.isLoading ? (
        <div className="p-4">
          <ListSkeleton />
        </div>
      ) : tab === "templates" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-sm font-medium">Reusable note templates</Label>
            <Button size="sm" onClick={() => setEditingTemplate("new")}>
              <Plus /> New template
            </Button>
          </div>
          {templates.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {templates.map((template) => (
                <Card className="gap-3 p-4" key={template.id}>
                  <CardTitle>{template.payload.title}</CardTitle>
                  <CardDescription className="line-clamp-3">
                    {template.payload.body || "Empty template"}
                  </CardDescription>
                  <div className="mt-auto flex gap-2">
                    <Button
                      aria-label={`Apply ${template.payload.title}`}
                      size="sm"
                      onClick={() => {
                        setEditing({ template });
                        setTab("notes");
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      aria-label={`Edit ${template.payload.title}`}
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingTemplate(template)}
                    >
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            // The section header already opens a new template. A second button
            // in the empty state only repeated that click.
            <WorkspaceEmptyState
              description="Create a reusable starting point for notes."
              image="notes"
              learnMore={[]}
              title="No templates yet"
            />
          )}
          {hasMoreTemplates ? (
            <Button
              className="mt-3 w-full rounded-none"
              disabled={loadingMoreTemplates}
              onClick={() => void loadMoreTemplates()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {loadingMoreTemplates ? "Loading…" : nextTemplatesLabel()}
            </Button>
          ) : null}
        </div>
      ) : loading ? (
        <div className="p-4">
          <ListSkeleton />
        </div>
      ) : visible.length === 0 ? (
        <WorkspaceEmptyState
          action={
            hasMoreNotes ? (
              <Button
                disabled={loadingMoreNotes}
                onClick={() => void loadEarlierNotes()}
                size="sm"
                type="button"
                variant="outline"
              >
                {earlierNotesLabel()}
              </Button>
            ) : (
              <Button
                className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
                onClick={() => setEditing({})}
                size="sm"
              >
                <Plus /> New note
              </Button>
            )
          }
          description={
            hasMoreNotes ? (
              "Earlier notes are still on these companies."
            ) : (
              <>
                No notes yet! Create your first
                <br />
                note to get started.
              </>
            )
          }
          image="notes"
          learnMore={[
            { label: "Link notes to companies" },
            { label: "Turn notes into promises" },
          ]}
          title="Notes"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {showFavorites ? (
            <section className="px-4 pt-3">
              <Label className="mb-3 flex items-center gap-1 text-[12px] font-normal text-primary/45">
                Favorites
                <Badge className="text-[10px] font-normal" variant="outline">
                  {favoriteNotes.length}
                </Badge>
              </Label>
              {favoritesQuery.isError ? (
                <div className="flex items-center gap-3 border border-destructive/30 p-3">
                  <p className="text-xs text-destructive">
                    {explainedRevenueError(favoritesQuery.error, "Could not load favorites.")}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void favoritesQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : favoriteNotes.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
                  {favoriteNotes.map((note) => (
                    <Button
                      className="h-auto justify-start border p-3 text-left"
                      key={note.externalId}
                      onClick={() => setEditing(note)}
                      variant="outline"
                    >
                      <BookmarkSimple weight="fill" />
                      <span className="truncate">{note.title || "Untitled note"}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <Card className="flex h-28 items-center justify-center border-dashed py-0 text-center">
                  <CardContent>
                    <CardDescription>Favorite a note to keep it here.</CardDescription>
                  </CardContent>
                </Card>
              )}
              {hasMoreFavorites ? (
                <Button
                  className="mt-3 w-full rounded-none"
                  disabled={loadingMoreFavorites}
                  onClick={() => void loadMoreFavorites()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {loadingMoreFavorites ? "Loading…" : nextFavoritesLabel()}
                </Button>
              ) : null}
            </section>
          ) : null}
          {noteGroups.map((group) => (
            <div className="mt-3 border-t border-border px-4 py-3" key={group.day}>
              <Label className="mb-3 flex items-center gap-1 text-[12px] font-normal text-primary/55">
                {group.label}{" "}
                <Badge className="text-[10px] font-normal" variant="outline">
                  {group.notes.length}
                </Badge>
              </Label>
              <div
                className={
                  layout === "grid"
                    ? "grid grid-cols-[repeat(auto-fill,minmax(300px,368px))] gap-3"
                    : "space-y-2"
                }
              >
                {group.notes.map((note) => (
                  <Card
                    className={cn(
                      "cursor-pointer gap-0 py-0 transition-colors hover:bg-background-100",
                      layout === "grid" ? "h-52 max-w-[368px]" : "h-24 w-full",
                    )}
                    key={note.externalId}
                    onClick={() => setEditing(note)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditing(note);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <CardHeader className="flex-1 gap-1 px-4 pb-0 pt-4">
                      <div className="flex items-center gap-2 text-[12px] text-primary/65">
                        <Note className="size-3.5" />
                        {onOpenCompany ? (
                          <Button
                            aria-label={noteCompanyLabel(note.relationshipName)}
                            className="h-auto rounded-none px-0 py-0 text-[12px] font-normal text-primary/65 underline hover:bg-transparent hover:text-primary"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenCompany(note.relationshipId);
                            }}
                            type="button"
                            variant="ghost"
                          >
                            {note.relationshipName}
                          </Button>
                        ) : (
                          <Label className="font-normal">{note.relationshipName}</Label>
                        )}
                        {note.meetingLinked ? (
                          <Badge className="font-normal" variant="outline">
                            Meeting note
                          </Badge>
                        ) : null}
                      </div>
                      <CardTitle className="mt-3 text-[15px] text-primary">
                        {note.title || "Untitled note"}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-[13px]">
                        {note.body || "This note has no content."}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex h-10 items-center justify-between border-t px-4 text-[12px] text-primary/50">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-4 rounded-none" size="sm">
                          <AvatarFallback
                            className="rounded-none bg-cyan-600 text-[9px] text-white"
                            data-slot="note-author"
                          >
                            {author.mark}
                          </AvatarFallback>
                        </Avatar>
                        <Label className="font-normal">{author.label}</Label>
                      </div>
                      <Badge className="font-normal" variant="secondary">
                        {relativeTime(note.occurredAt)}
                      </Badge>
                      <Button
                        aria-label={
                          favoriteIds.has(note.externalId)
                            ? `Remove ${note.title} from favorites`
                            : `Add ${note.title} to favorites`
                        }
                        disabled={favoriteMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          favoriteMutation.mutate(note.externalId);
                        }}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <BookmarkSimple
                          weight={favoriteIds.has(note.externalId) ? "fill" : "regular"}
                        />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {hasMoreNotes ? (
            <Button
              className="m-3"
              disabled={loadingMoreNotes}
              onClick={() => void loadEarlierNotes()}
              size="sm"
              type="button"
              variant="outline"
            >
              {earlierNotesLabel()}
            </Button>
          ) : null}
        </div>
      )}
      {editing ? (
        <NoteDialog
          key={"externalId" in editing ? editing.externalId : editing.template?.id || "new"}
          note={"externalId" in editing ? editing : undefined}
          onClose={() => {
            if (noteIdFromHash(window.location.hash)) {
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${window.location.search}`,
              );
            }
            setEditing(null);
          }}
          onCreateTemplate={() => setEditingTemplate("new")}
          onError={onError}
          onNotice={onNotice}
          onSaved={() => void load()}
          onAddCompany={
            onOpenCompanies
              ? () => {
                  setEditing(null);
                  openCompanyCreate(onOpenCompanies);
                }
              : undefined
          }
          onViewTemplates={() => setTab("templates")}
          author={author}
          relationships={relationships}
          template={"template" in editing ? editing.template : undefined}
        />
      ) : null}
      {editingTemplate ? (
        <TemplateDialog
          key={editingTemplate === "new" ? "new" : editingTemplate.id}
          onClose={() => setEditingTemplate(null)}
          onError={onError}
          onNotice={onNotice}
          template={editingTemplate === "new" ? undefined : editingTemplate}
        />
      ) : null}
    </div>
  );
}

function TemplateDialog({
  template,
  onClose,
  onError,
  onNotice,
}: {
  template?: NoteTemplateResource;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState(template?.payload.title ?? "");
  const [body, setBody] = React.useState(template?.payload.body ?? "");
  const mutation = useMutation({
    mutationFn: async (action: "save" | "delete") => {
      if (action === "delete" && template) return deleteConsoleResource(template.id);
      const payload = { title: title.trim(), body };
      if (template) return patchConsoleResource(template.id, { name: title.trim(), payload });
      return createConsoleResource({
        kind: "note_template",
        name: title.trim(),
        payload,
      });
    },
    onSuccess: (_, action) => {
      void queryClient.invalidateQueries({
        queryKey: consoleKeys.resourceKind("note_template"),
      });
      onNotice(action === "delete" ? "Template deleted." : "Template saved.");
      onClose();
    },
    onError: (error, action) =>
      onError(errMessage(error, `Could not ${action} the note template.`)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? "Edit note template" : "New note template"}</DialogTitle>
          <DialogDescription>
            Templates provide a reusable title and starting body for a new note.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            aria-label="Template title"
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Quarterly company review"
            value={title}
          />
          <Textarea
            aria-label="Template body"
            className="min-h-48"
            maxLength={65_536}
            onChange={(event) => setBody(event.target.value)}
            placeholder="The text a new note starts with…"
            value={body}
          />
          {mutation.isError ? (
            <p className="text-xs text-destructive" role="alert">
              The template change failed. You can retry without losing this draft.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          {template ? (
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("delete")}
              type="button"
              variant="destructive"
            >
              <Trash /> Delete
            </Button>
          ) : null}
          <Button disabled={mutation.isPending} onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !title.trim()}
            onClick={() => mutation.mutate("save")}
            type="button"
          >
            {mutation.isPending ? <Spinner className="size-4" /> : null}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  note,
  template,
  relationships,
  author,
  onClose,
  onCreateTemplate,
  onSaved,
  onError,
  onNotice,
  onViewTemplates,
  onAddCompany,
}: {
  note?: WorkspaceNote;
  template?: NoteTemplateResource;
  relationships: RevenueRelationship[];
  author: { label: string; mark: string };
  onClose: () => void;
  onCreateTemplate: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onViewTemplates: () => void;
  /** Closes this note and opens New company. Absent in tests that only check the empty copy. */
  onAddCompany?: () => void;
}) {
  const noteId = React.useRef(note?.externalId || crypto.randomUUID()).current;
  const [title, setTitle] = React.useState(
    note?.title === "Untitled note" ? "" : note?.title || template?.payload.title || "",
  );
  // A new note is not already about the first company. Autosave would file
  // it there before anyone chose.
  const [relationshipId, setRelationshipId] = React.useState(note?.relationshipId || "");
  const [content, setContent] = React.useState<Value>(() => {
    if (template?.payload.content) return template.payload.content as Value;
    if (template?.payload.body) {
      return [{ type: "p", children: [{ text: template.payload.body }] }];
    }
    return plateValue(note);
  });
  const [meetingLinked, setMeetingLinked] = React.useState(Boolean(note?.meetingLinked));
  const [maximized, setMaximized] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [insertOpen, setInsertOpen] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "error">("saved");
  const lastSaved = React.useRef(
    note ? JSON.stringify([title, relationshipId, content, meetingLinked]) : "",
  );
  const editor = usePlateEditor({ plugins: notePlugins, value: content });
  const insertBlock = (type: "p" | "h2" | "blockquote") => {
    // The formatting bar toggles the current block. This control adds a new
    // one, which is what "Insert content" claims to do.
    const node = type === "p" ? editor.api.create.block() : { type, children: [{ text: "" }] };
    editor.tf.insertNodes(node, { select: true });
    setInsertOpen(false);
  };
  const snapshot = JSON.stringify([title, relationshipId, content, meetingLinked]);

  const publish = React.useCallback(
    async (eventType: "note" | "note_deleted") => {
      if (!relationshipId) return false;
      setSaveState("saving");
      try {
        const body = plateText(content);
        await ingestRelationshipObservations([
          {
            relationshipId,
            source: "desktop_note",
            externalId: crypto.randomUUID(),
            sourceVersion: "1",
            eventType,
            occurredAt: new Date().toISOString(),
            summary: title.trim() || "Untitled note",
            normalizedFacts:
              eventType === "note"
                ? {
                    noteId,
                    title: title.trim() || "Untitled note",
                    body,
                    content,
                    meetingLinked,
                  }
                : { noteId },
          },
        ]);
        lastSaved.current = snapshot;
        setSaveState("saved");
        onSaved();
        return true;
      } catch (error) {
        setSaveState("error");
        onError(errMessage(error, "Could not save the note."));
        return false;
      }
    },
    [content, meetingLinked, noteId, onError, onSaved, relationshipId, snapshot, title],
  );

  React.useEffect(() => {
    if (!relationshipId || snapshot === lastSaved.current) return;
    const timer = window.setTimeout(() => void publish("note"), 650);
    return () => window.clearTimeout(timer);
  }, [publish, relationshipId, snapshot]);

  const noteHasDraftContent = Boolean(title.trim() || plateText(content).trim());

  const closeEditor = async () => {
    const dirty = snapshot !== lastSaved.current;
    if (dirty && noteHasDraftContent && relationshipId) {
      if (!(await publish("note"))) return false;
    }
    // A note can only be stored against a company. Closing still dismisses the
    // draft, but the status line and this notice are the only signal that the
    // text was not written.
    if (dirty && noteHasDraftContent && !relationshipId) {
      onNotice(noteNeedsCompanyCopy("notice", relationships.length > 0));
    }
    onClose();
    return true;
  };
  const leaveFor = async (next: () => void) => {
    if (await closeEditor()) next();
  };
  const selectedRelationship = relationships.find((item) => item.id === relationshipId);
  const bodyEmpty = !plateText(content).trim();
  return (
    <Dialog open onOpenChange={(open) => !open && void closeEditor()}>
      <DialogContent
        showCloseButton={false}
        className={`${maximized ? "h-screen w-screen" : "h-[min(588px,calc(100vh-32px))] w-[min(794px,calc(100vw-32px))]"} flex max-w-none translate-y-[-50%] flex-col gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-none`}
      >
        <DialogTitle className="sr-only">{title || "Untitled note"}</DialogTitle>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-primary/80">
            <Note className="size-3.5 text-primary/45" />
            <Select
              disabled={relationships.length === 0}
              value={relationshipId || undefined}
              onValueChange={setRelationshipId}
            >
              <SelectTrigger
                id="note-relationship"
                aria-label={linkedCompanyName(
                  selectedRelationship
                    ? companyName(selectedRelationship)
                    : relationships.length === 0
                      ? "No companies yet"
                      : "Link a company",
                )}
                className="h-auto max-w-56 border-0 bg-transparent p-0 text-[12px] text-primary underline shadow-none focus:ring-0"
              >
                <SelectValue
                  placeholder={relationships.length === 0 ? "No companies yet" : "Link a company"}
                />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-none">
                {relationships.map((relationship) => (
                  <SelectItem key={relationship.id} value={relationship.id}>
                    {companyName(relationship)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-primary/45">
            <Button
              aria-label="Minimize note"
              type="button"
              className="size-7 rounded-none text-primary/45 hover:bg-background-100 hover:text-primary"
              disabled={!maximized}
              size="icon-xs"
              title={maximized ? "Leave full screen" : "The note is already in a window"}
              variant="ghost"
              onClick={() => setMaximized(false)}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              aria-label={maximized ? "Restore note" : "Maximize note"}
              type="button"
              className="size-7 rounded-none text-primary/45 hover:bg-background-100 hover:text-primary"
              size="icon-xs"
              variant="ghost"
              onClick={() => setMaximized((value) => !value)}
            >
              <ArrowsOut className="size-3.5" />
            </Button>
            <Button
              aria-label="Close note"
              type="button"
              className="size-7 rounded-none text-primary/45 hover:bg-background-100 hover:text-primary"
              size="icon-xs"
              variant="ghost"
              onClick={() => void closeEditor()}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto px-[52px] pb-14 pt-[57px] text-primary/80">
          <div className="absolute right-[18px] top-1 flex items-center gap-3 text-[13px] text-primary/55">
            <Avatar className="size-5 rounded-none">
              <AvatarFallback
                aria-label={`Note author ${author.label}`}
                className="rounded-none border border-border bg-background-100 text-[10px] font-semibold text-primary/70"
                data-slot="note-author"
              >
                {author.mark}
              </AvatarFallback>
            </Avatar>
            <Button
              type="button"
              className="h-auto rounded-none px-0 py-0 text-[13px] text-primary/55 hover:bg-transparent hover:text-primary"
              variant="ghost"
              onClick={async () => {
                // The id exists before the first save, but the notes list only
                // knows a note after it is stored. Copying earlier opens a link
                // that says the note is gone.
                if (!lastSaved.current) {
                  onNotice("This note has not been saved, so there is no link to copy.");
                  return;
                }
                try {
                  await navigator.clipboard.writeText(workspaceNoteHref(window.location, noteId));
                  onNotice("Note link copied.");
                } catch {
                  onNotice("Could not copy the note link.");
                }
              }}
            >
              <Link className="size-3.5" /> Copy link
            </Button>
            <div className="relative">
              <Button
                aria-label="Note actions"
                type="button"
                className="size-7 rounded-none text-primary/55 hover:bg-background-100 hover:text-primary"
                size="icon-xs"
                variant="ghost"
                onClick={() => setMenuOpen((value) => !value)}
              >
                <DotsThree className="size-4" />
              </Button>
              {menuOpen ? (
                <div className="absolute right-0 top-8 z-10 w-36 border border-border bg-background p-1 shadow-xl">
                  <Button
                    type="button"
                    className="h-auto w-full justify-start rounded-none px-3 py-2 text-[12px] text-destructive hover:bg-background-100"
                    variant="ghost"
                    onClick={async () => {
                      // A draft was never stored. Delete would claim a note was removed.
                      if (!lastSaved.current) {
                        onClose();
                        return;
                      }
                      if (await publish("note_deleted")) onClose();
                    }}
                  >
                    {lastSaved.current ? "Delete note" : "Discard draft"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <Input
            aria-label="Note title"
            className="mt-8 h-auto rounded-none border-0 bg-transparent px-0 text-[32px] font-semibold leading-tight tracking-[-0.03em] text-primary shadow-none placeholder:text-primary/45 focus-visible:ring-0"
            placeholder="Untitled note"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="mt-3 flex items-center gap-4 text-[13px] text-primary/55">
            {relationships.length === 0 && onAddCompany ? (
              <Button
                className="h-auto rounded-none px-0 py-0 text-[13px] font-normal text-primary/55 hover:bg-transparent hover:text-primary"
                type="button"
                variant="ghost"
                onClick={onAddCompany}
              >
                <Note className="size-3.5" /> Add a company
              </Button>
            ) : (
              <Label
                className={cn(
                  "flex items-center gap-2 font-normal text-primary/55",
                  selectedRelationship && "text-primary underline",
                )}
              >
                <Note className="size-3.5" />
                {(selectedRelationship
                  ? companyName(selectedRelationship)
                  : relationships.length === 0
                    ? "No companies yet"
                    : "Link a company")}
              </Label>
            )}
            <Button
              aria-pressed={meetingLinked}
              type="button"
              className="h-auto rounded-none px-0 py-0 text-[13px] text-primary/55 hover:bg-transparent hover:text-primary"
              variant="ghost"
              onClick={() => setMeetingLinked((value) => !value)}
            >
              <CalendarBlank className="size-4" />
              {/* Stored as a boolean on the note. There is no meeting to attach. */}
              {meetingLinked ? "Meeting note" : "Mark as meeting note"}
            </Button>
          </div>
          <div className="mt-6 flex items-center gap-1 border-y border-border py-1">
            {[
              { label: "Bold", icon: TextB, run: () => editor.tf.toggleMark("bold") },
              { label: "Italic", icon: TextItalic, run: () => editor.tf.toggleMark("italic") },
              {
                label: "Underline",
                icon: TextUnderline,
                run: () => editor.tf.toggleMark("underline"),
              },
              { label: "Heading 2", icon: TextHTwo, run: () => editor.tf.toggleBlock("h2") },
              { label: "Quote", icon: Quotes, run: () => editor.tf.toggleBlock("blockquote") },
            ].map(({ label, icon: Icon, run }) => (
              <Button
                aria-label={label}
                className="size-8 rounded-none text-primary/45 hover:bg-background-100 hover:text-primary"
                key={label}
                onMouseDown={(event) => {
                  event.preventDefault();
                  run();
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Icon className="size-4" />
              </Button>
            ))}
          </div>
          <Plate editor={editor} onChange={({ value }) => setContent(value)}>
            <PlateContent
              aria-label="Note content"
              className="mt-6 min-h-24 text-[14px] leading-6 text-primary/80 outline-none [&_.slate-blockquote]:my-3 [&_.slate-blockquote]:border-l-2 [&_.slate-blockquote]:border-primary/25 [&_.slate-blockquote]:pl-3 [&_.slate-blockquote]:text-primary/60 [&_.slate-h2]:my-3 [&_.slate-h2]:text-xl [&_.slate-h2]:font-semibold [&_[data-slate-placeholder]]:text-primary/45"
              placeholder="Start typing your note"
            />
          </Plate>
          {bodyEmpty ? (
            <div className="mt-6 space-y-3 text-[13px] text-primary/55">
              {/* Templates cannot be favorited. The heading names the two links below. */}
              <p className="text-[10px] font-medium uppercase tracking-wide text-primary/45">
                Templates
              </p>
              <Button
                type="button"
                className="h-auto justify-start rounded-none px-0 py-0 text-[13px] text-primary/55 hover:bg-transparent hover:text-primary"
                variant="ghost"
                onClick={() => void leaveFor(onViewTemplates)}
              >
                <Note className="size-4" /> View all templates
              </Button>
              <Button
                type="button"
                className="h-auto justify-start rounded-none px-0 py-0 text-[13px] text-primary/55 hover:bg-transparent hover:text-primary"
                variant="ghost"
                onClick={() => void leaveFor(onCreateTemplate)}
              >
                <Note className="size-4" /> Create new template
              </Button>
            </div>
          ) : null}
          {noteHasDraftContent && !relationshipId ? (
            <p
              className="absolute right-5 bottom-3 text-[11px] font-normal text-destructive"
              role="status"
            >
              {noteNeedsCompanyCopy("status", relationships.length > 0)}
            </p>
          ) : saveState !== "saved" ? (
            <Label
              className={`absolute right-5 bottom-3 text-[11px] font-normal ${saveState === "error" ? "text-destructive" : "text-primary/55"}`}
            >
              {saveState === "saving" ? "Saving…" : "Save failed"}
            </Label>
          ) : null}
        </div>
        <div className="absolute bottom-3 left-4">
          {insertOpen ? (
            <div className="absolute bottom-7 left-0 z-10 w-36 border border-border bg-background p-1 shadow-xl">
              {(
                [
                  ["p", "Insert paragraph"],
                  ["h2", "Insert heading 2"],
                  ["blockquote", "Insert quote"],
                ] as const
              ).map(([type, label]) => (
                <Button
                  className="h-8 w-full justify-start rounded-none px-2 text-[12px]"
                  key={type}
                  onClick={() => insertBlock(type)}
                  type="button"
                  variant="ghost"
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
          <Button
            aria-expanded={insertOpen}
            aria-label="Insert content"
            className="size-5 rounded-none border border-border p-0 text-primary/55 hover:bg-background-100 hover:text-primary"
            onClick={() => setInsertOpen((open) => !open)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Due dates are ISO strings, so lexicographic order is chronological.
 * A task with no due date stays at the end in both directions: it is not
 * the soonest date and it is not the latest one.
 */
export function sortTasksByDue<T extends { dueAt?: string | null }>(
  tasks: readonly T[],
  soonestFirst: boolean,
): T[] {
  return [...tasks].sort((left, right) => {
    const leftDue = left.dueAt || "";
    const rightDue = right.dueAt || "";
    if (!leftDue && !rightDue) return 0;
    if (!leftDue) return 1;
    if (!rightDue) return -1;
    const order = leftDue.localeCompare(rightDue);
    return soonestFirst ? order : -order;
  });
}

/**
 * Due today and Overdue are filters. An empty result means nothing falls in
 * that window, which is not the same as a workspace with no tasks.
 */
export function taskListEmptyCopy(filter: "all" | "today" | "overdue"): string | null {
  if (filter === "today") return "Nothing is due today.";
  if (filter === "overdue") return "Nothing is overdue.";
  return null;
}

const TASK_FILTER_LABEL = {
  all: "All tasks",
  today: "Due today",
  overdue: "Overdue",
} as const;

/** The visible word is the current task filter, not the menu's name. */
export function taskFilterName(filter: "all" | "today" | "overdue"): string {
  return comboboxFilterName("Tasks", TASK_FILTER_LABEL[filter]);
}

export function taskRemainderLabel(): string {
  return "Show the next tasks";
}

/** The note's company menu shows the choice inside the control. The name has to repeat it. */
export function linkedCompanyName(label: string): string {
  return comboboxFilterName("Linked company", label);
}

/** The company named on a note or a task opens that company. */
export function noteCompanyLabel(name: string): string {
  const company = name.trim() || "company";
  return `Open company ${company}`;
}

/**
 * A note is stored on a company. With no companies, the menu cannot link one.
 * With companies, the note still starts unlinked so it is not filed on the first.
 */
export function noteNeedsCompanyCopy(
  surface: "status" | "notice",
  hasCompanies: boolean,
): string {
  if (hasCompanies) {
    return surface === "status"
      ? "Link a company to save this note."
      : "Link a company before this note can be saved.";
  }
  return surface === "status"
    ? "Add a company to save this note."
    : "Add a company before this note can be saved.";
}

export function TasksView({
  onError,
  onNotice,
  onOpenCompanies,
  onOpenCompany,
}: ViewProps & {
  onOpenCompanies?: () => void;
  onOpenCompany?: (relationshipId: string) => void;
}) {
  const queryClient = useQueryClient();
  const actionsQuery = useRevenueActions("open", ACTION_QUEUE_PAGE, "task");
  const relationshipsQuery = useRelationships();
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "today" | "overdue">("all");
  const [soonestFirst, setSoonestFirst] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());
  const [extraTasks, setExtraTasks] = React.useState<RevenueAction[]>([]);
  const [laterTasksHasMore, setLaterTasksHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreTasks, setLoadingMoreTasks] = React.useState(false);
  const taskPage = actionRows(actionsQuery.data);
  const taskRows = React.useMemo(() => {
    if (extraTasks.length === 0) return taskPage;
    const seen = new Set(taskPage.map((task) => task.id));
    return [
      ...taskPage,
      ...extraTasks.filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
      }),
    ];
  }, [extraTasks, taskPage]);
  const hasMoreTasks =
    laterTasksHasMore ?? (taskPage.length > 0 && actionPageHasMore(actionsQuery.data));
  const tasks = sortTasksByDue(taskRows.filter(isWorkspaceTask), soonestFirst);
  const relationships = relationshipRows(relationshipsQuery.data).filter(
    (record) => record.kind !== "person",
  );
  const loading = actionsQuery.isPending || relationshipsQuery.isPending;
  const load = React.useCallback(async () => {
    setExtraTasks([]);
    setLaterTasksHasMore(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: revenueActionKeys.all }),
      queryClient.invalidateQueries({ queryKey: relationshipKeys.all }),
    ]);
  }, [queryClient]);
  const loadMoreTasks = React.useCallback(async () => {
    if (loadingMoreTasks || !hasMoreTasks) return;
    setLoadingMoreTasks(true);
    try {
      const next = await fetchRevenueActions(
        "open",
        ACTION_QUEUE_PAGE,
        undefined,
        "task",
        taskPage.length + extraTasks.length,
      );
      setLaterTasksHasMore(actionPageHasMore(next));
      setExtraTasks((current) => [...current, ...actionRows(next)]);
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next tasks."));
    } finally {
      setLoadingMoreTasks(false);
    }
  }, [extraTasks.length, hasMoreTasks, loadingMoreTasks, onError, taskPage.length]);

  React.useEffect(() => {
    const error = actionsQuery.error ?? relationshipsQuery.error;
    if (error) onError(errMessage(error, "Could not load tasks."));
  }, [actionsQuery.error, onError, relationshipsQuery.error]);
  const names = new Map(
    relationships.map((relationship) => [relationship.id, companyName(relationship)]),
  );
  const today = todayValue();
  const visible = tasks.filter((task) => {
    // Stored as 5pm local, which is already the next UTC date west of UTC.
    if (filter === "today") return taskIsDueToday(task.dueAt, today);
    if (filter === "overdue") return taskIsOverdue(task.dueAt, now);
    return true;
  });
  const complete = async (task: RevenueAction) => {
    setBusy(task.id);
    try {
      await dismissAction(task.id, "Completed from Tasks");
      onNotice("Task completed.");
      await load();
    } catch (error) {
      onError(errMessage(error, "Could not complete the task."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex min-h-full flex-col bg-background" data-slot="tasks-view">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Button
            className="h-8 rounded-none border border-border bg-background px-3 text-[13px] text-primary/60 hover:bg-background-100"
            onClick={() => setSoonestFirst((value) => !value)}
            type="button"
            variant="ghost"
          >
            <List className="size-4" /> Sorted by{" "}
            <Label className="font-normal text-primary">
              {soonestFirst ? "Soonest due" : "Latest due"}
            </Label>
            <CaretDown
              className={cn("size-3 transition-transform", !soonestFirst && "rotate-180")}
            />
          </Button>
          <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <SelectTrigger
              id="task-filter"
              aria-label={taskFilterName(filter)}
              className="h-8 w-auto gap-2 rounded-none border border-border bg-background px-3 text-[13px] text-primary/55 shadow-none hover:bg-background-100"
              size="sm"
            >
              <Funnel className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="app-shell rounded-none">
              <SelectItem value="all">All tasks</SelectItem>
              <SelectItem value="today">Due today</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-2 border border-border bg-background px-3 text-[13px] text-primary hover:bg-background-100">
              <SlidersHorizontal className="size-4" /> View settings
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-56 border border-border bg-background p-3 shadow-xl">
              <label
                className="flex cursor-pointer items-center justify-between gap-4 text-[13px] text-primary/70"
                htmlFor="tasks-soonest-due"
              >
                Soonest due first
                <Checkbox
                  aria-label="Soonest due first"
                  checked={soonestFirst}
                  id="tasks-soonest-due"
                  onCheckedChange={(checked) => setSoonestFirst(checked === true)}
                />
              </label>
            </div>
          </details>
          <Button
            className="h-8 bg-[#3478f6] px-3 text-white hover:bg-[#2f6fe6]"
            size="sm"
            onClick={() => setCreating(true)}
          >
            <Plus /> New task
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="p-4">
          <ListSkeleton />
        </div>
      ) : visible.length === 0 ? (
        <WorkspaceEmptyState
          action={
            hasMoreTasks ? (
              <Button
                disabled={loadingMoreTasks}
                onClick={() => void loadMoreTasks()}
                size="sm"
                type="button"
                variant="outline"
              >
                {taskRemainderLabel()}
              </Button>
            ) : filter === "all" ? (
              <Button
                className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
                onClick={() => setCreating(true)}
                size="sm"
              >
                <Plus /> New task
              </Button>
            ) : (
              <Button onClick={() => setFilter("all")} size="sm" type="button" variant="outline">
                Show all tasks
              </Button>
            )
          }
          description={
            taskListEmptyCopy(filter) ?? (
              <>
                No tasks yet! Create your first
                <br />
                task to get started.
              </>
            )
          }
          image="tasks"
          learnMore={
            filter === "all"
              ? [
                  { label: "Link a task to a company" },
                  { label: "Complete a task from the list" },
                ]
              : []
          }
          title="Tasks"
        />
      ) : (
        <>
        <ul className="divide-y divide-border">
          {visible.map((task) => {
            const overdue = taskIsOverdue(task.dueAt, now);
            const companyName = names.get(task.relationshipId || "");
            return (
              <li
                key={task.id}
                className="grid min-h-12 grid-cols-[36px_minmax(0,1fr)_220px_150px] items-center gap-3 px-3 hover:bg-background-100/70"
              >
                <Button
                  aria-label={`Complete ${task.reason}`}
                  className="size-5 rounded-none border border-border p-0 text-primary/40 hover:border-[#3478f6] hover:bg-transparent hover:text-[#3478f6]"
                  disabled={busy === task.id}
                  onClick={() => void complete(task)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  {busy === task.id ? <Spinner className="size-3" /> : null}
                </Button>
                <Label className="truncate text-[13px] font-medium text-primary">
                  {task.reason}
                </Label>
                {companyName && onOpenCompany && task.relationshipId ? (
                  <Button
                    aria-label={noteCompanyLabel(companyName)}
                    className="h-auto max-w-full justify-start truncate rounded-none px-0 py-0 text-[12px] font-normal text-primary/55 underline hover:bg-transparent hover:text-primary"
                    onClick={() => onOpenCompany(task.relationshipId)}
                    type="button"
                    variant="ghost"
                  >
                    {companyName}
                  </Button>
                ) : (
                  <CardDescription className="truncate text-[12px]">
                    {companyName || "Unlinked"}
                  </CardDescription>
                )}
                <Badge
                  className={cn(
                    "ml-auto justify-end text-[12px] font-normal",
                    overdue ? "text-red-500" : "text-primary/45",
                  )}
                  variant="secondary"
                >
                  {task.dueAt
                    ? new Date(task.dueAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "No due date"}
                </Badge>
              </li>
            );
          })}
        </ul>
        {hasMoreTasks ? (
          <Button
            className="m-3"
            disabled={loadingMoreTasks}
            onClick={() => void loadMoreTasks()}
            size="sm"
            type="button"
            variant="outline"
          >
            {taskRemainderLabel()}
          </Button>
        ) : null}
        </>
      )}
      {creating ? (
        <TaskCreateDialog
          open
          relationships={relationships}
          onAddCompany={
            onOpenCompanies
              ? () => {
                  setCreating(false);
                  openCompanyCreate(onOpenCompanies);
                }
              : undefined
          }
          onError={onError}
          onOpenChange={setCreating}
          onSaved={() => {
            onNotice("Task created.");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
