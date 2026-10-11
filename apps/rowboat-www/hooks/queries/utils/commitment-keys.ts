export type CommitmentRegisterScope = {
  view: string;
  accountId: string;
  owner: string;
  includeCandidates: boolean;
  /** Set when home asked for the past-due slice. Empty means the view's own query. */
  dueBefore?: string;
};

export const commitmentKeys = {
  all: ["commitment"] as const,
  lists: () => [...commitmentKeys.all, "list"] as const,
  register: (scope: CommitmentRegisterScope) =>
    [...commitmentKeys.lists(), "register", scope] as const,
};

export const COMMITMENT_REGISTER_STALE_TIME = 15_000;
