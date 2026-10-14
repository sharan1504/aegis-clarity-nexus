import { afterEach, describe, expect, it, vi } from "vitest";
import https from "node:https";
import { EventEmitter } from "node:events";
import { callExternalMcpTool, listExternalMcpTools, validateExternalMcpUrl } from "./external-transport.server";

function stubHttps(response: { statusCode: number; headers?: Record<string, string>; body?: string }) {
  vi.spyOn(https, "request").mockImplementation(((input: any, options: any, callback: any) => {
    const request = new EventEmitter() as any;
    request.destroy = vi.fn((error?: Error) => { if (error) request.emit("error", error); return request; });
    request.end = vi.fn(() => {
      const incoming = new EventEmitter() as any;
      incoming.statusCode = response.statusCode;
      incoming.headers = response.headers ?? { "content-type": "application/json" };
      incoming.destroy = vi.fn();
      incoming.resume = vi.fn();
      callback(incoming);
      if (response.body) incoming.emit("data", response.body);
      incoming.emit("end");
      request.emit("close");
    });
    return request;
  }) as any);
}

describe("external MCP transport safety", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    "http://example.com/mcp",
    "https://localhost/mcp",
    "https://127.0.0.1/mcp",
    "https://10.1.2.3/mcp",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/mcp",
    "https://[fc00::1]/mcp",
    "https://[2001:db8::1]/mcp",
    "https://user:pass@example.com/mcp",
    "https://service.local/mcp",
  ])("rejects unsafe MCP URL %s", (url) => {
    expect(() => validateExternalMcpUrl(url)).toThrow();
  });

  it("accepts a syntactically valid HTTPS public host", () => {
    expect(validateExternalMcpUrl("https://mcp.example.com/rpc").hostname).toBe("mcp.example.com");
  });

  it("refuses redirects and never follows them", async () => {
    stubHttps({ statusCode: 302, headers: { location: "https://elsewhere.example/rpc" } });
    await expect(listExternalMcpTools("https://8.8.8.8/mcp", "secret")).rejects.toThrow("redirects are not allowed");
  });

  it("rejects non-JSON content types", async () => {
    stubHttps({ statusCode: 200, headers: { "content-type": "text/event-stream" }, body: "event: message" });
    await expect(listExternalMcpTools("https://8.8.8.8/mcp", null)).rejects.toThrow("application/json");
  });

  it("rejects malformed JSON-RPC envelopes", async () => {
    stubHttps({ statusCode: 200, body: JSON.stringify({ jsonrpc: "2.0", id: "wrong", result: { tools: [] } }) });
    await expect(listExternalMcpTools("https://8.8.8.8/mcp", null)).rejects.toThrow("invalid JSON-RPC");
  });

  it("accepts a matching JSON-RPC response and returns tool data", async () => {
    vi.spyOn(https, "request").mockImplementation(((input: any, options: any, callback: any) => {
      const request = new EventEmitter() as any;
      request.destroy = vi.fn((error?: Error) => { if (error) request.emit("error", error); return request; });
      request.end = vi.fn((body: string) => {
        const sent = JSON.parse(body);
        const incoming = new EventEmitter() as any;
        incoming.statusCode = 200;
        incoming.headers = { "content-type": "application/json" };
        incoming.destroy = vi.fn();
        incoming.resume = vi.fn();
        callback(incoming);
        incoming.emit("data", JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: { content: [{ type: "text", text: "ok" }] } }));
        incoming.emit("end");
        request.emit("close");
      });
      return request;
    }) as any);
    await expect(callExternalMcpTool("https://8.8.8.8/mcp", null, "read", { q: 1 })).resolves.toEqual({ content: [{ type: "text", text: "ok" }] });
  });
});
