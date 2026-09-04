import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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
  const expected = Deno.env.get('WEBHOOK_DISPATCH_SECRET');
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) return new Response('Unauthorized', { status: 401 });
  const now = new Date().toISOString();
  const { data: jobs, error } = await db.from('webhook_outbox')
    .select('id,tenant_id,webhook_id,audit_log_id,event_type,payload,attempts')
    .eq('status', 'pending').lte('next_attempt_at', now).order('created_at').limit(100);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results = [];
  for (const job of jobs ?? []) {
    const claim = await db.from('webhook_outbox').update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', 'pending').select('id').maybeSingle();
    if (!claim.data?.id) continue;
    const idempotencyKey = `webhook:${job.tenant_id}:${job.id}`;
    try {
      const queued = await enqueue({ queue: 'aegis.webhook-delivery', idempotencyKey, tenantId: job.tenant_id, payload: { ...job, idempotencyKey } });
      results.push({ id: job.id, status: 'queued', jobId: queued.jobId ?? null, idempotencyKey });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from('webhook_outbox').update({ status: 'pending', last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', job.id);
      results.push({ id: job.id, status: 'queue-failed', error: message });
    }
  }
  return Response.json({ ok: true, results });
});
