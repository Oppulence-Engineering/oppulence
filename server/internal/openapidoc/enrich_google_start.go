package openapidoc

const connectGoogleDescription = "Connect Google starts Gmail and Calendar authorization. The request asks for commitments, a web return, and the connections page. This server has not configured Google sign-in, so the request is refused."

const connectGoogleRefusal = "<!doctype html><meta charset=utf-8><title>Oppulence</title><p style=\"font:14px system-ui;margin:3rem\">Google sign-in isn't configured on the server yet.</p>"

func connectGooglePath() obj {
	profile := queryParam("profile", "Google access Connect Google asks for.", false, stringSchema("Google access.", "commitments"))
	profile["example"] = "commitments"
	ret := queryParam("return", "Where the browser comes back.", false, stringSchema("Return mode.", "web"))
	ret["example"] = "web"
	returnPath := queryParam("return_path", "Page Connect Google returns to.", false, stringSchema("Return page.", "/app/settings?settings=connections"))
	returnPath["example"] = "/app/settings?settings=connections"
	success := obj{
		"type":     "object",
		"required": []any{"authorizeUrl"},
		"properties": obj{
			"authorizeUrl": obj{"type": "string", "format": "uri", "description": "Google authorization address."},
		},
	}
	return obj{
		"post": operation("Google OAuth", "Connect Google", connectGoogleDescription, "startGoogleOAuth", bearer(), []any{profile, ret, returnPath}, nil, obj{
			"200": jsonResponse("Google authorization address.", success, nil),
			"401": responseRef("401"),
			"500": responseRef("500"),
			"502": obj{
				"description": "Google sign-in is not configured.",
				"content": obj{"text/html": obj{
					"schema":  obj{"type": "string"},
					"example": connectGoogleRefusal,
				}},
			},
		}),
	}
}
