"use client";

import "client-only";

import * as React from "react";

import { Button } from "@oppulence/ui/components/button";
import { Checkbox } from "@oppulence/ui/components/checkbox";
import { Input } from "@oppulence/ui/components/input";
import { Label } from "@oppulence/ui/components/label";

import { useQueryClient } from "@tanstack/react-query";
import {
  useCommunicationPolicy,
  useCommunicationPrivacyRules,
} from "@/hooks/queries/use-communication";
import { communicationKeys } from "@/hooks/queries/utils/communication-keys";
import {
  createCommunicationPrivacyRule,
  deleteCommunicationPrivacyRule,
  friendlyRevenueError,
  putCommunicationPolicy,
} from "@/lib/revenue/revenue";
import type { CommunicationPolicy, CommunicationPrivacyRule } from "@/lib/revenue/types";

const PRIVACY_RULE_LABELS: Record<string, string> = {
  protected_address: "Protected address",
  protected_domain: "Protected domain",
  blocked_address: "Blocked address",
  blocked_domain: "Blocked domain",
};

/**
 * The menu already names each kind. The saved list used to repeat the stored
 * snake_case token, so a rule the person just added read as protected_address.
 */
export function privacyRuleLabel(kind: string): string {
  const known = PRIVACY_RULE_LABELS[kind];
  if (known) return known;
  const words = kind.replaceAll("_", " ").trim();
  if (!words) return kind;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A failed rules request is not an empty protected-address list. */
export function privacyRulesEmptyCopy(): string {
  return "No protected or blocked addresses yet.";
}

export function privacyLoadNotice(input: {
  accountEntered: boolean;
  policyFailed: boolean;
  rulesFailed: boolean;
  policyLoaded?: boolean;
  rulesLoaded?: boolean;
}): string | null {
  if (!input.accountEntered) return null;
  const policyLoaded = input.policyLoaded === true;
  const rulesLoaded = input.rulesLoaded === true;
  if (input.policyFailed && input.rulesFailed) {
    if (policyLoaded || rulesLoaded) {
      return "Could not refresh mailbox policy and privacy rules. Try again.";
    }
    return "Mailbox policy and privacy rules could not load. Try again.";
  }
  if (input.policyFailed) {
    return policyLoaded
      ? "Could not refresh mailbox policy. Try again."
      : "Mailbox policy could not load. Try again.";
  }
  if (input.rulesFailed) {
    return rulesLoaded
      ? "Could not refresh privacy rules. Try again."
      : "Privacy rules could not load. Try again.";
  }
  return null;
}

export async function retryPrivacyLoad(
  policy: { isError: boolean; refetch: () => Promise<unknown> },
  rules: { isError: boolean; refetch: () => Promise<unknown> },
): Promise<void> {
  await Promise.all([
    policy.isError ? policy.refetch() : Promise.resolve(),
    rules.isError ? rules.refetch() : Promise.resolve(),
  ]);
}

export function CommunicationPrivacySettings() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = React.useState("");
  const trimmedAccountId = accountId.trim();
  const policyQuery = useCommunicationPolicy(trimmedAccountId);
  const rulesQuery = useCommunicationPrivacyRules(trimmedAccountId.length > 0);
  const [policy, setPolicy] = React.useState<CommunicationPolicy | null>(null);
  const [rules, setRules] = React.useState<CommunicationPrivacyRule[]>([]);
  const [ruleKind, setRuleKind] = React.useState("protected_address");
  const [ruleValue, setRuleValue] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (policyQuery.data) setPolicy(policyQuery.data);
  }, [policyQuery.data]);

  React.useEffect(() => {
    if (rulesQuery.data) setRules(rulesQuery.data);
  }, [rulesQuery.data]);

  const accountEntered = trimmedAccountId.length > 0;
  const loadNotice = privacyLoadNotice({
    accountEntered,
    policyFailed: policyQuery.isError,
    rulesFailed: rulesQuery.isError,
    policyLoaded: policyQuery.data != null,
    rulesLoaded: rulesQuery.data != null,
  });

  const refresh = React.useCallback(async () => {
    if (!trimmedAccountId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: communicationKeys.policy(trimmedAccountId) }),
      queryClient.invalidateQueries({ queryKey: communicationKeys.rules() }),
    ]);
  }, [queryClient, trimmedAccountId]);

  async function savePolicy() {
    if (!policy || !accountId.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const saved = await putCommunicationPolicy(accountId.trim(), policy);
      setPolicy(saved);
      setStatus("Mailbox policy saved.");
    } catch (error: unknown) {
      setStatus(
        friendlyRevenueError(
          error instanceof Error ? error.message : "Could not save mailbox policy.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function addRule() {
    if (!ruleValue.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await createCommunicationPrivacyRule({ kind: ruleKind, value: ruleValue.trim() });
      setRuleValue("");
      await refresh();
      setStatus("Privacy rule added.");
    } catch (error: unknown) {
      setStatus(
        friendlyRevenueError(
          error instanceof Error ? error.message : "Could not add privacy rule.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack" data-slot="communication-privacy-settings">
      <div className="settings-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Mailbox account</p>
          <p className="settings-row-description">
            Configure privacy defaults for one connected Google mailbox.
          </p>
        </div>
        <Input
          aria-label="Mailbox account email"
          className="settings-input"
          onChange={(event) => setAccountId(event.target.value)}
          placeholder="you@company.com"
          value={accountId}
        />
      </div>

      {accountEntered && !policy && policyQuery.isPending ? (
        <p className="settings-inline-notice">Loading mailbox policy…</p>
      ) : null}

      {policy ? (
        <>
          <div className="settings-row">
            <Label className="settings-row-label" htmlFor="metadata-visibility">
              Metadata visibility
            </Label>
            <select
              className="settings-input"
              id="metadata-visibility"
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  metadataVisibility: event.target
                    .value as CommunicationPolicy["metadataVisibility"],
                })
              }
              value={policy.metadataVisibility}
            >
              <option value="workspace">Workspace-visible metadata</option>
              <option value="private">Private metadata</option>
            </select>
          </div>
          <div className="settings-row">
            <Checkbox
              checked={policy.shareSubject}
              id="share-subject"
              onCheckedChange={(checked) =>
                setPolicy({ ...policy, shareSubject: checked === true })
              }
            />
            <Label htmlFor="share-subject">Share subject lines by default</Label>
          </div>
          <div className="settings-row">
            <Checkbox
              checked={policy.shareBody}
              id="share-body"
              onCheckedChange={(checked) => setPolicy({ ...policy, shareBody: checked === true })}
            />
            <Label htmlFor="share-body">Share bodies by default</Label>
          </div>
          <div className="settings-row">
            <Checkbox
              checked={policy.shareAttachments}
              id="share-attachments"
              onCheckedChange={(checked) =>
                setPolicy({ ...policy, shareAttachments: checked === true })
              }
            />
            <Label htmlFor="share-attachments">Share attachments by default</Label>
          </div>
          <div className="settings-row">
            <Button disabled={busy} onClick={() => void savePolicy()} type="button">
              Save mailbox policy
            </Button>
          </div>
        </>
      ) : null}

      <div className="settings-row">
        <div className="settings-row-copy">
          <p className="settings-row-label">Protected or blocked addresses</p>
          <p className="settings-row-description">
            Protected recipients stay visible only to you. Blocked addresses are left out of
            this workspace.
          </p>
        </div>
        <div className="settings-inline-controls">
          <select
            aria-label="Privacy rule kind"
            className="settings-input"
            onChange={(event) => setRuleKind(event.target.value)}
            value={ruleKind}
          >
            <option value="protected_address">Protected address</option>
            <option value="protected_domain">Protected domain</option>
            <option value="blocked_address">Blocked address</option>
            <option value="blocked_domain">Blocked domain</option>
          </select>
          <Input
            aria-label="Privacy rule value"
            onChange={(event) => setRuleValue(event.target.value)}
            placeholder="buyer@example.com"
            value={ruleValue}
          />
          <Button
            disabled={busy || !ruleValue.trim()}
            onClick={() => void addRule()}
            type="button"
            variant="outline"
          >
            Add rule
          </Button>
        </div>
      </div>

      {rules.length > 0 ? (
        <ul className="settings-list">
          {rules.map((rule) => (
            <li className="settings-list-item" key={rule.id}>
              <span>
                {privacyRuleLabel(rule.kind)}: {rule.value}
              </span>
              <Button
                disabled={busy}
                onClick={() => void deleteCommunicationPrivacyRule(rule.id).then(() => refresh())}
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : accountEntered && rulesQuery.isPending && rulesQuery.data == null ? (
        <p className="settings-inline-notice">Loading privacy rules…</p>
      ) : accountEntered && rulesQuery.data != null ? (
        <p className="settings-inline-notice">{privacyRulesEmptyCopy()}</p>
      ) : null}

      {loadNotice ? (
        <div className="settings-row">
          <p className="settings-inline-notice">{loadNotice}</p>
          <Button
            onClick={() => void retryPrivacyLoad(policyQuery, rulesQuery)}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : null}

      {status ? <p className="settings-inline-notice">{status}</p> : null}
    </div>
  );
}
