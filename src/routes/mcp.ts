import { createFileRoute } from "@tanstack/react-router";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp, { isTrustedMcpOrigin } from "../lib/mcp/index";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: ({ request, ...context }) => {
        // Avoid deriving OAuth metadata/issuer URLs from arbitrary client-supplied Forwarded headers.
        const origin = request.headers.get("origin");
        const forwardedHost = request.headers.get("x-forwarded-host");
        if ((origin && !isTrustedMcpOrigin(origin)) || (forwardedHost && !isTrustedMcpOrigin(`https://${forwardedHost}`))) {
          return new Response("Untrusted MCP host origin.", { status: 400 });
        }
        return createTanStackMcpHandler(mcp, {
          resourcePath: "/mcp",
          metadataPath: "/.well-known/oauth-protected-resource",
          trustForwardedHost: Boolean(origin && isTrustedMcpOrigin(origin) && (!forwardedHost || isTrustedMcpOrigin(`https://${forwardedHost}`))),
        })(request, context as never);
      },
    },
  },
});
