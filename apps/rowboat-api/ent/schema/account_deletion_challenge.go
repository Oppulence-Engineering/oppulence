package schema

import (
	"entgo.io/contrib/entgql"
	"entgo.io/contrib/entoas"
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/schema/mixin"
)

// AccountDeletionChallenge is the single-use ledger for account-deletion
// step-up. Typing DELETE confirms intent. This row is the authentication
// proof: it is minted only after a fresh identity challenge, expires quickly,
// and is consumed on the first deletion attempt so a stolen session cannot
// replay it.
//
// The plaintext one-time code and the step-up token are never stored. Only
// their SHA-256 hashes are.
type AccountDeletionChallenge struct{ ent.Schema }

// Annotations keeps the ledger off the public GraphQL and OpenAPI surfaces.
func (AccountDeletionChallenge) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entgql.Annotation{Skip: entgql.SkipAll},
		entoas.Skip(true),
	}
}

// Mixin applies user-tenant privacy, a UUID primary key, and timestamps.
func (AccountDeletionChallenge) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.UserTenantMixin{}}
}

// Fields of the challenge.
func (AccountDeletionChallenge) Fields() []ent.Field {
	return []ent.Field{
		// oauth_reauth or email_otp. The verify handler accepts only the
		// factor that was issued.
		field.String("method").NotEmpty().Immutable(),
		// auth_time on the session that asked for the challenge. A later
		// verify must present a strictly newer auth_time, so the session that
		// started the flow is not itself the proof.
		field.Int64("baseline_auth_time").Default(0).NonNegative(),
		// Snapshot of whether the identity provider had a second factor at
		// issue time. Email OTP cannot satisfy this.
		field.Bool("mfa_required").Default(false),
		field.String("code_hash").Optional().Nillable().Sensitive(),
		field.String("token_hash").Optional().Nillable().Sensitive(),
		field.Int("attempts").Default(0).NonNegative(),
		field.Time("expires_at"),
		field.Time("verified_at").Optional().Nillable(),
		field.Time("consumed_at").Optional().Nillable(),
	}
}

// Edges assigns the immutable owner. Deleting the user cascades the row.
func (AccountDeletionChallenge) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).Ref("account_deletion_challenges").Unique().Required().Immutable(),
	}
}

// Indexes supports expiry sweeps and the single-use token lookup.
func (AccountDeletionChallenge) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("expires_at"),
		index.Fields("token_hash").Unique().
			Annotations(entsql.IndexWhere("token_hash IS NOT NULL")),
	}
}
