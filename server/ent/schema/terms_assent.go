package schema

import (
	"entgo.io/contrib/entgql"
	"entgo.io/contrib/entoas"
	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/schema/mixin"
)

// TermsAssent records that a verified sign-in accepted a published Terms
// version. The sign-in page says continuing is agreement. The row holds the
// version and the time, not a date of birth. It cascades with the user
// because it is not a tax or dispute record.
type TermsAssent struct{ ent.Schema }

// Annotations keeps assent off the public API.
func (TermsAssent) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entgql.Annotation{Skip: entgql.SkipAll},
		entoas.Skip(true),
	}
}

// Mixin scopes the row to its user. The auth middleware writes it with an
// internal context because first-sight provisioning has no viewer yet.
func (TermsAssent) Mixin() []ent.Mixin { return []ent.Mixin{mixin.UserTenantMixin{}} }

// Fields are the published version and the moment it was accepted.
func (TermsAssent) Fields() []ent.Field {
	return []ent.Field{
		field.String("terms_version").NotEmpty().Immutable(),
		field.Time("accepted_at").Immutable(),
	}
}

// Edges point at the user who accepted. The foreign key lives on this table.
func (TermsAssent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).Ref("terms_assents").Unique().Required().Immutable(),
	}
}

// Indexes record each published version once per user.
func (TermsAssent) Indexes() []ent.Index {
	return []ent.Index{
		index.Edges("user").Fields("terms_version").Unique(),
	}
}
