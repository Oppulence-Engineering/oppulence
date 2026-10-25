package agentregistry

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/auth"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/composioapi"
	"github.com/Oppulence-Engineering/rowboat/apps/rowboat-api/internal/outbound"
)

var composioTools = []string{
	"connector.read.composio_tool_search",
	"connector.read.composio_tool_describe",
	"connector.write.composio_tool_execute",
}

// A capability that no agent lists is unreachable however well it is built, so
// membership of the authenticated built-in allowlists makes Composio usable.
func TestComposioToolsAreReachableOnlyFromAuthenticatedBuiltInAgents(t *testing.T) {
	loader, err := NewLoader(nil, DefaultCatalog())
	if err != nil {
		t.Fatalf("NewLoader: %v", err)
	}
	bySlug := map[string]*Spec{}
	for _, builtin := range loader.Builtins() {
		bySlug[builtin.Slug] = builtin
	}
	for _, slug := range []string{"assistant", "concierge"} {
		agent, ok := bySlug[slug]
		if !ok {
			t.Fatalf("missing built-in agent %q", slug)
		}
		for _, tool := range composioTools {
			if !slices.Contains(agent.EnabledTools, tool) {
				t.Fatalf("%s cannot reach %q", slug, tool)
			}
		}
	}
	for _, builtin := range loader.Builtins() {
		if builtin.Slug != "concierge-slack" {
			continue
		}
		for _, tool := range composioTools {
			if slices.Contains(builtin.EnabledTools, tool) {
				t.Fatalf("shared-channel agent %s must not expose %q", builtin.Slug, tool)
			}
		}
		return
	}
	t.Fatal("missing built-in agent concierge-slack")
}

func TestComposioToolsRejectSlackChannelSessions(t *testing.T) {
	deps, scope := slackSessionToolDeps(t)
	deps.Composio = composioapi.New("test-key", outbound.Policy{})
	for _, tc := range []struct {
		name string
		args json.RawMessage
	}{
		{name: "connector.read.composio_tool_search", args: json.RawMessage(`{"query":"create issue"}`)},
		{name: "connector.read.composio_tool_describe", args: json.RawMessage(`{"slug":"jira.create_issue"}`)},
		{name: "connector.write.composio_tool_execute", args: json.RawMessage(`{"slug":"jira.create_issue"}`)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			capability, ok := DefaultCatalog().Get(tc.name)
			if !ok {
				t.Fatalf("capability %q is not registered", tc.name)
			}
			out, err := capability.Build(deps).Invoke(auth.WithInternal(context.Background()), scope, tc.args)
			if err != nil {
				t.Fatalf("invoke returned hard error: %v", err)
			}
			if !strings.Contains(string(out), "not available from Slack") {
				t.Fatalf("expected Slack restriction observation, got %s", out)
			}
		})
	}
}

func TestComposioCapabilitiesAreRegistered(t *testing.T) {
	catalog := DefaultCatalog()
	for _, tool := range composioTools {
		if _, ok := catalog.Get(tool); !ok {
			t.Fatalf("catalog is missing %q", tool)
		}
	}
}

// The long tail runs without an approval pause by deliberate product choice.
// Raising the execute tool back to the act tier would stop every call, so the
// tier is asserted rather than left to a future edit.
func TestComposioExecuteRunsWithoutAnApprovalPause(t *testing.T) {
	execute, ok := DefaultCatalog().Get("connector.write.composio_tool_execute")
	if !ok {
		t.Fatal("catalog is missing the Composio execute capability")
	}
	if execute.TrustTier != TierWrite {
		t.Fatalf("trust tier = %q, want %q", execute.TrustTier, TierWrite)
	}
	if RequiresApproval(execute.TrustTier) {
		t.Fatal("the Composio execute tool must not pause for approval")
	}
	for _, tool := range composioTools[:2] {
		capability, _ := DefaultCatalog().Get(tool)
		if RequiresApproval(capability.TrustTier) {
			t.Fatalf("%q is a read and must not pause for approval", tool)
		}
	}
}
