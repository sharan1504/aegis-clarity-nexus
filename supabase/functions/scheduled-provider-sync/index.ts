import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const auth = req.headers.get('authorization');
  const expected = Deno.env.get('SCHEDULED_SYNC_SECRET');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: due, error } = await supabase
    .from('integrations')
    .select('id,tenant_id,provider,sync_interval_minutes,last_sync_attempted_at')
    .eq('status','connected')
    .eq('is_mock',false)
    .or('last_sync_attempted_at.is.null,last_sync_attempted_at.lt.now()')
    .limit(100);
  if (error) return Response.json({ ok:false, error:error.message }, { status:500 });

  const results = [];
  for (const integration of due ?? []) {
    const started = new Date().toISOString();
    await supabase.from('integrations').update({ last_sync_attempted_at: started }).eq('id', integration.id).eq('tenant_id', integration.tenant_id);
    const run = await supabase.from('integration_sync_runs').insert({ tenant_id:integration.tenant_id, integration_id:integration.id, trigger:'scheduled', status:'running', started_at:started }).select('id').single();
    try {
      // Provider sync implementations are invoked by the application's server-side sync endpoint.
      // The scheduler records the attempt; it never fabricates provider data. The deployment should
      // route this function to the same provider sync service used by Sync Now.
      const hook = Deno.env.get('PROVIDER_SYNC_INTERNAL_URL');
      if (!hook) throw new Error('Scheduled provider sync is not configured: PROVIDER_SYNC_INTERNAL_URL is missing.');
      const response = await fetch(hook, { method:'POST', headers:{'content-type':'application/json','x-scheduled-sync-secret':expected}, body:JSON.stringify({ integrationId:integration.id, tenantId:integration.tenant_id, provider:integration.provider }) });
      if (!response.ok) throw new Error(`Provider sync returned HTTP ${response.status}`);
      const finished = new Date().toISOString();
      await supabase.from('integrations').update({ last_sync_succeeded_at:finished,last_sync_error:null,last_sync_status:'success' }).eq('id',integration.id).eq('tenant_id',integration.tenant_id);
      if (run.data?.id) await supabase.from('integration_sync_runs').update({status:'success',finished_at:finished}).eq('id',run.data.id);
      results.push({integrationId:integration.id,status:'success'});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const finished = new Date().toISOString();
      await supabase.from('integrations').update({ last_sync_error:message,last_sync_status:'failed' }).eq('id',integration.id).eq('tenant_id',integration.tenant_id);
      if (run.data?.id) await supabase.from('integration_sync_runs').update({status:'failed',finished_at:finished,error_message:message}).eq('id',run.data.id);
      results.push({integrationId:integration.id,status:'failed',error:message});
    }
  }
  return Response.json({ok:true,results});
});
