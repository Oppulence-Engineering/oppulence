package openapidoc

const googleConnectionDescription = "Gmail and Google Calendar loads this account's connection. The request sends no filter. This workspace has not connected Google, so the account list is empty."

func googleConnectionPage() obj {
	return obj{
		"accounts":  []any{},
		"connected": false,
	}
}
