package openapidoc

// addConsoleSchemas documents the explicit DTOs exposed by the authenticated
// console domain. Persistence normalization fields are intentionally absent.
func addConsoleSchemas(schemas obj) {
	preferencesProperties := obj{
		"displayName":        stringSchema("Cross-device display name.", "Ada Lovelace", obj{"maxLength": 120}),
		"defaultAgentSlug":   stringSchema("Default agent slug; empty clears the selection.", "assistant", obj{"maxLength": 100}),
		"shareUsageData":     boolSchema("Whether product usage analytics may be captured.", true),
		"notificationLevel":  stringEnum("Notification preference.", "attention", "off", "attention", "all"),
		"showModelReasoning": boolSchema("Whether model reasoning is shown when the client supports it.", false),
		"theme":              stringEnum("Cross-device theme preference.", "system", "light", "dark", "system"),
	}
	preferences := objectSchema("Canonical server-synced console preferences.", preferencesProperties,
		"displayName", "defaultAgentSlug", "shareUsageData", "notificationLevel", "showModelReasoning", "theme")
	preferences["additionalProperties"] = false
	schemas["ConsolePreferences"] = preferences
	preferencesPatch := objectSchema("Partial preference merge. Explicit false and empty strings are preserved.", preferencesProperties)
	preferencesPatch["additionalProperties"] = false
	schemas["ConsolePreferencesPatch"] = preferencesPatch

	schemas["ConsoleResourceKind"] = stringEnum(
		"Durable console artifact kind.",
		"graph_saved_view",
		"note_template", "note_favorite", "graph_saved_view",
	)
	noteTemplate := objectSchema("Reusable note authoring content.", obj{
		"title": stringSchema("Template title.", "Weekly account review", obj{"minLength": 1, "maxLength": 200}),
		"body":  stringSchema("Optional plain-text fallback.", "Agenda", obj{"maxLength": 65536}),
		"content": obj{
			"type": "array", "description": "Optional Plate editor blocks.", "maxItems": 1000,
			"items": obj{"type": "object", "additionalProperties": true},
		},
	}, "title")
	noteTemplate["additionalProperties"] = false
	schemas["ConsoleNoteTemplatePayload"] = noteTemplate

	noteFavorite := objectSchema("Idempotent reference to a note in this workspace.", obj{
		"noteId": stringSchema("Stable note identifier.", "note-123", obj{"minLength": 1, "maxLength": 512}),
	}, "noteId")
	noteFavorite["additionalProperties"] = false
	schemas["ConsoleNoteFavoritePayload"] = noteFavorite

	graphState := objectSchema("Saved relationship graph controls.", obj{
		"scope":              stringEnum("Graph scope.", "portfolio", "portfolio", "relationship"),
		"relationshipId":     stringSchema("Required only for relationship scope.", "3a196c5e-b10e-46cb-a177-7c001f7be573", nullable(), obj{"maxLength": 512}),
		"query":              stringSchema("Graph query.", "renewal risk", obj{"maxLength": 2000}),
		"layout":             stringEnum("Graph layout.", "force", "force", "radial", "timeline"),
		"density":            obj{"type": "number", "minimum": 0.25, "maximum": 1, "example": 0.72},
		"hideIsolated":       boolSchema("Hide nodes without visible edges.", false),
		"selectedNodeId":     stringSchema("Optional selected graph node.", "relationship:3a196c5e-b10e-46cb-a177-7c001f7be573", nullable(), obj{"maxLength": 512}),
		"focusDepth":         intSchema("Neighborhood depth.", 0, obj{"minimum": 0, "maximum": 2}),
		"asOf":               stringSchema("Optional historical boundary.", "2026-09-17T20:00:00Z", obj{"format": "date-time"}, nullable()),
		"changedSinceReview": boolSchema("Show relationships changed since review.", false),
	}, "scope", "query", "layout", "density", "hideIsolated", "focusDepth", "changedSinceReview")
	graphState["additionalProperties"] = false
	schemas["ConsoleGraphSavedViewState"] = graphState
	graphPayload := objectSchema("Saved graph view payload.", obj{"state": ref("ConsoleGraphSavedViewState")}, "state")
	graphPayload["additionalProperties"] = false
	schemas["ConsoleGraphSavedViewPayload"] = graphPayload

	resource := objectSchema("One caller-owned console artifact in the asserted workspace.", obj{
		"id":        uuidSchema("Resource id.", "bed845f2-975a-4678-9c86-2157548161e4"),
		"kind":      ref("ConsoleResourceKind"),
		"name":      stringSchema("Template or view name; omitted for favorites.", "Renewal risk", obj{"maxLength": 120}),
		"payload":   obj{"oneOf": []any{ref("ConsoleNoteTemplatePayload"), ref("ConsoleNoteFavoritePayload"), ref("ConsoleGraphSavedViewPayload")}},
		"sortOrder": intSchema("User-controlled deterministic order.", 0, obj{"minimum": -1000000, "maximum": 1000000}),
		"createdAt": stringSchema("Creation timestamp.", "2026-09-17T20:00:00Z", obj{"format": "date-time"}),
		"updatedAt": stringSchema("Last update timestamp.", "2026-09-17T20:01:00Z", obj{"format": "date-time"}),
	}, "id", "kind", "payload", "sortOrder", "createdAt", "updatedAt")
	resource["additionalProperties"] = false
	schemas["ConsoleResource"] = resource

	create := objectSchema("Create a typed console artifact.", obj{
		"kind":      ref("ConsoleResourceKind"),
		"name":      stringSchema("Required for templates and saved views; forbidden for favorites.", "Renewal risk", obj{"maxLength": 120}),
		"payload":   resource["properties"].(obj)["payload"],
		"sortOrder": intSchema("User-controlled deterministic order.", 0, obj{"minimum": -1000000, "maximum": 1000000}),
	}, "kind", "payload")
	create["additionalProperties"] = false
	schemas["ConsoleResourceCreate"] = create

	patch := objectSchema("Update mutable artifact fields. Kind and ownership are immutable.", obj{
		"name":      create["properties"].(obj)["name"],
		"payload":   create["properties"].(obj)["payload"],
		"sortOrder": create["properties"].(obj)["sortOrder"],
	})
	patch["additionalProperties"] = false
	schemas["ConsoleResourcePatch"] = patch
	schemas["ConsoleResourcePage"] = objectSchema("Bounded deterministic resource page. A full page is the end of the list when hasMore is false.", obj{
		"resources": arraySchema("Resources ordered by sortOrder, createdAt descending, then id.", ref("ConsoleResource")),
		"limit":     intSchema("Applied page limit.", 50),
		"offset":    intSchema("Applied page offset.", 0),
		"hasMore":   boolSchema("Another resource exists beyond this page.", false),
	}, "resources", "limit", "offset")
}

const documentedSavedTemplateID = "bed845f2-975a-4678-9c86-2157548161e4"

func documentedSavedTemplatePayload() obj {
	return obj{
		"title": "Weekly account review",
		"body":  "Agenda",
	}
}

func documentedSavedTemplateRequest() obj {
	return obj{
		"kind":    "note_template",
		"name":    "Weekly account review",
		"payload": documentedSavedTemplatePayload(),
	}
}

func documentedSavedTemplate() obj {
	return obj{
		"id":        documentedSavedTemplateID,
		"kind":      "note_template",
		"name":      "Weekly account review",
		"payload":   documentedSavedTemplatePayload(),
		"sortOrder": 0,
		"createdAt": "2026-09-17T20:00:00Z",
		"updatedAt": "2026-09-17T20:00:00Z",
	}
}

const documentedEditedTemplateID = "bed845f2-975a-4678-9c86-2157548161e4"

func documentedEditedTemplatePayload() obj {
	return obj{"title": "Weekly account review", "body": "Agenda"}
}

func documentedEditedTemplateRequest() obj {
	return obj{
		"name":    "Weekly account review",
		"payload": documentedEditedTemplatePayload(),
	}
}

func documentedEditedTemplate() obj {
	return obj{
		"id":        documentedEditedTemplateID,
		"kind":      "note_template",
		"name":      "Weekly account review",
		"payload":   documentedEditedTemplatePayload(),
		"sortOrder": 0,
		"createdAt": "2026-09-17T20:00:00Z",
		"updatedAt": "2026-09-17T20:01:00Z",
	}
}

func documentedSavedProfileRequest() obj {
	return obj{"displayName": "Ada Lovelace"}
}

func documentedSavedProfile() obj {
	return obj{
		"displayName":        "Ada Lovelace",
		"defaultAgentSlug":   "",
		"shareUsageData":     false,
		"notificationLevel":  "off",
		"showModelReasoning": false,
		"theme":              "system",
	}
}

func addConsolePaths(paths obj) {
	authErrors := obj{
		"400": responseRef("400"),
		"401": responseRef("401"),
		"403": responseRef("403"),
		"413": problemResponse("Request body exceeds 262144 bytes.", ref("ErrorEnvelope"),
			problemExample(413, "Content Too Large", "request body exceeds 262144 bytes", "request_body_too_large")),
		"415": problemResponse("Content-Type must be application/json.", ref("ErrorEnvelope"),
			problemExample(415, "Unsupported Media Type", "Content-Type must be application/json", "unsupported_media_type")),
		"500": responseRef("500"),
	}
	preferenceResponses := cloneResponses(authErrors)
	preferenceResponses["200"] = jsonResponse("Current preferences.", ref("ConsolePreferences"), nil)
	savedProfileResponses := cloneResponses(preferenceResponses)
	savedProfileResponses["200"] = jsonResponse("Stored profile.", ref("ConsolePreferences"), documentedSavedProfile())

	profileResponses := cloneResponses(authErrors)
	profileResponses["200"] = jsonResponse("Preferences Profile loads before a name is saved.", ref("ConsolePreferences"), profilePreferences())
	paths["/v1/console/preferences"] = obj{
		"get": operation("Console", "Get console preferences", "Returns defaults before the caller's first write.", "getConsolePreferences", bearer(), nil, nil, preferenceResponses),
		"patch": operation("Console", "Save profile", "Save profile posts the display name. The name is Ada Lovelace. The stored preferences keep that name, an empty default agent, usage sharing off, notifications off, model reasoning hidden, and the system theme.", "patchConsolePreferences", bearer(), nil,
			jsonRequest("Preference fields to merge.", ref("ConsolePreferencesPatch"), documentedSavedProfileRequest()), savedProfileResponses),
	}

	createResponses := cloneResponses(authErrors)
	createResponses["200"] = jsonResponse("Existing favorite returned after an idempotent replay.", ref("ConsoleResource"), nil)
	createResponses["201"] = jsonResponse("Stored template.", ref("ConsoleResource"), documentedSavedTemplate())
	createResponses["409"] = consoleConflictResponse()
	paths["/v1/console/resources"] = obj{
		"get": noteTemplatesOperation(authErrors),
		"post": operation("Console", "Save template", "Save template posts a note template. The name and the title are Weekly account review, and the body is Agenda. The stored template keeps that title and body, with sort order 0.", "createConsoleResource", bearer(), nil,
			jsonRequest("Typed resource.", ref("ConsoleResourceCreate"), documentedSavedTemplateRequest()), createResponses),
	}

	resourceID := []any{pathParam("resourceId", "Console resource id.", obj{"type": "string", "format": "uuid"})}
	editedTemplateID := []any{pathParam("resourceId", "Console resource id.", uuidSchema("Console resource id.", documentedEditedTemplateID))}
	getResponses := cloneResponses(authErrors)
	getResponses["200"] = jsonResponse("Resource.", ref("ConsoleResource"), nil)
	getResponses["404"] = consoleNotFoundResponse()
	patchResponses := cloneResponses(getResponses)
	patchResponses["200"] = jsonResponse("Stored template.", ref("ConsoleResource"), documentedEditedTemplate())
	patchResponses["409"] = consoleConflictResponse()
	paths["/v1/console/resources/{resourceId}"] = obj{
		"get": operation("Console", "Get console resource", "Returns one caller-owned resource.", "getConsoleResource", bearer(), resourceID, nil, getResponses),
		"patch": operation("Console", "Save template", "Save template posts the name and payload of an existing note template. The name and the title are Weekly account review, and the body is Agenda. The stored template keeps that title and body, with sort order 0, and the update time is later.", "patchConsoleResource", bearer(), editedTemplateID,
			jsonRequest("Mutable resource fields.", ref("ConsoleResourcePatch"), documentedEditedTemplateRequest()), patchResponses),
		"delete": removeFavoriteOperation(),
	}
}

func cloneResponses(source obj) obj {
	cloned := make(obj, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func consoleConflictResponse() obj {
	return problemResponse("A resource with the same normalized name already exists.", ref("ErrorEnvelope"),
		problemExample(409, "Conflict", "console resource already exists", "console_resource_conflict"))
}

func consoleNotFoundResponse() obj {
	return problemResponse("The resource is absent or belongs to another user or workspace.", ref("ErrorEnvelope"),
		problemExample(404, "Not Found", "console resource not found", "console_resource_not_found"))
}
