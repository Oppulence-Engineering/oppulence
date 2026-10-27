package main

import (
	"net/url"
	"testing"
)

func TestWorkOSAuthTimeReauthIsStrictlyNewerThanThePreviousReauth(t *testing.T) {
	subject := t.Name()
	reauth := url.Values{"prompt": {"login"}, "max_age": {"0"}}

	first := workOSAuthTime(reauth, subject)
	second := workOSAuthTime(reauth, subject)
	if second <= first {
		t.Fatalf("second reauth auth_time %d is not strictly after %d", second, first)
	}

	// A non-interactive login stays on the wall clock and must not consume the
	// reauth sequence. A later reauth still has to move past `second`.
	_ = workOSAuthTime(url.Values{}, subject)
	third := workOSAuthTime(reauth, subject)
	if third <= second {
		t.Fatalf("reauth after a plain login %d is not strictly after %d", third, second)
	}
}
