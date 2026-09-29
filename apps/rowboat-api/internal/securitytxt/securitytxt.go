// Package securitytxt serves RFC 9116 security.txt. The responsible disclosure
// page is the policy; this file is how a researcher finds the contact address
// without reading the site.
package securitytxt

import "net/http"

// Body is the document served at /.well-known/security.txt on the API and,
// byte for byte, from the marketing site's public directory. Expires is
// required by RFC 9116 and is inside the one-year window the RFC recommends.
const Body = "Contact: mailto:security@oppulence.io\r\n" +
	"Expires: 2027-09-08T00:00:00.000Z\r\n" +
	"Preferred-Languages: en\r\n" +
	"Policy: https://oppulence.io/responsible-disclosure\r\n" +
	"Canonical: https://oppulence.io/.well-known/security.txt\r\n"

// Serve writes the security.txt document. It is public: the caller has no
// account yet.
func Serve(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(Body))
}
