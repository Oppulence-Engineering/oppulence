package schema

import (
	"entgo.io/contrib/entgql"
	"entgo.io/contrib/entoas"
	"entgo.io/contrib/entproto"
	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/schema/mixin"
)

// BillingRetention keeps the subscription facts the privacy policy says we
// retain for tax, accounting, and dispute resolution after the account is
// deleted. It has no user edge, so account deletion cannot cascade it away,
// and it stores no email and no card data. Invoice amounts stay in Stripe,
// reachable through the customer id copied here. The subscription row itself
// has no charged amount or service period beyond an optional trial end.
type BillingRetention struct{ ent.Schema }

// Annotations keeps the ledger off the public API. It is an internal tax
// record, not a client resource.
func (BillingRetention) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entgql.Annotation{Skip: entgql.SkipAll},
		entoas.Skip(true),
		entproto.Skip(),
	}
}

// Mixin attaches the shared id and timestamps.
func (BillingRetention) Mixin() []ent.Mixin { return []ent.Mixin{mixin.BaseMixin{}} }

// Fields are the subscription columns that exist at deletion time.
func (BillingRetention) Fields() []ent.Field {
	return []ent.Field{
		field.String("plan").NotEmpty().Immutable(),
		field.String("status").NotEmpty().Immutable(),
		field.String("stripe_customer_id").Optional().Immutable(),
		field.String("stripe_subscription_id").Optional().Immutable(),
		field.Time("trial_expires_at").Optional().Nillable().Immutable(),
		field.Time("retained_at").Immutable(),
	}
}
