import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveTenant } from "@/lib/genesys/store.server";
import { DEMO_DATA_ENABLED, DEMO_INVESTIGATIONS } from "@/lib/demo-data";

export type CustomerInvestigationTrail = { investigation: Record<string, unknown>; steps: Array<Record<string, unknown>>; toolInvocations: Array<Record<string, unknown>>; resolutions: Array<Record<string, unknown>> };

export const getCustomerInvestigationEvidence = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((input: { investigationId: string }) => { const investigationId = String(input?.investigationId ?? "").trim(); if (!investigationId) throw new Error("An investigation ID is required."); return { investigationId }; }).handler(async ({ data, context }) => {
  if (DEMO_DATA_ENABLED) {
    const item = DEMO_INVESTIGATIONS.find((candidate) => candidate.id === data.investigationId) ?? DEMO_INVESTIGATIONS[0];
    if (!item) throw new Error("Demo investigation not found.");
    return { investigation: { ...item, demo: true }, steps: [
      { step_number: 1, step_type: "intent", name: "Classify customer request", status: "completed", finding: `Intent classified as ${item.intent}.` },
      { step_number: 2, step_type: "tool_call", name: "Get customer profile", provider: "Demo CRM", tool_name: "getCustomerProfile", input: { customerId: item.customer }, output: { customerId: item.customer, tier: "Gold", verified: true }, status: "completed", latency_ms: 82 },
      { step_number: 3, step_type: "tool_call", name: "Check order and shipment", provider: "Demo OMS", tool_name: "getShipmentStatus", input: { orderId: "ORD-DEMO-8821" }, output: { carrier: "Demo Carrier", status: "delayed", lastScan: "2026-09-04T06:30:00Z" }, status: "completed", latency_ms: 118 },
      { step_number: 4, step_type: "evidence", name: "Correlate inventory", provider: "Demo ERP", tool_name: "getWarehouseInventory", input: { sku: "SKU-DEMO-11" }, output: { available: 42, warehouse: "BLR-01" }, status: "completed", latency_ms: 104 },
      { step_number: 5, step_type: "decision", name: "Determine resolution", finding: "Replacement is available and within policy.", status: "completed" },
      { step_number: 6, step_type: "verification", name: "Verify resolution", output: { replacementCreated: true, notificationQueued: true }, status: "completed", latency_ms: 90 },
    ], toolInvocations: [
      { id: "demo-tool-1", provider: "Demo CRM", server_name: "crm", tool_name: "getCustomerProfile", arguments: { customerId: item.customer }, result: { tier: "Gold", verified: true }, status: "success", latency_ms: 82, started_at: item.createdAt },
      { id: "demo-tool-2", provider: "Demo OMS", server_name: "oms", tool_name: "getShipmentStatus", arguments: { orderId: "ORD-DEMO-8821" }, result: { status: "delayed", carrier: "Demo Carrier" }, status: "success", latency_ms: 118, started_at: item.createdAt },
      { id: "demo-tool-3", provider: "Demo ERP", server_name: "erp", tool_name: "getWarehouseInventory", arguments: { sku: "SKU-DEMO-11" }, result: { available: 42 }, status: "success", latency_ms: 104, started_at: item.createdAt },
    ], resolutions: [{ channel: item.channel, response_text: item.response, resolution_type: item.status, evidence_summary: ["Customer profile verified", "Shipment delay confirmed", "Replacement inventory confirmed"], verified: true }] } satisfies CustomerInvestigationTrail;
  }
  const { tenantId } = await resolveTenant(context.supabase, context.userId); const db = context.supabase as any;
  const [investigation, steps, tools, resolutions] = await Promise.all([db.from("customer_investigations").select("*").eq("id", data.investigationId).eq("tenant_id", tenantId).maybeSingle(), db.from("investigation_steps").select("*").eq("investigation_id", data.investigationId).eq("tenant_id", tenantId).order("step_number", { ascending: true }), db.from("tool_invocations").select("*").eq("investigation_id", data.investigationId).eq("tenant_id", tenantId).order("started_at", { ascending: true }), db.from("customer_resolutions").select("*").eq("investigation_id", data.investigationId).eq("tenant_id", tenantId).order("created_at", { ascending: true })]);
  if (investigation.error) throw new Error(investigation.error.message); if (!investigation.data) throw new Error("Investigation not found in your tenant."); if (steps.error) throw new Error(steps.error.message); if (tools.error) throw new Error(tools.error.message); if (resolutions.error) throw new Error(resolutions.error.message);
  return { investigation: investigation.data, steps: steps.data ?? [], toolInvocations: tools.data ?? [], resolutions: resolutions.data ?? [] } satisfies CustomerInvestigationTrail;
});
