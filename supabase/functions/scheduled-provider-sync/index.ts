import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function jobKey(tenantId: string, integrationId: string, slot: string) {
  return `provider-sync:${tenantId}:${integrationId}:${slot}`;
}

async function enqueue(payload: Record<string, unknown>) {
  const url = Deno.env.get('JOB_QUEUE_URL');
  const secret = Deno.env.get('AEGIS_JOB_QUEUE_SECRET');
  if (!url || !secret) throw new Error('Durable job queue is not configured: JOB_QUEUE_URL/AEGIS_JOB_QUEUE_SECRET is missing.');
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Job queue returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const auth = req.headers.get('authorization');
  const expected = Deno.env.get('SCHEDULED_SYNC_SECRET');
  if (!expected || auth !== `Bearer ${expected}`) return new Response('Unauthorized', { status: 401 });

  const { data: due, error } = await supabase.from('integrations')
    .select('id,tenant_id,provider,sync_interval_minutes,last_sync_attempted_at')
    .eq('status', 'connected').eq('is_mock', false)
    .or('last_sync_attempted_at.is.null,last_sync_attempted_at.lt.now()').limit(100);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const slot = new Date(Math.floor(Date.now() / 900000) * 900000).toISOString();
  const results = [];
  for (const integration of due ?? []) {
    const idempotencyKey = jobKey(integration.tenant_id, integration.id, slot);
    const started = new Date().toISOString();
    const { data: run, error: runError } = await supabase.from('provider_sync_runs').insert({
      tenant_id: integration.tenant_id, provider: integration.provider, connection_id: integration.id,
      idempotency_key: idempotencyKey, status: 'running', started_at: started,
    }).select('id').maybeSingle();
    if (runError) {
      if (String(runError.message).toLowerCase().includes('duplicate')) {
        results.push({ integrationId: integration.id, status: 'already-enqueued', idempotencyKey });
        continue;
      }
      results.push({ integrationId: integration.id, status: 'failed', error: runError.message });
      continue;
    }
    try {
      await supabase.from('integrations').update({ last_sync_attempted_at: started }).eq('id', integration.id).eq('tenant_id', integration.tenant_id);
      const queued = await enqueue({
        queue: 'aegis.provider-sync', idempotencyKey, tenantId: integration.tenant_id,
        payload: { integrationId: integration.id, tenantId: integration.tenant_id, provider: integration.provider, syncRunId: run?.id ?? null },
      });
      results.push({ integrationId: integration.id, status: 'queued', jobId: queued.jobId ?? null, idempotencyKey });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (run?.id) await supabase.from('provider_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error_message: message.slice(0, 2000) }).eq('id', run.id).eq('tenant_id', integration.tenant_id);
      results.push({ integrationId: integration.id, status: 'failed', error: message });
    }
  }
  return Response.json({ ok: true, results });
});
