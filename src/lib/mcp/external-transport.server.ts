import net from "node:net";

const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 8_000;
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.google.internal."]);

function ipv4Number(address: string): number | null {
  if (net.isIP(address) !== 4) return null;
  return address.split(".").reduce((n, part) => (n * 256 + Number(part)) >>> 0, 0);
}

function isBlockedIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) return true;
  const ranges: Array<[number, number]> = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
    [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
    [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
    [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
  ];
  return ranges.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
}

function isBlockedIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  if (net.isIP(value) !== 6) return true;
  if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
      /^fe[89ab]/.test(value) || value.startsWith("ff")) return true;
  const mapped = value.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

export function validateExternalMcpUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("External MCP URL is invalid."); }
  if (url.protocol !== "https:") throw new Error("External MCP servers must use HTTPS.");
  if (url.username || url.password) throw new Error("External MCP URLs must not include embedded credentials.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("External MCP URL must use a public, approved hostname.");
  }
  const ipFamily = net.isIP(host);
  if ((ipFamily === 4 && isBlockedIpv4(host)) || (ipFamily === 6 && isBlockedIpv6(host))) {
    throw new Error("External MCP URL must not target a private, local, or reserved IP address.");
  }
  return url;
}

async function assertPublicDnsHost(host: string): Promise<void> {
  if (net.isIP(host)) return;
  const dns = await import("node:dns/promises");
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await dns.lookup(host, { all: true, verbatim: true }); }
  catch { throw new Error("External MCP hostname could not be resolved safely."); }
  if (!addresses.length || addresses.some(({ address, family }) =>
    family === 4 ? isBlockedIpv4(address) : family === 6 ? isBlockedIpv6(address) : true
  )) throw new Error("External MCP hostname resolves to a private, local, or reserved IP address.");
}

async function postJsonRpc(urlValue: string, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const url = validateExternalMcpUrl(urlValue);
  await assertPublicDnsHost(url.hostname.replace(/^\[|\]$/g, ""));
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: controller.signal,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) throw new Error("External MCP redirects are not allowed.");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error("External MCP response exceeded the size limit.");
    if (!response.ok) throw new Error("External MCP request failed (" + response.status + ").");
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("External MCP server must return application/json; streaming transports are not enabled.");
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new Error("External MCP response exceeded the size limit.");
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new Error("External MCP server returned invalid JSON."); }
    if (!payload || typeof payload !== "object") throw new Error("External MCP server returned an invalid JSON-RPC response.");
    const record = payload as Record<string, unknown>;
    if (record.jsonrpc !== "2.0" || !("result" in record && record.id) && !("error" in record)) {
      throw new Error("External MCP server returned an invalid JSON-RPC envelope.");
    }
    return record;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("External MCP request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function listExternalMcpTools(url: string, token: string | null) {
  const payload = await postJsonRpc(url, token, "tools/list");
  if (payload.error) throw new Error("External MCP discovery failed.");
  const result = payload.result as Record<string, unknown> | undefined;
  return Array.isArray(result?.tools) ? result.tools.filter((tool) => !!tool && typeof tool === "object") : [];
}

export async function callExternalMcpTool(url: string, token: string | null, remoteToolName: string, input: unknown) {
  const payload = await postJsonRpc(url, token, "tools/call", {
    name: remoteToolName,
    arguments: input && typeof input === "object" && !Array.isArray(input) ? input : {},
  });
  if (payload.error) throw new Error("External MCP tool call failed.");
  if (!("result" in payload)) throw new Error("External MCP server returned no tool result.");
  return payload.result;
}
