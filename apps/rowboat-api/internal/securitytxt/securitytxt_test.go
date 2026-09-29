package securitytxt

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestServeWritesTheDisclosureContact(t *testing.T) {
	rec := httptest.NewRecorder()
	Serve(rec, httptest.NewRequest(http.MethodGet, "/.well-known/security.txt", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Fatalf("content-type = %q", ct)
	}
	body := rec.Body.String()
	for _, line := range []string{
		"Contact: mailto:security@oppulence.io",
		"Preferred-Languages: en",
		"Policy: https://oppulence.io/responsible-disclosure",
	} {
		if !strings.Contains(body, line) {
			t.Fatalf("body missing %q:\n%s", line, body)
		}
	}
	if strings.Contains(body, "Expires:") && !strings.Contains(body, "Expires: 2027-09-08T00:00:00.000Z") {
		t.Fatalf("unexpected expires line:\n%s", body)
	}
}

func TestMarketingCopyMatchesTheAPIDocument(t *testing.T) {
	raw, err := os.ReadFile("../../../rowboat-www/public/.well-known/security.txt")
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != Body {
		t.Fatalf("marketing security.txt differs from the API document:\n%q\nwant\n%q", string(raw), Body)
	}
}
