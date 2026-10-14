import { createFileRoute } from "@tanstack/react-router";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp from "../lib/mcp/index";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: createTanStackMcpHandler(mcp, {
        resourcePath: "/mcp",
        metadataPath: "/.well-known/oauth-protected-resource",
        // The OAuth issuer is configured in the MCP bootstrap. Do not trust caller-controlled
        // Forwarded/X-Forwarded-Host headers when deriving protected-resource metadata.
        trustForwardedHost: false,
      }),
    },
  },
});
