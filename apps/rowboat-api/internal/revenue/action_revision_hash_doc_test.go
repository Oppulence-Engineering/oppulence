package revenue

import "testing"

func TestDocumentedActionRevisionHash(t *testing.T) {
	got := RevisionContent{
		ActionType:       "warm_follow_up",
		Channel:          "email",
		RecipientEmail:   "buyer@example.com",
		ProposedSubject:  "Following up as promised",
		ProposedMessage:  "Hi Jordan — you asked me to circle back this month...",
		SenderAccountRef: "gmail:me@company.com",
		AssignedUserID:   "a8dfa9b6-a7b2-46ea-982c-622a914c00e5",
		ExecutionMode:    "draft",
	}.Hash()
	const want = "sha256:746c1d9cd3925b8e632fc1b4bd539758514cb1aefdf31948fe8d1b45ce74c29d"
	if got != want {
		t.Fatalf("revision hash %s", got)
	}
}
