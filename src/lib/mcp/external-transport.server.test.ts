import { afterEach, describe, expect, it, vi } from "vitest";
import { callExternalMcpTool, listExternalMcpTools, validateExternalMcpUrl } from "./external-transport.server";

describe("external MCP transport safety", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "http://example.com/mcp",
    "https://localhost/mcp",
    "https://127.0.0.1/mcp",
    "https://10.1.2.3/mcp",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/mcp",
    "https://[fc00::1]/mcp",
    "https://user:pass@example.com/mcp",
    "https://service.local/mcp",
  ])("rejects unsafe MCP URL %s", (url) => {
    expect(() => validateExternalMcpUrl(url)).toThrow();
  });

  it("accepts a syntactically valid HTTPS public host", () => {
    expect(validateExternalMcpUrl("https://mcp.example.com/rpc").hostname).toBe("mcp.example.com");
  });

  it("refuses redirects rather than forwarding bearer credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", {
      status: 302, headers: { location: "https://elsewhere.example/rpc" },
    })));
    await expect(listExternalMcpTools("https://example.com/mcp", "secret")).rejects.toThrow("redirects are not allowed");
  });

  it("rejects non-JSON content types", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("event: message", {
      status: 200, headers: { "content-type": "text/event-stream" },
    })));
    await expect(listExternalMcpTools("https://example.com/mcp", null)).rejects.toThrow("application/json");
  });

  it("rejects malformed JSON-RPC envelopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { tools: [] } }), {
      status: 200, headers: { "content-type": "application/json" },
    })));
    await expect(listExternalMcpTools("https://example.com/mcp", null)).rejects.toThrow("invalid JSON-RPC");
  });

  it("requires a tool result and keeps invocation method bounded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { content: [] } }), {
      status: 200, headers: { "content-type": "application/json" },
    })));
    await expect(callExternalMcpTool("https://example.com/mcp", null, "read", { q: 1 })).resolves.toEqual({ content: [] });
  });
});
