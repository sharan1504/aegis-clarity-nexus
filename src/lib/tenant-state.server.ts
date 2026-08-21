import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { createServerFn } from '@tanstack/react-start';

export const getTenantSetupState = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from('profiles').select('tenant_id').eq('id', context.userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.tenant_id) return { tenantId:null, providers:0, agents:0, guardrails:0 };
    const tenantId = profile.tenant_id;
    const [{ count: providers, error: providersError }, { count: agents, error: agentsError }, { count: guardrails, error: guardrailsError }] = await Promise.all([
      context.supabase.from('integrations').select('id', { count:'exact', head:true }).eq('tenant_id',tenantId).eq('status','connected').eq('is_mock',false),
      context.supabase.from('agent_integration_bindings').select('id', { count:'exact', head:true }).eq('tenant_id',tenantId).eq('enabled',true).eq('is_mock',false),
      context.supabase.from('guardrails').select('id', { count:'exact', head:true }).eq('tenant_id',tenantId).eq('is_system',false).eq('enabled',true),
    ]);
    if (providersError) throw providersError;
    if (agentsError) throw agentsError;
    if (guardrailsError) throw guardrailsError;
    return { tenantId, providers:providers ?? 0, agents:agents ?? 0, guardrails:guardrails ?? 0 };
  });
