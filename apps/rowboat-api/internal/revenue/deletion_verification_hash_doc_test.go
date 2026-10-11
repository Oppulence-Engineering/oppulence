package revenue

import "testing"

func TestDocumentedDeletionVerificationHash(t *testing.T) {
	got := deletionVerificationHash("delete:ab12", "api_evidence", 0)
	const want = "sha256:5c15791fbeefd579cf530b240c1a3d5eec1d94058e045c8a4eadf0d1385ebfbf"
	if got != want {
		t.Fatalf("verification hash %s", got)
	}
}
