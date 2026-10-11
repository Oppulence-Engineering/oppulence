package revenue

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/person"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personattribute"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personinteractionstat"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/personmergecandidate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/predicate"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/relationshipparticipant"
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

// personDirectoryPage is the people list the directory requests. The button
// "Show the next people" stays hidden when that page is the whole list.
const personDirectoryPage = 500

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
			person.TimezoneContainsFold(term),
			person.LocaleContainsFold(term),
			personNormalizedContains(term),
			personAliasContains(term),
			personParticipantRoleMatch(term),
		}
		if labels := personVisibleLabelMatch(term); labels != nil {
			parts = append(parts, labels)
		}
		// The directory button is "Show the next people" only when another
		// active person sits past this page. A full page of 500 is the whole list.
		if labelPhraseMatches("show the next people", normalizePersonSearch(term)) {
			parts = append(parts, personDirectoryHasAnotherPage())
		}
		q = q.Where(person.Or(parts...))
	}
	rows, err := q.
		WithParticipants().
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

func personDirectoryHasAnotherPage() predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString("(SELECT COUNT(*) FROM ")
			b.WriteString(person.Table)
			b.WriteString(" AS directory WHERE directory.")
			b.WriteString(person.WorkspaceColumn)
			b.WriteString(" = ")
			b.WriteString(s.C(person.WorkspaceColumn))
			b.WriteString(" AND directory.")
			b.WriteString(person.FieldStatus)
			b.WriteString(" = ")
			b.Arg("active")
			b.WriteString(") > ")
			b.Arg(personDirectoryPage)
		}))
	})
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
	if labelPhraseMatches("individual contributor", needle) {
		preds = append(preds, personPrintsIndividualContributor())
	}
	// "filled" and "filled in" sit inside both "Not filled in" and "1 detail
	// filled in". Treating the word as both labels returned every person.
	// A numbered cell is handled on its own, so "1 detail filled in" stays
	// that count.
	if _, counted := exactPersonDetailCount(needle); !counted {
		unfilled := labelPhraseMatches("not filled in", needle)
		filled := labelPhraseMatches("detail filled in", needle) || labelPhraseMatches("details filled in", needle)
		switch {
		case unfilled && filled:
			preds = append(preds, personMatchAll())
		case unfilled:
			preds = append(preds, personUnfilled())
		case filled:
			preds = append(preds, person.Not(personUnfilled()))
		}
	}
	if labelPhraseMatches("view profile", needle) {
		preds = append(preds, personPrintsViewProfile())
	}
	// The address sits under the name. A missing one is the words "No email".
	// Spaces are the same as no address. The word "email" is not that sentence.
	if labelPhraseMatches("no email", needle) {
		preds = append(preds, personTextMissing(person.FieldPrimaryEmail))
	}
	// Another name is printed as "Also known as". The stored list is JSON.
	if labelPhraseMatches("also known as", needle) {
		preds = append(preds, personHasAlias())
	}
	// A departed person is badged "Left the company". The stored token is departed.
	if labelPhraseMatches("left the company", needle) {
		preds = append(preds, person.EmploymentStatusEQ("departed"))
	}
	// The employment line says Current. The stored status is active. The word
	// is short, so only the whole label matches.
	if sheetPhraseMatches("current", needle) {
		preds = append(preds, person.EmploymentStatusEQ("active"))
	}
	// "Not known" is the empty company, role, department, location, profile, and
	// last interaction. One blank fact is enough for the row or the sheet to say it.
	if labelPhraseMatches("not known", needle) {
		preds = append(preds, personPrintsNotKnown())
	}
	// "Where details came from" is empty until a fact other than the name exists.
	// A typed fact says "Added by you". A signature says where it was read.
	if evidence := personSheetEvidenceMatch(needle); evidence != nil {
		preds = append(preds, evidence)
	}
	if n, ok := exactPersonDetailCount(needle); ok {
		preds = append(preds, personDetailCount(n))
	}
	// The Companies column is only the number. "1" has to find that count.
	if n, ok := exactPersonCompanyCount(needle); ok {
		preds = append(preds, person.RelationshipCountEQ(n))
	}
	if window, ok := visibleActivityWindow(needle, time.Now()); ok {
		preds = append(preds, person.And(
			person.LastInteractionAtNotNil(),
			person.LastInteractionAtGT(window.after),
			person.LastInteractionAtLTE(window.until),
		))
	}
	if len(preds) == 0 {
		return nil
	}
	return person.Or(preds...)
}

// personEvidenceExtractorPhrases are the sentences under a fact when the
// extractor is named and the teammate did not type it. The sheet prefers
// these over the source name.
var personEvidenceExtractorPhrases = map[string]string{
	"email_signature":      "from their email signature",
	"email_header":         "from an email header",
	"calendar_invite":      "from a calendar invite",
	"transcript_intro":     "from a transcript",
	"crm_field":            "from the crm",
	"display_name_header":  "from the name on the record",
	"mail_delivery_report": "their mail server reported this",
	"parallel":             "from public web research",
}

// personEvidenceSourcePhrases are the fallback sentences when the extractor
// has no phrase of its own. A user-typed fact is "Added by you" instead.
var personEvidenceSourcePhrases = map[string]string{
	"gmail":        "gmail",
	"calendar":     "calendar",
	"slack":        "slack",
	"hubspot":      "hubspot",
	"meeting":      "a meeting",
	"desktop_note": "a note",
	"voice_note":   "a voice note",
	"browser":      "the browser",
	"crm":          "the crm",
	"web":          "the web",
}

func personEvidenceLabeledExtractors() []string {
	extractors := make([]string, 0, len(personEvidenceExtractorPhrases)+1)
	for extractor := range personEvidenceExtractorPhrases {
		extractors = append(extractors, extractor)
	}
	// user_entry prints "Added by you" even when the source is not user.
	extractors = append(extractors, "user_entry")
	return extractors
}

// personSheetEvidenceMatch matches the provenance section. A short fragment
// such as "details" or "you" is not enough, because those letters sit inside
// the sentence without being the sentence a teammate typed.
func personSheetEvidenceMatch(needle string) predicate.Person {
	var preds []predicate.Person
	if sheetPhraseMatches("no extra details yet", needle) {
		preds = append(preds, person.Not(personHasVisibleEvidence()))
	}
	if sheetPhraseMatches("added by you", needle) {
		preds = append(preds, personEvidenceAddedByYou())
	}
	for extractor, phrase := range personEvidenceExtractorPhrases {
		if sheetPhraseMatches(phrase, needle) {
			preds = append(preds, personEvidenceByExtractor(extractor))
		}
	}
	for source, phrase := range personEvidenceSourcePhrases {
		if sheetPhraseMatches(phrase, needle) {
			preds = append(preds, personEvidenceBySource(source))
		}
	}
	if sheetPhraseMatches("recorded in this workspace", needle) {
		preds = append(preds, personEvidenceRecordedHere())
	}
	// The evidence row says "80% confidence". The word alone is not that badge.
	if percent, ok := printedConfidencePercent(needle); ok {
		preds = append(preds, personPrintsEvidenceConfidence(percent))
	}
	// A saved http(s) citation is "Verify source 1". The word "source" is not that link.
	if count, ok := verifySourceMinimum(needle); ok {
		preds = append(preds, personPrintsVerifySource(count))
	}
	if len(preds) == 0 {
		return nil
	}
	return person.Or(preds...)
}

// printedConfidencePercent reads the badge "N% confidence". A fragment such
// as "confidence" or "80%" is not the badge. The number is the rounded percent.
func printedConfidencePercent(needle string) (int, bool) {
	text := normalizePersonSearch(needle)
	const marker = "% confidence"
	index := strings.Index(text, marker)
	if index <= 0 {
		return 0, false
	}
	end := index + len(marker)
	if end < len(text) {
		switch text[end] {
		case ' ', '.', ',', ';', '?', ':':
		default:
			return 0, false
		}
	}
	start := index
	for start > 0 && text[start-1] >= '0' && text[start-1] <= '9' {
		start--
	}
	if start == index {
		return 0, false
	}
	if start > 0 && text[start-1] != ' ' {
		return 0, false
	}
	raw := text[start:index]
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 || n > 100 || raw != strconv.Itoa(n) {
		return 0, false
	}
	return n, true
}

func personAttributeConfidencePercent(percent int) predicate.PersonAttribute {
	return predicate.PersonAttribute(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(personattribute.FieldConfidence)
			// The badge is Math.round(confidence * 100). Postgres round() takes
			// numeric; SQLite round() takes the stored real.
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("CAST(ROUND((%s)::numeric * 100) AS INTEGER) = ", column))
			} else {
				b.WriteString(fmt.Sprintf("CAST(ROUND(%s * 100) AS INTEGER) = ", column))
			}
			b.Arg(percent)
		}))
	})
}

// personPrintsEvidenceConfidence matches a fact the person sheet lists.
// The name and aliases are not that list, and a retracted fact is gone.
func personPrintsEvidenceConfidence(percent int) predicate.Person {
	return person.HasAttributesWith(append(
		visiblePersonEvidence(),
		personAttributeConfidencePercent(percent),
	)...)
}

// personPrintsResearchConfidence matches the percent on a company people card.
// That card lists public research that has not been retracted.
func personPrintsResearchConfidence(percent int) predicate.Person {
	return person.HasAttributesWith(
		personattribute.SourceTypeEQ("external_research"),
		personattribute.StatusNEQ("retracted"),
		personAttributeConfidencePercent(percent),
	)
}

// verifySourceMinimum reads "Verify source" and "Verify source N". The first
// link is always Verify source 1. A fragment such as "source" is not the link.
func verifySourceMinimum(needle string) (int, bool) {
	text := normalizePersonSearch(needle)
	const phrase = "verify source"
	index := strings.Index(text, phrase)
	if index < 0 {
		return 0, false
	}
	if index > 0 && text[index-1] != ' ' {
		return 0, false
	}
	rest := text[index+len(phrase):]
	if rest == "" {
		return 1, true
	}
	switch rest[0] {
	case ' ', '.', ',', ';', '?', ':':
	default:
		return 0, false
	}
	rest = strings.TrimLeft(rest, " .,;?:")
	if rest == "" {
		return 1, true
	}
	word := strings.TrimRight(strings.Fields(rest)[0], ".,;:?")
	n, err := strconv.Atoi(word)
	if err != nil {
		return 1, true
	}
	if n < 1 || n > 20 || word != strconv.Itoa(n) {
		return 0, false
	}
	return n, true
}

func personAttributeWebCitationCountAtLeast(min int) predicate.PersonAttribute {
	return predicate.PersonAttribute(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(personattribute.FieldCitationsJSON)
			text := column
			if s.Dialect() == dialect.Postgres {
				text = fmt.Sprintf("lower(%s::text)", column)
			} else {
				text = fmt.Sprintf("lower(coalesce(%s, ''))", column)
			}
			// https:// does not contain http://, so both schemes are counted.
			b.WriteString("((")
			b.WriteString(fmt.Sprintf("(length(%s) - length(replace(%s, 'https://', ''))) / 8", text, text))
			b.WriteString(" + ")
			b.WriteString(fmt.Sprintf("(length(%s) - length(replace(%s, 'http://', ''))) / 7", text, text))
			b.WriteString(") >= ")
			b.Arg(min)
			b.WriteString(")")
		}))
	})
}

// personPrintsVerifySource matches a citation the person sheet can open.
// The name and aliases are not that list, and a retracted fact is gone.
func personPrintsVerifySource(min int) predicate.Person {
	return person.HasAttributesWith(append(
		visiblePersonEvidence(),
		personAttributeWebCitationCountAtLeast(min),
	)...)
}

// personPrintsResearchVerifySource matches the citation on a company people card.
// That card lists public research that has not been retracted.
func personPrintsResearchVerifySource(min int) predicate.Person {
	return person.HasAttributesWith(
		personattribute.SourceTypeEQ("external_research"),
		personattribute.StatusNEQ("retracted"),
		personAttributeWebCitationCountAtLeast(min),
	)
}

func visiblePersonEvidence(extra ...predicate.PersonAttribute) []predicate.PersonAttribute {
	base := []predicate.PersonAttribute{
		personattribute.StatusEQ("active"),
		personattribute.DimensionNotIn("display_name", "alias"),
	}
	return append(base, extra...)
}

func personHasVisibleEvidence() predicate.Person {
	return person.HasAttributesWith(visiblePersonEvidence()...)
}

func personEvidenceAddedByYou() predicate.Person {
	return person.Or(
		person.HasAttributesWith(visiblePersonEvidence(personattribute.SourceEQ("user"))...),
		person.HasAttributesWith(visiblePersonEvidence(
			personattribute.SourceNEQ("user"),
			personattribute.ExtractorEQ("user_entry"),
		)...),
	)
}

func personEvidenceByExtractor(extractor string) predicate.Person {
	return person.HasAttributesWith(visiblePersonEvidence(
		personattribute.SourceNEQ("user"),
		personattribute.ExtractorEQ(extractor),
	)...)
}

func personEvidenceBySource(source string) predicate.Person {
	return person.HasAttributesWith(visiblePersonEvidence(
		personattribute.SourceEQ(source),
		personattribute.ExtractorNotIn(personEvidenceLabeledExtractors()...),
	)...)
}

func personEvidenceRecordedHere() predicate.Person {
	return person.HasAttributesWith(visiblePersonEvidence(
		personattribute.SourceNotIn(
			"gmail", "calendar", "slack", "hubspot", "meeting",
			"desktop_note", "voice_note", "browser", "crm", "user", "web",
		),
		personattribute.ExtractorNotIn(personEvidenceLabeledExtractors()...),
	)...)
}

// relativeLabelWindow is the timestamp range that relativeTime prints as this
// phrase. "3 days ago" and "3 days from now" are the Last interaction cell,
// not a stored string. A meeting that has not happened yet still lands in
// that cell, so the future phrase has to find the same row.
func relativeLabelWindow(needle string, now time.Time) (relativeWindow, bool) {
	past := strings.HasSuffix(needle, " ago")
	future := strings.HasSuffix(needle, " from now")
	rest := ""
	switch {
	case past:
		rest = strings.TrimSuffix(needle, " ago")
	case future:
		rest = strings.TrimSuffix(needle, " from now")
	default:
		return relativeWindow{}, false
	}
	var n int
	var unit string
	if _, err := fmt.Sscanf(rest, "%d %s", &n, &unit); err != nil || fmt.Sprintf("%d %s", n, unit) != rest {
		return relativeWindow{}, false
	}
	base := strings.TrimSuffix(unit, "s")
	if base == "min" && unit != "min" && unit != "mins" {
		return relativeWindow{}, false
	}
	step, cap, ok := relativeStep(base)
	if !ok || n < 1 {
		return relativeWindow{}, false
	}
	want := base
	if n != 1 {
		want = base + "s"
	}
	if unit != want || n > relativeMax(base) {
		return relativeWindow{}, false
	}
	minAbs := time.Duration(n)*step - step/2
	maxAbs := time.Duration(n)*step + step/2
	if n == 1 {
		minAbs = step
		if base == "min" {
			minAbs = 0
		}
	}
	if maxAbs > cap {
		maxAbs = cap
	}
	if minAbs >= cap {
		return relativeWindow{}, false
	}
	if future {
		// The present itself reads "1 min ago". A future phrase starts after now
		// when the bucket includes the present, and the far edge belongs to the
		// next phrase: 3.5 days rounds to "4 days from now".
		after := now.Add(minAbs)
		if minAbs > 0 {
			after = after.Add(-time.Nanosecond)
		}
		return relativeWindow{after: after, until: now.Add(maxAbs).Add(-time.Nanosecond)}, true
	}
	return relativeWindow{after: now.Add(-maxAbs), until: now.Add(-minAbs)}, true
}

func relativeStep(base string) (step, cap time.Duration, ok bool) {
	switch base {
	case "min":
		return time.Minute, time.Hour, true
	case "hour":
		return time.Hour, 24 * time.Hour, true
	case "day":
		return 24 * time.Hour, 30 * 24 * time.Hour, true
	default:
		return 0, 0, false
	}
}

func relativeMax(base string) int {
	switch base {
	case "min":
		return 60
	case "hour":
		return 24
	case "day":
		return 30
	default:
		return 0
	}
}

// visibleActivityWindow is the range whose Last interaction cell prints this
// phrase. The first 30 days stay relative ("3 days ago"). A touch further
// away prints the calendar day, and that day has to find the same row.
func visibleActivityWindow(needle string, now time.Time) (relativeWindow, bool) {
	if window, ok := relativeLabelWindow(needle, now); ok {
		return window, true
	}
	return calendarLabelWindow(needle, now)
}

// calendarLabelWindow matches the date relativeTime prints once an instant is
// at least 30 days from now. The cell is "Sep 3, 2026", including when the
// query arrives lowercased. A day still inside that 30-day stretch is labeled
// "N days ago", so this phrase does not claim it.
func calendarLabelWindow(needle string, now time.Time) (relativeWindow, bool) {
	parsed, ok := parseCalendarLabel(needle)
	if !ok {
		return relativeWindow{}, false
	}
	loc := now.Location()
	start := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, loc)
	end := time.Date(start.Year(), start.Month(), start.Day()+1, 0, 0, 0, 0, loc)
	last := end.Add(-time.Nanosecond)
	pastCut := now.Add(-30 * 24 * time.Hour)
	futureCut := now.Add(30 * 24 * time.Hour)
	switch {
	case !last.After(pastCut):
		return relativeWindow{after: start.Add(-time.Nanosecond), until: last}, true
	case !start.After(pastCut):
		return relativeWindow{after: start.Add(-time.Nanosecond), until: pastCut}, true
	case !start.Before(futureCut):
		return relativeWindow{after: start.Add(-time.Nanosecond), until: last}, true
	case !last.Before(futureCut):
		return relativeWindow{after: futureCut.Add(-time.Nanosecond), until: last}, true
	default:
		return relativeWindow{}, false
	}
}

func parseCalendarLabel(needle string) (time.Time, bool) {
	fields := strings.Fields(needle)
	if len(fields) != 3 {
		return time.Time{}, false
	}
	month := fields[0]
	if month == "" {
		return time.Time{}, false
	}
	month = strings.ToUpper(month[:1]) + strings.ToLower(month[1:])
	dayText := strings.TrimSuffix(fields[1], ",")
	day, err := strconv.Atoi(dayText)
	if err != nil || strconv.Itoa(day) != dayText && fmt.Sprintf("%02d", day) != dayText {
		return time.Time{}, false
	}
	yearText := fields[2]
	year, err := strconv.Atoi(yearText)
	if err != nil || len(yearText) != 4 || strconv.Itoa(year) != yearText {
		return time.Time{}, false
	}
	candidate := fmt.Sprintf("%s %d, %d", month, day, year)
	parsed, err := time.Parse("Jan 2, 2006", candidate)
	if err != nil || parsed.Format("Jan 2, 2006") != candidate {
		return time.Time{}, false
	}
	return parsed, true
}

// relativeWindow is the open-closed range callers compare with GT(after) and
// LTE(until). A past label is exclusive on the older side and inclusive on
// the newer side. A future label keeps the near edge and leaves the far edge
// for the next phrase, which is what relativeTime prints.
type relativeWindow struct {
	after time.Time
	until time.Time
}

// exactPersonCompanyCount reads the Companies column. The cell is the number
// itself, so the whole query has to be that number. "1 detail filled in" is
// the Details cell, not a company count of 1.
func exactPersonCompanyCount(needle string) (int, bool) {
	if needle == "" || needle[0] < '0' || needle[0] > '9' {
		return 0, false
	}
	n, err := strconv.Atoi(needle)
	if err != nil || strconv.Itoa(n) != needle {
		return 0, false
	}
	return n, true
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
					"(CASE WHEN trim(coalesce(%s, '')) <> '' THEN 1 ELSE 0 END)",
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

// personUnfilled is the Details cell "Not filled in": no profile fact, and
// employment still unknown. A primary email is the address under the name,
// not one of those details. Spaces are not a fact.
func personUnfilled() predicate.Person {
	return person.And(
		personTextMissing(person.FieldTitle),
		personTextMissing(person.FieldSeniority),
		personTextMissing(person.FieldOrgName),
		personTextMissing(person.FieldOrgDomain),
		personTextMissing(person.FieldLocation),
		personTextMissing(person.FieldLinkedinURL),
		personTextMissing(person.FieldDepartment),
		personTextMissing(person.FieldTimezone),
		personTextMissing(person.FieldLocale),
		person.Or(person.EmploymentStatusEQ("unknown"), person.EmploymentStatusEQ("")),
	)
}

// personPrintsIndividualContributor is a blank title with seniority "ic".
// The Role cell then says "Individual contributor".
func personPrintsIndividualContributor() predicate.Person {
	return person.And(
		personTextMissing(person.FieldTitle),
		predicate.Person(func(s *sql.Selector) {
			s.Where(sql.P(func(b *sql.Builder) {
				b.WriteString(fmt.Sprintf(
					"lower(trim(coalesce(%s, ''))) = 'ic'",
					s.C(person.FieldSeniority),
				))
			}))
		}),
	)
}

// personPrintsViewProfile is the LinkedIn cell "View profile". A web address
// qualifies. Spaces and another scheme, such as javascript:, do not.
func personPrintsViewProfile() predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			trimmed := fmt.Sprintf("trim(coalesce(%s, ''))", s.C(person.FieldLinkedinURL))
			colon := "instr"
			if s.Dialect() == dialect.Postgres {
				colon = "strpos"
			}
			b.WriteString(fmt.Sprintf(
				"%s <> '' AND (lower(%s) LIKE 'http://%%' OR lower(%s) LIKE 'https://%%' OR %s(%s, ':') = 0)",
				trimmed, trimmed, trimmed, colon, trimmed,
			))
		}))
	})
}

func personMatchAll() predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) { b.WriteString("1 = 1") }))
	})
}

// personParticipantRoleMatch matches the role printed on the person, such as
// "Decision maker". The stored token uses underscores. The row uses spaces.
func personPrintsNotKnown() predicate.Person {
	return person.Or(
		person.Not(personRoleKnown()),
		personTextMissing(person.FieldTitle),
		personTextMissing(person.FieldSeniority),
		personTextMissing(person.FieldOrgName),
		personTextMissing(person.FieldOrgDomain),
		personTextMissing(person.FieldDepartment),
		personTextMissing(person.FieldLocation),
		personTextMissing(person.FieldLinkedinURL),
		personTextMissing(person.FieldTimezone),
		person.LastInteractionAtIsNil(),
	)
}

func personTextMissing(field string) predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) = ''", s.C(field)))
		}))
	})
}

func personRoleKnown() predicate.Person {
	return person.Or(
		personTextPresent(person.FieldTitle),
		personTextPresent(person.FieldSeniority),
		person.HasParticipantsWith(participantRolePresent()),
	)
}

func personTextPresent(field string) predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf("trim(coalesce(%s, '')) <> ''", s.C(field)))
		}))
	})
}

func participantRolePresent() predicate.RelationshipParticipant {
	return predicate.RelationshipParticipant(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			b.WriteString(fmt.Sprintf(
				"trim(coalesce(%s, '')) <> ''",
				s.C(relationshipparticipant.FieldRole),
			))
		}))
	})
}

func personParticipantRoleMatch(term string) predicate.Person {
	needle := "%" + escapePersonSearchLike(normalizePersonSearch(term)) + "%"
	if needle == "%%" {
		return nil
	}
	return person.HasParticipantsWith(predicate.RelationshipParticipant(func(s *sql.Selector) {
		s.Where(normalizedSearchLike(s, relationshipparticipant.FieldRole, needle))
	}))
}

// personAliasContains matches another name printed under the person. The
// names live in one JSON list, so the search reads that list as text.
func personAliasContains(term string) predicate.Person {
	needle := "%" + escapePersonSearchLike(strings.ToLower(strings.TrimSpace(term))) + "%"
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(person.FieldAliases)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf("lower(%s::text) LIKE ", column))
			} else {
				b.WriteString(fmt.Sprintf("lower(coalesce(%s, '')) LIKE ", column))
			}
			b.Arg(needle)
			b.WriteString(" ESCAPE '!'")
		}))
	})
}

// personHasAlias is a person whose row says "Also known as". A list of blank
// names is the same as no list.
func personHasAlias() predicate.Person {
	return predicate.Person(func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			column := s.C(person.FieldAliases)
			if s.Dialect() == dialect.Postgres {
				b.WriteString(fmt.Sprintf(
					"EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(%s, '[]'::jsonb)) AS alias WHERE trim(alias) <> '')",
					column,
				))
				return
			}
			b.WriteString(fmt.Sprintf(
				"EXISTS (SELECT 1 FROM json_each(coalesce(%s, '[]')) WHERE trim(json_each.value) <> '')",
				column,
			))
		}))
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
	person.FieldTimezone,
	person.FieldLocale,
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
