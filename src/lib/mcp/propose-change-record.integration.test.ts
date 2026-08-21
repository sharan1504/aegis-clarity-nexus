import { describe, expect, it } from "vitest";
import proposeChangeRecord from "@/lib/mcp/tools/propose-change-record";
import { userClientFromToken } from "@/lib/execution/gateway.server";

const token = process.env.AEGIS_TEST_TOKEN;
const userId = process.env.AEGIS_TEST_USER_ID;

describe("MCP propose_change_record", () => {
  it.runIf(Boolean(token && userId))("creates a Proposed record with pending approval and ignores lifecycle overrides", async () => {
    const supabase = userClientFromToken(token!);
    const ctx = {
      isAuthenticated: () => true,
      token,
      userId,
    };
    const result = await proposeChangeRecord.handler({
      title: "MCP proposal integration test",
      businessImpact: "Integration test only; no provider mutation is requested.",
      aiReasoning: "Verifies that the MCP proposal surface enters the approval pipeline.",
      proposedRiskFactors: ["Test-only proposed risk factor"],
      targetProvider: "test-provider",
      targetAgent: "test-agent",
      stage: "Executed",
      approvalStatus: "approved",
      executionMode: "Automatic",
      executed: true,
    } as never, ctx as never);

    expect(result.structuredContent).toMatchObject({ approvalStatus: "pending", executionStatus: "not_executed", stage: "Proposed" });
    const changeId = (result.structuredContent as { changeId: string }).changeId;
    const { data: row, error } = await supabase.from("change_records").select("id,stage,execution_mode").eq("change_id", changeId).single();
    expect(error).toBeNull();
    expect(row?.stage).toBe("Proposed");
    expect(row?.execution_mode).toBe("Manual");
    const { data: approval } = await supabase.from("change_approvals").select("status").eq("change_record_id", row!.id).single();
    expect(approval?.status).toBe("pending");
  });
});
