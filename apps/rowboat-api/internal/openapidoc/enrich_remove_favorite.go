package openapidoc

const removeFavoriteDescription = "Remove from favorites deletes the saved favorite for that note. The note stays."

const removeFavoriteID = "e8dfa9b6-a7b2-46ea-982c-622a914c00e5"

func removeFavoriteOperation() obj {
	idSchema := uuidSchema("Saved favorite id.", removeFavoriteID)
	return operation(
		"Console",
		"Remove from favorites",
		removeFavoriteDescription,
		"deleteConsoleResource",
		bearer(),
		[]any{obj{
			"name":        "resourceId",
			"in":          "path",
			"required":    true,
			"description": "Saved favorite to remove.",
			"example":     removeFavoriteID,
			"schema":      idSchema,
		}},
		nil,
		obj{
			"204": obj{"description": "The favorite is gone."},
			"400": responseRef("400"),
			"401": responseRef("401"),
			"403": responseRef("403"),
			"404": consoleNotFoundResponse(),
			"413": problemResponse("Request body exceeds 262144 bytes.", ref("ErrorEnvelope"),
				problemExample(413, "Content Too Large", "request body exceeds 262144 bytes", "request_body_too_large")),
			"415": problemResponse("Content-Type must be application/json.", ref("ErrorEnvelope"),
				problemExample(415, "Unsupported Media Type", "Content-Type must be application/json", "unsupported_media_type")),
			"500": responseRef("500"),
		},
	)
}
