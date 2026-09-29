-- Tax and dispute facts that must survive account deletion. The table has no
-- user foreign key and no email: the cascade that removes the account cannot
-- remove it, and the row is not a copy of the person.
CREATE TABLE "billing_retentions" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "plan" character varying NOT NULL,
  "status" character varying NOT NULL,
  "stripe_customer_id" character varying NULL,
  "stripe_subscription_id" character varying NULL,
  "trial_expires_at" timestamptz NULL,
  "retained_at" timestamptz NOT NULL,
  PRIMARY KEY ("id")
);

-- First sign-in records the published Terms version. Accounts that already
-- exist get a row on their next authenticated request. The foreign key
-- cascades with the user; this is not a tax record.
CREATE TABLE "terms_assents" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "terms_version" character varying NOT NULL,
  "accepted_at" timestamptz NOT NULL,
  "user_terms_assents" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "terms_assents_users_terms_assents"
    FOREIGN KEY ("user_terms_assents") REFERENCES "users" ("id")
    ON UPDATE NO ACTION ON DELETE CASCADE
);
CREATE UNIQUE INDEX "termsassent_terms_version_user_terms_assents"
  ON "terms_assents" ("terms_version", "user_terms_assents");
