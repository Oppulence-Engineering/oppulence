package revenue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"go.uber.org/zap"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/revenueworkspace"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/ent/user"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/email"
)

// fakeEmail records what it was asked to send.
type fakeEmail struct {
	sent    []email.Message
	enabled bool
	err     error
}

func (f *fakeEmail) Send(_ context.Context, m email.Message) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, m)
	return nil
}
func (f *fakeEmail) Enabled() bool { return f.enabled }

func TestDetectorLabelNamesEveryActionDetector(t *testing.T) {
	for _, key := range []string{
		"requested_follow_up_due",
		"unanswered_proposal",
		"waiting_on_me",
		"dormant_warm_opportunity",
		"neglected_referral",
		"former_customer_reconnect",
		"conversation_action_pack",
		"commitment_due",
		"manual",
	} {
		label := detectorLabel(key)
		if label == "" || strings.Contains(label, "_") {
			t.Fatalf("detector %q labeled %q", key, label)
		}
	}
	if detectorLabel("commitment_due") != "Commitment due" {
		t.Fatalf("commitment_due labeled %q", detectorLabel("commitment_due"))
	}
	if detectorLabel("conversation_action_pack") != "Conversation action pack" {
		t.Fatalf("conversation_action_pack labeled %q", detectorLabel("conversation_action_pack"))
	}
}

func TestDigestComposeAndRender(t *testing.T) {
	f := newFixture(t)
	// Two open actions.
	f.action(t, ExecModeDraft)
	f.action(t, ExecModeSend)

	dg, err := f.svc.Digest(f.ctx, f.user)
	if err != nil {
		t.Fatalf("digest: %v", err)
	}
	if dg.OpenCount != 2 {
		t.Fatalf("openCount = %d, want 2", dg.OpenCount)
	}
	if len(dg.Top) != 2 {
		t.Fatalf("top = %d, want 2", len(dg.Top))
	}
	subject, htmlBody, textBody := RenderDigest(dg, "https://oppulence.io")
	if !strings.Contains(subject, "2 open loops") {
		t.Fatalf("subject: %q", subject)
	}
	if !strings.Contains(htmlBody, "https://oppulence.io/app") {
		t.Fatal("html should link to the queue")
	}
	if !strings.Contains(textBody, "buyer@example.com") {
		t.Fatalf("text body missing recipient: %q", textBody)
	}
	// HTML-escaping: a crafted recipient must not inject markup.
	dg.Top[0].Recipient = `<script>x</script>@evil.com`
	_, htmlBody2, _ := RenderDigest(dg, "https://oppulence.io")
	if strings.Contains(htmlBody2, "<script>x</script>") {
		t.Fatal("recipient must be HTML-escaped in the digest")
	}
}

func TestDigestSkipsSavedTasks(t *testing.T) {
	f := newFixture(t)
	rel := f.relationship(t)
	for n := 0; n < 5; n++ {
		if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
			RelationshipID: rel.ID, ActionType: "follow_up_task", Channel: "task",
			Reason: "Pack the booth crate", PriorityScore: 90, DedupeKey: fmt.Sprintf("digest-task-%d", n),
		}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.svc.CreateAction(f.ctx, f.user, ActionInput{
		RelationshipID: rel.ID, ActionType: "warm_follow_up", Channel: "email",
		Reason: "Send the harbor note", PriorityScore: 10, DedupeKey: "digest-email",
	}); err != nil {
		t.Fatal(err)
	}
	dg, err := f.svc.Digest(f.ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	if dg.OpenCount != 1 || len(dg.Top) != 1 || dg.Top[0].Reason != "Send the harbor note" {
		t.Fatalf("digest = open %d top %+v, want the email only", dg.OpenCount, dg.Top)
	}
}

func TestDigestEmpty(t *testing.T) {
	f := newFixture(t)
	dg, err := f.svc.Digest(f.ctx, f.user)
	if err != nil {
		t.Fatalf("digest: %v", err)
	}
	if !dg.Empty() {
		t.Fatal("a queue with no open actions must produce an empty digest")
	}
	// A nil Top marshals to JSON null, and the dashboard reads digest.top.length
	// directly, so a null there crashes the Impact view rather than rendering an
	// empty state.
	if dg.Top == nil {
		t.Fatal("Top must be non-nil so it marshals as [] rather than null")
	}
	encoded, err := json.Marshal(dg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(encoded), `"top":[]`) {
		t.Fatalf("empty digest must encode top as [], got %s", encoded)
	}
}

func TestDisabledEmailSenderFailsClosed(t *testing.T) {
	s := email.NewResend(email.ResendConfig{}) // no api key
	if s.Enabled() {
		t.Fatal("no API key must yield a disabled sender")
	}
	if err := s.Send(context.Background(), email.Message{To: "a@b.co", Subject: "x", HTML: "<p>x</p>"}); err == nil {
		t.Fatal("disabled sender must return an error, not silently succeed")
	}
}

func TestDigestSenderSendsAndRespectsInterval(t *testing.T) {
	f := newFixture(t)
	f.action(t, ExecModeDraft) // one open action so the digest is non-empty
	mail := &fakeEmail{enabled: true}
	sender := NewDigestSender(f.svc, mail, DigestConfig{AppURL: "https://oppulence.io"}, zap.NewNop())

	sender.sweep(context.Background())
	if len(mail.sent) != 1 {
		t.Fatalf("expected one digest email, got %d", len(mail.sent))
	}
	if mail.sent[0].To != f.user.Email {
		t.Fatalf("digest sent to %q, want %q", mail.sent[0].To, f.user.Email)
	}
	// The workspace was stamped.
	ws := f.client.RevenueWorkspace.Query().
		Where(revenueworkspace.HasUserWith(user.IDEQ(f.user.ID))).OnlyX(f.ctx)
	if ws.LastDigestAt == nil {
		t.Fatal("last_digest_at must be stamped after sending")
	}
	// A second immediate sweep must not resend (min interval).
	sender.sweep(context.Background())
	if len(mail.sent) != 1 {
		t.Fatalf("min interval must suppress a resend, got %d", len(mail.sent))
	}
}

// A user with no open actions is not a candidate.
func TestDigestSenderSkipsEmptyQueue(t *testing.T) {
	f := newFixture(t)
	_, _ = f.svc.CurrentWorkspace(f.ctx, f.user) // workspace exists, but no actions
	mail := &fakeEmail{enabled: true}
	sender := NewDigestSender(f.svc, mail, DigestConfig{}, zap.NewNop())
	sender.sweep(context.Background())
	if len(mail.sent) != 0 {
		t.Fatalf("no open actions should mean no email, got %d", len(mail.sent))
	}
}
