import { createHmac } from "node:crypto";

type AnchorRequest = { id: string; tenant_id: string; chain_sequence: number; head_hash: string; attempts: number };

function anchorUrl(): URL {
  const raw = process.env.AUDIT_ANCHOR_URL;
  if (!raw) throw new Error("AUDIT_ANCHOR_URL is not configured.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("AUDIT_ANCHOR_URL must be an HTTPS URL without credentials or a fragment.");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) {
    throw new Error("AUDIT_ANCHOR_URL cannot target a loopback host.");
  }
  return url;
}

export async function deliverPendingAuditAnchors(db: any, limit = 25) {
  const secret = process.env.AUDIT_ANCHOR_HMAC_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIT_ANCHOR_HMAC_SECRET must be configured with at least 32 characters.");
  const endpoint = anchorUrl();
  const { data: rows, error } = await db.from("audit_chain_anchor_outbox")
    .select("id,tenant_id,chain_sequence,head_hash,attempts")
    .in("status", ["pending", "failed"])
    .order("requested_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(`Unable to load pending audit anchors: ${error.message}`);

  const results: Array<{ id: string; status: "anchored" | "failed"; error?: string }> = [];
  for (const row of (rows ?? []) as AnchorRequest[]) {
    const body = JSON.stringify({
      schema: "cenops.audit-anchor.v1",
      tenantId: row.tenant_id,
      sequence: row.chain_sequence,
      headHash: row.head_hash,
      requestedAt: new Date().toISOString(),
    });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cenops-signature": `sha256=${signature}` },
        body,
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      const responseText = await response.text();
      if (!response.ok) throw new Error(`Anchor service returned HTTP ${response.status}.`);
      let receipt: any;
      try { receipt = JSON.parse(responseText); } catch { throw new Error("Anchor service returned invalid JSON."); }
      if (typeof receipt.anchorId !== "string" || receipt.headHash !== row.head_hash) {
        throw new Error("Anchor receipt did not confirm the exact submitted head hash.");
      }
      const { error: updateError } = await db.from("audit_chain_anchor_outbox").update({
        status: "anchored", external_reference: receipt.anchorId,
        anchor_response: receipt, last_error: null, attempts: row.attempts + 1,
        anchored_at: new Date().toISOString(),
      }).eq("id", row.id).eq("head_hash", row.head_hash);
      if (updateError) throw new Error(`Unable to persist anchor receipt: ${updateError.message}`);
      results.push({ id: row.id, status: "anchored" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown anchor delivery failure.";
      await db.from("audit_chain_anchor_outbox").update({
        status: "failed", last_error: message.slice(0, 1000), attempts: row.attempts + 1,
      }).eq("id", row.id).eq("head_hash", row.head_hash);
      results.push({ id: row.id, status: "failed", error: message });
    }
  }
  return { processed: results.length, anchored: results.filter((r) => r.status === "anchored").length, failed: results.filter((r) => r.status === "failed").length, results };
}
