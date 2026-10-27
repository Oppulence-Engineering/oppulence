package revenue

import "testing"

func TestDocumentedSupportRefsMatchDiagnosticRef(t *testing.T) {
	workspaceID := "0b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	connectionID := "6b8dfa9b-a7b2-46ea-982c-622a914c00e5"
	if got := diagnosticRef("workspace", workspaceID); got != "workspace:sha256:1d811ce10de82ecb6ed8274b" {
		t.Fatalf("workspace ref %s", got)
	}
	if got := diagnosticRef("connection", connectionID); got != "connection:sha256:da73462ccdf527f07099a17f" {
		t.Fatalf("connection ref %s", got)
	}
	account := canonicalSource("google") + ":me@company.com"
	if got := diagnosticRef("source-account", account); got != "source-account:sha256:24021bb72aca268d3989017b" {
		t.Fatalf("source account ref %s", got)
	}
}
