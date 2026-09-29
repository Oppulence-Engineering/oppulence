-- Single-use ledger for account-deletion step-up. The plaintext code and the
-- step-up token are never stored; only their hashes are. Deleting the user
-- cascades the rows so a finished account does not keep proof material.
CREATE TABLE "account_deletion_challenges" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "method" varchar NOT NULL,
  "baseline_auth_time" bigint NOT NULL DEFAULT 0,
  "mfa_required" boolean NOT NULL DEFAULT false,
  "code_hash" varchar NULL,
  "token_hash" varchar NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz NULL,
  "consumed_at" timestamptz NULL,
  "user_account_deletion_challenges" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "account_deletion_challenges_users_account_deletion_challenges"
    FOREIGN KEY ("user_account_deletion_challenges") REFERENCES "users" ("id")
    ON UPDATE NO ACTION ON DELETE CASCADE
);
CREATE INDEX "accountdeletionchallenge_expires_at"
  ON "account_deletion_challenges" ("expires_at");
CREATE UNIQUE INDEX "accountdeletionchallenge_token_hash"
  ON "account_deletion_challenges" ("token_hash")
  WHERE "token_hash" IS NOT NULL;
