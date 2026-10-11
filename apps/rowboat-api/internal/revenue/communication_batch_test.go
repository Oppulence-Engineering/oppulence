package revenue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/communicationinteraction"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
)

type stubAttachmentFetcher struct {
	content string
}

func (s stubAttachmentFetcher) FetchTextAttachment(
	_ context.Context,
	_ uuid.UUID,
	_, _, _, _ string,
	_ int64,
) (string, error) {
	if s.content == "" {
		return "", ErrCommunicationContentUnavailable
	}
	return s.content, nil
}

func seedCommunicationInteraction(
	t *testing.T,
	f *fixture,
	relationshipID uuid.UUID,
) (*ent.CommunicationInteraction, *ent.CommunicationAttachment) {
	t.Helper()
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	interaction, err := f.client.CommunicationInteraction.Create().
		SetWorkspace(ws).
		SetOwner(f.user).
		SetRelationshipID(relationshipID).
		SetSource("gmail").
		SetSourceAccountID("owner@x.co").
		SetProviderObjectID("msg-1").
		SetInteractionType("email").
		SetDirection("inbound").
		SetSubject("Hello").
		SetOccurredAt(time.Now().UTC()).
		SetReceivedAt(time.Now().UTC()).
		SetVisibility("metadata").
		SetContentHash("sha256:test").
		SetMetadataJSON(`{"threadId":"thread-1"}`).
		Save(internal)
	if err != nil {
		t.Fatal(err)
	}
	attachment, err := f.client.CommunicationAttachment.Create().
		SetWorkspace(ws).
		SetInteraction(interaction).
		SetProviderAttachmentID("att-1").
		SetFilename("notes.txt").
		SetMimeType("text/plain").
		SetSizeBytes(12).
		Save(internal)
	if err != nil {
		t.Fatal(err)
	}
	return interaction, attachment
}

func TestMailAndMeetingsReturnsTheSentFollowUp(t *testing.T) {
	f := newFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "company", DisplayName: "Acme", AccountDomain: "example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	occurred := time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)
	internal := auth.WithInternal(context.Background())
	interaction, err := f.client.CommunicationInteraction.Create().
		SetID(uuid.MustParse("e18dfa9b-a7b2-46ea-982c-622a914c00e5")).
		SetWorkspace(ws).
		SetOwner(f.user).
		SetRelationshipID(rel.ID).
		SetSource("gmail").
		SetSourceAccountID("owner@example.com").
		SetProviderObjectID("m-1").
		SetInteractionType("email").
		SetDirection("outbound").
		SetSubject("Follow up").
		SetOccurredAt(occurred).
		SetReceivedAt(occurred).
		SetVisibility("metadata").
		SetContentHash("sha256:follow-up").
		SetMetadataJSON(`{"threadId":"t-1","labels":["SENT"],"snippet":"metadata only"}`).
		Save(internal)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.client.CommunicationAttachment.Create().
		SetWorkspace(ws).
		SetInteraction(interaction).
		SetProviderAttachmentID("attachment-1").
		SetFilename("terms.pdf").
		SetMimeType("application/pdf").
		SetSizeBytes(42).
		Save(internal); err != nil {
		t.Fatal(err)
	}
	page, err := f.svc.RelationshipCommunicationTimeline(f.ctx, f.user, rel.ID, nil, nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(page)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), f.user.ID.String()) {
		t.Fatalf("owner id missing: %s", raw)
	}
	got := strings.ReplaceAll(string(raw), f.user.ID.String(), "7b8dfa9b-a7b2-46ea-982c-622a914c00e5")
	const want = `{"items":[{"id":"e18dfa9b-a7b2-46ea-982c-622a914c00e5","source":"gmail","interactionType":"email","direction":"outbound","subject":"Follow up","occurredAt":"2026-09-17T12:00:00Z","visibility":"metadata","ownerId":"7b8dfa9b-a7b2-46ea-982c-622a914c00e5","bodyLocked":false,"attachmentCount":1,"access":{"metadata":true,"subject":true,"body":true,"attachments":true,"protected":false,"reason":"mailbox_owner","policyVersion":1}}],"hasMore":false}`
	if got != want {
		t.Fatalf("timeline:\n%s\nwant:\n%s", got, want)
	}
}

func TestCommunicationTimelineKeepsTiedOccurredAt(t *testing.T) {
	f, _, _, ws := communicationPrivacyFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Buyer", PrimaryEmail: "buyer-tied@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	occurred := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	internal := auth.WithInternal(context.Background())
	for i := 1; i <= 3; i++ {
		subject := fmt.Sprintf("Tied Mail %03d", i)
		if i == 1 {
			subject = "Tied Mail Last"
		}
		if _, err := f.client.CommunicationInteraction.Create().
			SetID(uuid.MustParse(fmt.Sprintf("a1162000-0000-4000-8000-%012x", i))).
			SetWorkspace(ws).
			SetOwner(f.user).
			SetRelationshipID(rel.ID).
			SetSource("gmail").
			SetSourceAccountID("owner@x.co").
			SetProviderObjectID(fmt.Sprintf("tied-mail-%d", i)).
			SetInteractionType("email").
			SetDirection("inbound").
			SetSubject(subject).
			SetOccurredAt(occurred).
			SetReceivedAt(occurred).
			SetVisibility("metadata").
			SetContentHash(fmt.Sprintf("sha256:tied-mail-%d", i)).
			SetMetadataJSON(`{"threadId":"thread-tied"}`).
			Save(internal); err != nil {
			t.Fatal(err)
		}
	}
	first, err := f.svc.RelationshipCommunicationTimeline(f.ctx, f.user, rel.ID, nil, nil, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !first.HasMore || len(first.Items) != 2 || first.Items[0].Subject != "Tied Mail 003" {
		t.Fatalf("newest mail page = %#v", first.Items)
	}
	for _, item := range first.Items {
		if item.Subject == "Tied Mail Last" {
			t.Fatal("the lowest id was included in the newest mail page")
		}
	}
	if first.NextBefore == nil || !first.NextBefore.Equal(occurred) || first.NextBeforeID == nil {
		t.Fatalf("mail cursor = %v %v", first.NextBefore, first.NextBeforeID)
	}
	second, err := f.svc.RelationshipCommunicationTimeline(f.ctx, f.user, rel.ID, first.NextBefore, first.NextBeforeID, 2)
	if err != nil {
		t.Fatal(err)
	}
	if second.HasMore || len(second.Items) != 1 || second.Items[0].Subject != "Tied Mail Last" {
		t.Fatalf("older mail page = %#v hasMore=%v", second.Items, second.HasMore)
	}
}

func TestCommunicationTimelineRedactsTeammateBody(t *testing.T) {
	f, teammate, teammateCtx, _ := communicationPrivacyFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Buyer", PrimaryEmail: "buyer@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	interaction, _ := seedCommunicationInteraction(t, f, rel.ID)
	page, err := f.svc.RelationshipCommunicationTimeline(teammateCtx, teammate, rel.ID, nil, nil, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || !page.Items[0].BodyLocked || !page.Items[0].Access.Metadata {
		t.Fatalf("teammate timeline: %#v err=%v", page, err)
	}
	ownerPage, err := f.svc.RelationshipCommunicationTimeline(f.ctx, f.user, rel.ID, nil, nil, 10)
	if err != nil || len(ownerPage.Items) != 1 || ownerPage.Items[0].BodyLocked {
		t.Fatalf("owner timeline: %#v err=%v", ownerPage, err)
	}
	_, err = f.svc.CommunicationInteractionBody(teammateCtx, teammate, interaction.ID)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("teammate body: %v", err)
	}
}

func TestCommunicationAttachmentRequiresGrant(t *testing.T) {
	f, teammate, teammateCtx, _ := communicationPrivacyFixture(t)
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Buyer", PrimaryEmail: "buyer@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, attachment := seedCommunicationInteraction(t, f, rel.ID)
	if _, err := f.svc.CommunicationAttachmentContent(teammateCtx, teammate, attachment.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("ungranted attachment: %v", err)
	}
	f.svc.SetAttachmentFetcher(stubAttachmentFetcher{content: "hello attachment"})
	grantee := teammate.ID
	if _, err := f.svc.GrantCommunicationAccess(f.ctx, f.user, CommunicationGrantInput{
		Scope: "attachments", ResourceType: "message", ResourceID: "msg-1", GranteeID: &grantee,
	}); err != nil {
		t.Fatal(err)
	}
	result, err := f.svc.CommunicationAttachmentContent(teammateCtx, teammate, attachment.ID)
	if err != nil || result.Content != "hello attachment" || result.ScanStatus != "clean" {
		t.Fatalf("granted attachment: %#v err=%v", result, err)
	}
	row, err := f.client.CommunicationAttachment.Get(f.ctx, attachment.ID)
	if err != nil || row.ScanStatus != "clean" || len(row.SealedContent) == 0 {
		t.Fatalf("sealed attachment cache: %#v err=%v", row, err)
	}
}

func TestCommunicationRoutesAreMounted(t *testing.T) {
	t.Parallel()
	router := chi.NewRouter()
	NewHandler(nil, zap.NewNop()).Mount(router)
	mounted := map[string]bool{}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		mounted[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}
	for _, want := range []string{
		"GET /v1/revenue-workspaces/current/communications/{interactionId}/body",
		"GET /v1/revenue-workspaces/current/communications/attachments/{attachmentId}/content",
		"GET /v1/relationships/{relationshipId}/communication-timeline",
	} {
		if !mounted[want] {
			t.Errorf("route not mounted: %s", want)
		}
	}
}

func TestResolveCommunicationRelationshipUnambiguous(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Buyer", PrimaryEmail: "buyer@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := ResolveCommunicationRelationship(
		f.ctx, f.client, ws.ID, []string{"owner@x.co", "buyer@example.com"}, "owner@x.co",
	)
	if err != nil || got == nil || *got != rel.ID {
		t.Fatalf("resolve relationship: got=%v err=%v", got, err)
	}
}

func TestAdaptCommunicationInteractionMetadataOnly(t *testing.T) {
	f := newFixture(t)
	ws, err := f.svc.CurrentWorkspace(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	rel, err := f.svc.CreateRelationship(f.ctx, f.user, RelationshipInput{
		Kind: "person", DisplayName: "Buyer", PrimaryEmail: "buyer@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	internal := auth.WithInternal(context.Background())
	interaction, err := f.client.CommunicationInteraction.Create().
		SetWorkspace(ws).SetOwner(f.user).SetRelationship(rel).
		SetSource("gmail").SetSourceAccountID("owner@x.co").SetProviderObjectID("msg-2").
		SetInteractionType("email").SetSubject("Subject").SetOccurredAt(time.Now().UTC()).
		SetReceivedAt(time.Now().UTC()).SetVisibility("metadata").SetContentHash("sha256:abc").
		SetMetadataJSON(`{"threadId":"thread-2"}`).Save(internal)
	if err != nil {
		t.Fatal(err)
	}
	participant, err := f.client.CommunicationParticipant.Create().
		SetWorkspace(ws).SetInteraction(interaction).SetEmail("buyer@example.com").
		SetRole("to").SetExternal(true).Save(internal)
	if err != nil {
		t.Fatal(err)
	}
	interaction, err = f.client.CommunicationInteraction.Query().
		Where(communicationinteraction.IDEQ(interaction.ID)).
		WithRelationship().
		Only(internal)
	if err != nil {
		t.Fatal(err)
	}
	input, err := AdaptCommunicationInteraction(interaction, []*ent.CommunicationParticipant{participant})
	if err != nil || input.RelationshipID != rel.ID || input.Summary != "Subject" {
		t.Fatalf("adapt interaction: %#v err=%v", input, err)
	}
}
