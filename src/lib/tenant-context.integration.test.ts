import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { resolveTenantContext } from "./tenant-context.server";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testUserId = process.env.AEGIS_TEST_USER_ID;

const liveIntegrationReady = Boolean(supabaseUrl && serviceRoleKey && testUserId);

describe.skipIf(!liveIntegrationReady)("resolveTenantContext live schema integration", () => {
  it("resolves environmentMode for a real test tenant", async () => {
    const supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const context = await resolveTenantContext(supabase, testUserId!);

    expect(context.tenantId).toBeTruthy();
    expect(["live", "demo"]).toContain(context.environmentMode);
  });
});
