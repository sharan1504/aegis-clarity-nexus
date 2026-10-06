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

  const { data: integrations, error } = await supabase.from('integrations')
    .select('id,tenant_id,provider,sync_interval_minutes,last_sync_attempted_at')
    .eq('status', 'connected').eq('is_mock', false).limit(100);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const tenantIds = [...new Set((integrations ?? []).map((row) => row.tenant_id))];
  const { data: providerHealth, error: providerHealthError } = tenantIds.length
    ? await supabase.from('provider_connections').select('id,tenant_id,provider,status,health_status,last_sync_attempted_at').in('tenant_id', tenantIds)
    : { data: [], error: null };
  if (providerHealthError) return Response.json({ ok: false, error: providerHealthError.message }, { status: 500 });
  const providerHealthByKey = new Map((providerHealth ?? []).map((row) => [`${row.tenant_id}:${row.provider}`, row]));
  const now = Date.now();
  const isDue = (lastAttemptedAt: string | null | undefined, intervalMinutes: number) => !lastAttemptedAt || !Number.isFinite(new Date(lastAttemptedAt).getTime()) || now - new Date(lastAttemptedAt).getTime() >= intervalMinutes * 60_000;
  const due = (integrations ?? []).filter((integration) => {
    const health = providerHealthByKey.get(`${integration.tenant_id}:${integration.provider}`);
    const interval = health?.health_status === 'degraded' ? 360 : Number(integration.sync_interval_minutes ?? 60);
    return isDue(integration.last_sync_attempted_at, interval);
  });

  const { data: githubConnections, error: githubError } = await supabase
    .from('provider_connections')
    .select('id,tenant_id,provider,status,updated_at')
    .eq('provider', 'github').in('status', ['connected', 'failed']).limit(100);
  if (githubError) return Response.json({ ok: false, error: githubError.message }, { status: 500 });
  const githubIds = (githubConnections ?? []).map((connection) => connection.id);
  const { data: githubStatuses, error: githubStatusError } = githubIds.length
    ? await supabase.from('github_sync_status').select('tenant_id,connection_id,last_attempted_at').in('connection_id', githubIds)
    : { data: [], error: null };
  if (githubStatusError) return Response.json({ ok: false, error: githubStatusError.message }, { status: 500 });

  const { data: m365Connections, error: m365Error } = await supabase
    .from('provider_connections')
    .select('id,tenant_id,provider,status,last_sync_attempted_at')
    .eq('provider', 'm365')
    .in('status', ['connected', 'failed'])
    .limit(100);
  if (m365Error) return Response.json({ ok: false, error: m365Error.message }, { status: 500 });

  const slot = new Date(Math.floor(Date.now() / 900000) * 900000).toISOString();
  const results: Array<Record<string, unknown>> = [];
  const enqueueSync = async (tenantId: string, integrationId: string, provider: string, syncIntervalMinutes: number | null = null) => {
    const idempotencyKey = jobKey(tenantId, integrationId, slot);
    const started = new Date().toISOString();
    const { data: run, error: runError } = await supabase.from('provider_sync_runs').insert({ tenant_id: tenantId, provider, connection_id: integrationId, idempotency_key: idempotencyKey, status: 'running', started_at: started }).select('id').maybeSingle();
    if (runError) {
      if (String(runError.message).toLowerCase().includes('duplicate')) { results.push({ integrationId, status: 'already-enqueued', idempotencyKey }); return; }
      results.push({ integrationId, status: 'failed', error: runError.message }); return;
    }
    try {
      if (provider === 'github') {
        await supabase.from('provider_connections').update({ last_sync_attempted_at: started, updated_at: started }).eq('id', integrationId).eq('tenant_id', tenantId);
        const queued = await enqueue({ queue: 'aegis.provider-sync', idempotencyKey, tenantId, payload: { integrationId, tenantId, provider, syncRunId: run?.id ?? null, entityScope: 'all' } });
        results.push({ integrationId, provider, status: 'queued', jobId: queued.jobId ?? null, idempotencyKey });
      } else {
        await supabase.from('integrations').update({ last_sync_attempted_at: started }).eq('id', integrationId).eq('tenant_id', tenantId);
        await supabase.from('provider_connections').update({ last_sync_attempted_at: started, updated_at: started }).eq('id', integrationId).eq('tenant_id', tenantId);
        const queued = await enqueue({ queue: 'aegis.provider-sync', idempotencyKey, tenantId, payload: { integrationId, tenantId, provider, syncRunId: run?.id ?? null } });
        results.push({ integrationId, provider, status: 'queued', jobId: queued.jobId ?? null, idempotencyKey });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (run?.id) await supabase.from('provider_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error_message: message.slice(0, 2000) }).eq('id', run.id).eq('tenant_id', tenantId);
      results.push({ integrationId, provider, status: 'failed', error: message, syncIntervalMinutes });
    }
  };

  for (const integration of due ?? []) await enqueueSync(integration.tenant_id, integration.id, integration.provider, integration.sync_interval_minutes);
  const githubStatusByConnection = new Map((githubStatuses ?? []).map((status) => [status.connection_id, status]));
  for (const connection of githubConnections ?? []) {
    const health = providerHealthByKey.get(`${connection.tenant_id}:github`);
    const lastAttempted = githubStatusByConnection.get(connection.id)?.last_attempted_at ?? connection.last_sync_attempted_at;
    const interval = health?.health_status === 'degraded' ? 360 : 15;
    if (!isDue(lastAttempted, interval)) continue;
    await enqueueSync(connection.tenant_id, connection.id, 'github', interval);
  }

  for (const connection of m365Connections ?? []) {
    const health = providerHealthByKey.get(`${connection.tenant_id}:m365`);
    const lastAttempted = connection.last_sync_attempted_at;
    const interval = health?.health_status === 'degraded' ? 360 : 60;
    if (!isDue(lastAttempted, interval)) continue;
    await enqueueSync(connection.tenant_id, connection.id, 'm365', interval);
  }

  return Response.json({ ok: true, results });
});
