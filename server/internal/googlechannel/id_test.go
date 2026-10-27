package googlechannel

import (
	"regexp"
	"strings"
	"testing"
)

func TestNewAndAccount(t *testing.T) {
	for _, kind := range []string{"gcal", "gdrive"} {
		id := New(kind, "Me+alerts@Example.com")
		if !regexp.MustCompile(`^[A-Za-z0-9\-_+/=]+$`).MatchString(id) {
			t.Fatalf("channel ID contains characters Google rejects: %q", id)
		}
		if got := Account(id, kind); got != "me+alerts@example.com" {
			t.Fatalf("account = %q", got)
		}
		if got := Account(id, "other"); got != "" {
			t.Fatalf("wrong kind resolved account %q", got)
		}
		if another := New(kind, "Me+alerts@Example.com"); another == id {
			t.Fatal("renewal reused a channel ID")
		}
	}
}

func TestAccountRejectsMalformedAndSupportsLegacy(t *testing.T) {
	for _, id := range []string{"gcal+bad?+id", "gcal+eA+", "gcal+", "gdrive+eA+id"} {
		if got := Account(id, "gcal"); got != "" {
			t.Fatalf("malformed channel %q resolved account %q", id, got)
		}
	}
	if got := Account("gcal:ME@example.com:old-id", "gcal"); got != "me@example.com" {
		t.Fatalf("legacy account = %q", got)
	}
	if strings.Contains(New("gcal", "me@example.com"), ":") {
		t.Fatal("new channel ID used legacy delimiter")
	}
}
