import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:dns";
import { lookup } from "node:dns/promises";

const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 3_000;
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function ipv4Number(address: string): number | null {
  if (net.isIP(address) !== 4) return null;
  return address.split(".").reduce((n, part) => n * 256 + Number(part), 0);
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
  return ranges.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

function isBlockedIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  if (net.isIP(value) !== 6) return true;
  if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
      /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8") ||
      value.startsWith("2002:") || value.startsWith("::ffff:")) return true;
  // Remote MCP connections only accept globally scoped unicast IPv6 (2000::/3).
  const first = Number.parseInt(value.split(":")[0] || "0", 16);
  return !Number.isFinite(first) || first < 0x2000 || first > 0x3fff;
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
  const family = net.isIP(host);
  if ((family === 4 && isBlockedIpv4(host)) || (family === 6 && isBlockedIpv6(host))) {
    throw new Error("External MCP URL must not target a private, local, or reserved IP address.");
  }
  return url;
}

type PublicAddress = { address: string; family: 4 | 6 };

export async function withDnsTimeout<T>(operation: Promise<T>, timeoutMs = DNS_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("External MCP DNS lookup timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function resolvePublicAddress(hostname: string): Promise<PublicAddress> {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const family = net.isIP(host);
  if (family === 4) {
    if (isBlockedIpv4(host)) throw new Error("External MCP URL must not target a private, local, or reserved IP address.");
    return { address: host, family: 4 };
  }
  if (family === 6) {
    if (isBlockedIpv6(host)) throw new Error("External MCP URL must not target a private, local, or reserved IP address.");
    return { address: host, family: 6 };
  }
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await withDnsTimeout(lookup(host, { all: true, verbatim: true })); }
  catch { throw new Error("External MCP hostname could not be resolved safely."); }
  if (!addresses.length || addresses.some((item) => item.family === 4 ? isBlockedIpv4(item.address) : item.family === 6 ? isBlockedIpv6(item.address) : true)) {
    throw new Error("External MCP hostname resolves to a private, local, or reserved IP address.");
  }
  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) throw new Error("External MCP hostname could not be resolved safely.");
  return { address: selected.address, family: selected.family };
}

type JsonRpcEnvelope = Record<string, unknown> & { jsonrpc: "2.0"; id: string | number; result?: unknown; error?: unknown };

async function postJsonRpc(urlValue: string, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const url = validateExternalMcpUrl(urlValue);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const pinned = await resolvePublicAddress(hostname);
  const id = crypto.randomUUID();
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "content-length": String(Buffer.byteLength(payload, "utf8")),
  };
  if (token) headers.authorization = "Bearer " + token;

  return new Promise<JsonRpcEnvelope>((resolve, reject) => {
    let settled = false;
    let responseBytes = 0;
    const chunks: Buffer[] = [];
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request(url, {
      method: "POST",
      headers,
      rejectUnauthorized: true,
      servername: net.isIP(hostname) ? undefined : hostname,
      lookup: ((requestedHostname, options, callback) => {
        // Pin the exact public DNS result checked above. Do not perform a second DNS lookup
        // after validation; preserve the original hostname for the HTTP Host header and TLS SNI.
        if (requestedHostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase() !== hostname.toLowerCase()) {
          callback(new Error("Unexpected hostname during external MCP connection."));
          return;
        }
        if (typeof options === "object" && options !== null && "all" in options && options.all) {
          callback(null, [{ address: pinned.address, family: pinned.family }]);
        } else {
          callback(null, pinned.address, pinned.family);
        }
      }) as LookupFunction,
    }, (response) => {
      if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
        response.destroy();
        request.destroy();
        finishError(new Error("External MCP redirects are not allowed."));
        return;
      }
      if ((Number(response.headers["content-length"] ?? 0) || 0) > MAX_RESPONSE_BYTES) {
        response.destroy();
        request.destroy();
        finishError(new Error("External MCP response exceeded the size limit."));
        return;
      }
      if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
        response.resume();
        finishError(new Error("External MCP request failed (" + response.statusCode + ")."));
        return;
      }
      if (!(response.headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
        response.destroy();
        request.destroy();
        finishError(new Error("External MCP server must return application/json; streaming transports are not enabled."));
        return;
      }
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        responseBytes += bytes.length;
        if (responseBytes > MAX_RESPONSE_BYTES) {
          response.destroy();
          request.destroy();
          finishError(new Error("External MCP response exceeded the size limit."));
          return;
        }
        chunks.push(bytes);
      });
      response.on("end", () => {
        if (settled) return;
        let parsed: unknown;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { finishError(new Error("External MCP server returned invalid JSON.")); return; }
        if (!parsed || typeof parsed !== "object") {
          finishError(new Error("External MCP server returned an invalid JSON-RPC response."));
          return;
        }
        const record = parsed as Record<string, unknown>;
        if (record.jsonrpc !== "2.0" || record.id !== id || ("result" in record) === ("error" in record)) {
          finishError(new Error("External MCP server returned an invalid JSON-RPC envelope."));
          return;
        }
        settled = true;
        resolve(record as JsonRpcEnvelope);
      });
      response.on("error", (error) => finishError(error));
    });
    const timer = setTimeout(() => {
      request.destroy(new Error("External MCP request timed out."));
    }, REQUEST_TIMEOUT_MS);
    request.on("error", (error) => {
      clearTimeout(timer);
      if (error.message.includes("timed out")) finishError(new Error("External MCP request timed out."));
      else finishError(error);
    });
    request.on("close", () => clearTimeout(timer));
    request.end(payload);
  });
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
