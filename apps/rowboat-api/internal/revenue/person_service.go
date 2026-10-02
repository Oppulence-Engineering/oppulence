package revenue

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/person"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personattribute"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personinteractionstat"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personmergecandidate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/predicate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
)

// PersonFilter narrows a person listing.
type PersonFilter struct {
	Query  string
	Status string
	Limit  int
	Offset int
}

const defaultPersonLimit = 100

// PersonListPage is one people-directory page. HasMore is true only when
// another person exists past this page, so an exact page of 500 is not offered
// as if a 501st person were waiting.
type PersonListPage struct {
	Persons []*ent.Person
	HasMore bool
}

// ListPersons returns the workspace's canonical people, most recently active
// first. People who share that moment and the same name stay in id order, so
// the next page does not repeat one and skip another.
func (s *Service) ListPersons(
	ctx context.Context, u *ent.User, filter PersonFilter,
) (*PersonListPage, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	limit := filter.Limit
	if limit <= 0 || limit > 500 {
		limit = defaultPersonLimit
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	q := s.client.Person.Query().
		Where(person.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)))

	status := strings.TrimSpace(filter.Status)
	if status == "" {
		// A merged person is a tombstone. It stays addressable by id so an old
		// link still resolves, but it never appears in a list.
		status = "active"
	}
	if status != "all" {
		q = q.Where(person.StatusEQ(status))
	}
	if term := strings.TrimSpace(strings.ToLower(filter.Query)); term != "" {
		parts := []predicate.Person{
			person.DisplayNameContainsFold(term),
			person.PrimaryEmailContainsFold(term),
			person.OrgNameContainsFold(term),
			person.OrgDomainContainsFold(term),
			person.TitleContainsFold(term),
			person.SeniorityContainsFold(term),
			person.DepartmentContainsFold(term),
			person.LocationContainsFold(term),
			person.LinkedinURLContainsFold(term),
			personNormalizedContains(term),
		}
		if labels := personVisibleLabelMatch(term); labels != nil {
			parts = append(parts, labels)
		}
		q = q.Where(person.Or(parts...))
	}
	rows, err := q.
		Order(
			person.ByLastInteractionAt(sql.OrderDesc(), sql.OrderNullsLast()),
			person.ByDisplayName(),
			person.ByID(),
		).
		Limit(limit + 1).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	return &PersonListPage{Persons: rows, HasMore: hasMore}, nil
}

// personNormalizedContains matches the words a teammate sees. A domain stored
// as dogfood-label.example is shown as "Dogfood Label", and a role stored as
// revenue_operations is shown with a space. Those phrases have to find the
// person even though the stored value uses a hyphen, an underscore, or a dot.
func personNormalizedContains(term string) predicate.Person {
	needle := "%" + escapePersonSearchLike(normalizePersonSearch(term)) + "%"
	return predicate.Person(func(s *sql.Selector) {
		parts := make([]*sql.Predicate, 0, len(personSearchColumns))
		for _, field := range personSearchColumns {
			parts = append(parts, normalizedSearchLike(s, field, needle))
		}
		s.Where(sql.Or(parts...))
	})
}

// personVisibleLabelMatch matches words the directory prints from a code, not
// from the stored text. A blank title with seniority "ic" reads "Individual
// contributor". An empty profile reads "Not filled in". A saved LinkedIn page
// reads "View profile".
func personVisibleLabelMatch(term string) predicate.Person {
	needle := normalizePersonSearch(term)
	if needle == "" {
		return nil
	}
	var preds []predicate.Person
	if strings.Contains("individual contributor", needle) {
		preds = append(preds, person.And(
			personTextBlank(person.TitleIsNil, person.TitleEQ),
			person.SeniorityEQ("ic"),
		))
	}
	unfilled := strings.Contains("not filled in", needle)
	filled := strings.Contains("detail filled in", needle)
	switch {
	case unfilled && filled:
		preds = append(preds, personMatchAll())
	case unfilled:
		preds = append(preds, personUnfilled())
	case filled:
		preds = append(preds, person.Not(personUnfilled()))
	}
	if strings.Contains("view profile", needle) {
		preds = append(preds, person.And(
			person.LinkedinURLNotNil(),
			person.LinkedinURLNEQ(""),
		))
	}
	// The address sits under the name. A missing one is the words "No email".
	if strings.Contains("no email", needle) {
		preds = append(preds, personTextBlank(person.PrimaryEmailIsNil, person.PrimaryEmailEQ))
	}
	if n, ok := exactPersonDetailCount(needle); ok {
		preds = append(preds, personDetailCount(n))
	}
	if len(preds) == 0 {
		return nil
	}
	return person.Or(preds...)
}

// exactPersonDetailCount reads the Details cell. One fact is "1 detail filled
// in". Two or more are "2 details filled in".
func exactPersonDetailCount(needle string) (int, bool) {
	var n int
	if _, err := fmt.Sscanf(needle, "%d detail", &n); err != nil || n < 1 || n > 10 {
		return 0, false
	}
	noun := "details"
	if n == 1 {
		noun = "detail"
	}
	if needle != fmt.Sprintf("%d %s filled in", n, noun) {
		return 0, false
	}
	return n, true
}

func personDetailCount(n int) predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			fields := []string{
				person.FieldTitle,
				person.FieldSeniority,
				person.FieldOrgName,
				person.FieldOrgDomain,
				person.FieldLocation,
				person.FieldLinkedinURL,
				person.FieldDepartment,
				person.FieldTimezone,
				person.FieldLocale,
			}
			b.WriteString("(")
			for i, field := range fields {
				if i > 0 {
					b.WriteString(" + ")
				}
				column := s.C(field)
				b.WriteString(fmt.Sprintf(
					"(CASE WHEN %s IS NOT NULL AND %s <> '' THEN 1 ELSE 0 END)",
					column,
					column,
				))
			}
			employment := s.C(person.FieldEmploymentStatus)
			b.WriteString(fmt.Sprintf(
				" + (CASE WHEN %s IS NOT NULL AND %s <> '' AND %s <> 'unknown' THEN 1 ELSE 0 END)) = ",
				employment,
				employment,
				employment,
			))
			b.Arg(n)
		}))
	})
}

func personTextBlank(isNil func() predicate.Person, eq func(string) predicate.Person) predicate.Person {
	return person.Or(isNil(), eq(""))
}

// personUnfilled is the Details cell "Not filled in": no profile fact, and
// employment still unknown. A primary email is the address under the name,
// not one of those details.
func personUnfilled() predicate.Person {
	return person.And(
		personTextBlank(person.TitleIsNil, person.TitleEQ),
		personTextBlank(person.SeniorityIsNil, person.SeniorityEQ),
		personTextBlank(person.OrgNameIsNil, person.OrgNameEQ),
		personTextBlank(person.OrgDomainIsNil, person.OrgDomainEQ),
		personTextBlank(person.LocationIsNil, person.LocationEQ),
		personTextBlank(person.LinkedinURLIsNil, person.LinkedinURLEQ),
		personTextBlank(person.DepartmentIsNil, person.DepartmentEQ),
		personTextBlank(person.TimezoneIsNil, person.TimezoneEQ),
		personTextBlank(person.LocaleIsNil, person.LocaleEQ),
		person.Or(person.EmploymentStatusEQ("unknown"), person.EmploymentStatusEQ("")),
	)
}

func personMatchAll() predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) { b.WriteString("1 = 1") }))
	})
}

// personSearchColumns are the facts printed on the people directory: the
// person, their company, the role (title or seniority), department, and city.
var personSearchColumns = []string{
	person.FieldDisplayName,
	person.FieldPrimaryEmail,
	person.FieldOrgName,
	person.FieldOrgDomain,
	person.FieldTitle,
	person.FieldSeniority,
	person.FieldDepartment,
	person.FieldLocation,
}

// normalizedSearchLike compares a stored name after hyphens, underscores, and
// dots become spaces. Arg writes "?" on SQLite and "$n" on Postgres. A raw
// "?" is a JSON operator on Postgres, so ESCAPE is parsed as a type name.
func normalizedSearchLike(s *sql.Selector, field, needle string) *sql.Predicate {
	return sql.P(func(b *sql.Builder) {
		b.WriteString(fmt.Sprintf(
			"replace(replace(replace(lower(coalesce(%s, '')), '-', ' '), '_', ' '), '.', ' ') LIKE ",
			s.C(field),
		))
		b.Arg(needle)
		b.WriteString(" ESCAPE '!'")
	})
}

func normalizePersonSearch(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer("-", " ", "_", " ", ".", " ").Replace(value)
	return strings.Join(strings.Fields(value), " ")
}

func escapePersonSearchLike(value string) string {
	value = strings.ReplaceAll(value, "!", "!!")
	value = strings.ReplaceAll(value, "%", "!%")
	return strings.ReplaceAll(value, "_", "!_")
}

// GetPerson returns one canonical person, following a merge tombstone so an old
// link keeps resolving to the surviving record.
func (s *Service) GetPerson(ctx context.Context, u *ent.User, id uuid.UUID) (*ent.Person, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	p, err := s.client.Person.Query().
		Where(
			person.IDEQ(id),
			person.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID)),
		).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, fmt.Errorf("%w: person", ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	return followMergedPerson(ctx, s.client, p)
}

// PersonAttributes returns the full provenance ledger for a person, newest first.
// This is the answer to "why does it say that?" and includes retracted and
// superseded rows deliberately — an audit trail with the losers removed is not one.
func (s *Service) PersonAttributes(
	ctx context.Context, u *ent.User, id uuid.UUID,
) ([]*ent.PersonAttribute, error) {
	p, err := s.GetPerson(ctx, u, id)
	if err != nil {
		return nil, err
	}
	attributes, err := s.client.PersonAttribute.Query().
		Where(personattribute.HasPersonWith(person.IDEQ(p.ID))).
		Order(
			ent.Desc(personattribute.FieldValidFrom),
			ent.Asc(personattribute.FieldDimension),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return dedupePersonAttributes(attributes), nil
}

// dedupePersonAttributes collapses exact facts written by both the historical
// Gmail scan path and the observation path. Distinct claims remain in the ledger.
func dedupePersonAttributes(attributes []*ent.PersonAttribute) []*ent.PersonAttribute {
	seen := make(map[string]int, len(attributes))
	out := make([]*ent.PersonAttribute, 0, len(attributes))
	for _, attribute := range attributes {
		key := strings.Join([]string{
			attribute.Dimension, attribute.Value, attribute.SourceType, attribute.Source,
			attribute.Extractor, attribute.Status, strconv.FormatFloat(attribute.Confidence, 'g', -1, 64),
			attribute.Reason, attribute.ObservedAt.UTC().Format(time.RFC3339Nano),
			attribute.ValidFrom.UTC().Format(time.RFC3339Nano), optionalTime(attribute.ValidTo),
			optionalTime(attribute.RetractedAt), attribute.SupersedesAttributeID,
			attribute.ExtractorVersion, attribute.CitationsJSON,
		}, "\x00")
		if i, ok := seen[key]; ok {
			if len(out[i].SupportingObservationIds) == 0 && len(attribute.SupportingObservationIds) > 0 {
				out[i] = attribute
			}
			continue
		}
		seen[key] = len(out)
		out = append(out, attribute)
	}
	return out
}

func optionalTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

// PersonInteractions returns the per-account interaction rollups for a person.
func (s *Service) PersonInteractions(
	ctx context.Context, u *ent.User, id uuid.UUID,
) ([]*ent.PersonInteractionStat, error) {
	p, err := s.GetPerson(ctx, u, id)
	if err != nil {
		return nil, err
	}
	return s.client.PersonInteractionStat.Query().
		Where(personinteractionstat.HasPersonWith(person.IDEQ(p.ID))).
		WithRelationship().
		Order(ent.Desc(personinteractionstat.FieldLastInteractionAt)).
		All(ctx)
}

// PersonCorrectionInput is a human overriding a derived value.
type PersonCorrectionInput struct {
	Dimension      string `json:"dimension"`
	Value          string `json:"value"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"-"`
}

// CorrectPerson records a user correction and reprojects.
//
// A correction is an assertion like any other, not a direct write: it enters the
// same ledger at the top of the precedence order, so the previous value stays
// visible and the change stays explicable.
func (s *Service) CorrectPerson(
	ctx context.Context, u *ent.User, id uuid.UUID, input PersonCorrectionInput,
) (*ent.Person, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceContribute)
	if err != nil {
		return nil, err
	}
	p, err := s.GetPerson(ctx, u, id)
	if err != nil {
		return nil, err
	}
	dimension := strings.TrimSpace(input.Dimension)
	value := strings.TrimSpace(input.Value)
	if dimension == "" || value == "" {
		return nil, fmt.Errorf("%w: dimension and value are required", ErrInvalidInput)
	}
	now := s.now()
	externalID := strings.TrimSpace(input.IdempotencyKey)
	if externalID == "" {
		externalID = "correction:" + now.UTC().Format(time.RFC3339Nano)
	}
	if err := upsertPersonAttributes(ctx, s.client, ws, u, p, nil, []PersonAttributeInput{{
		Dimension:  dimension,
		Value:      value,
		SourceType: "user_correction",
		Source:     "user",
		Extractor:  "user_entry",
		Confidence: 1,
		Reason:     input.Reason,
		ObservedAt: now,
		ExternalID: externalID,
	}}); err != nil {
		return nil, err
	}
	return projectPersonAttributes(ctx, s.client, p, now)
}

// RetractPersonAttribute withdraws one claim and reprojects without it.
// The row is marked retracted rather than deleted, so the ledger stays complete.
func (s *Service) RetractPersonAttribute(
	ctx context.Context, u *ent.User, personID, attributeID uuid.UUID, reason string,
) (*ent.Person, error) {
	if _, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceContribute); err != nil {
		return nil, err
	}
	p, err := s.GetPerson(ctx, u, personID)
	if err != nil {
		return nil, err
	}
	attribute, err := s.client.PersonAttribute.Query().
		Where(
			personattribute.IDEQ(attributeID),
			personattribute.HasPersonWith(person.IDEQ(p.ID)),
		).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, fmt.Errorf("%w: person attribute", ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	if attribute.Status == "retracted" {
		return p, nil
	}
	now := s.now()
	update := attribute.Update().SetStatus("retracted").SetRetractedAt(now.UTC())
	if strings.TrimSpace(reason) != "" {
		update.SetReason(reason)
	}
	if _, err := update.Save(ctx); err != nil {
		return nil, err
	}
	return projectPersonAttributes(ctx, s.client, p, now)
}

// ListPersonMergeCandidates returns people an anchor says might be the same human.
func (s *Service) ListPersonMergeCandidates(
	ctx context.Context, u *ent.User, status string,
) ([]*ent.PersonMergeCandidate, error) {
	ws, err := s.currentWorkspaceWithCapability(ctx, u, WorkspaceView)
	if err != nil {
		return nil, err
	}
	q := s.client.PersonMergeCandidate.Query().
		Where(personmergecandidate.HasWorkspaceWith(revenueworkspace.IDEQ(ws.ID))).
		WithProposedPerson().
		WithExistingPerson()
	if status = strings.TrimSpace(status); status != "" && status != "all" {
		q = q.Where(personmergecandidate.StatusEQ(status))
	}
	return q.Order(ent.Desc(personmergecandidate.FieldCreatedAt)).All(ctx)
}
