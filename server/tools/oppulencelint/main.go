// Command oppulencelint runs Oppulence-specific static analyzers.
package main

import (
	"github.com/PlaybookMediaLLC/oppulence/server/tools/oppulencelint/analyzers/directhttp"
	"github.com/PlaybookMediaLLC/oppulence/server/tools/oppulencelint/analyzers/forbiddenlog"
	"github.com/PlaybookMediaLLC/oppulence/server/tools/oppulencelint/analyzers/temporal"
	"golang.org/x/tools/go/analysis/multichecker"
)

func main() {
	multichecker.Main(
		temporal.Analyzer,
		directhttp.Analyzer,
		forbiddenlog.Analyzer,
	)
}
