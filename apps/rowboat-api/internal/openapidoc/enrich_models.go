package openapidoc

import (
	"sort"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/pricing"
)

const aiModelDescription = "AI model loads the priced list. The request sends no filter. The list is every model this workspace can choose, in order."

func aiModelPage() obj {
	ids := make([]string, 0, len(pricing.DefaultTable().Models))
	for id := range pricing.DefaultTable().Models {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	rows := make([]any, 0, len(ids))
	for _, id := range ids {
		rows = append(rows, obj{"id": id})
	}
	return obj{"data": rows}
}
