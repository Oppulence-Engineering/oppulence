package openapidoc

const noteTemplatesDescription = "Reusable note templates loads the first page. The request asks for note templates, one hundred at a time, starting at the beginning. This workspace has no template, so the page is empty."

func noteTemplatesPage() obj {
	return obj{
		"hasMore":   false,
		"limit":     100,
		"offset":    0,
		"resources": []any{},
	}
}

func noteTemplatesOperation(authErrors obj) obj {
	responses := cloneResponses(authErrors)
	responses["200"] = jsonResponse("Empty template page.", ref("ConsoleResourcePage"), noteTemplatesPage())
	kind := queryParam("kind", "Required resource kind.", true, ref("ConsoleResourceKind"))
	kind["example"] = "note_template"
	limitSchema := obj{"type": "integer", "minimum": 1, "maximum": 100, "example": 100}
	limit := queryParam("limit", "Page size (default 50, max 100).", false, limitSchema)
	limit["example"] = 100
	offsetSchema := obj{"type": "integer", "minimum": 0, "maximum": 10000, "example": 0}
	offset := queryParam("offset", "Page offset (max 10000).", false, offsetSchema)
	offset["example"] = 0
	return operation(
		"Console",
		"Reusable note templates",
		noteTemplatesDescription,
		"listConsoleResources",
		bearer(),
		[]any{kind, limit, offset},
		nil,
		responses,
	)
}
