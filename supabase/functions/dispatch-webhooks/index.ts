import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const encoder = new TextEncoder();
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600];

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const expected = Deno.env.get('WEBHOOK_DISPATCH_SECRET');
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date().toISOString();
  const { data: jobs, error } = await db
    .from('webhook_outbox')
    .select('id,tenant_id,webhook_id,audit_log_id,event_type,payload,attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', now)
    .order('created_at')
    .limit(50);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results = [];
  for (const job of jobs ?? []) {
    const claim = await db.from('webhook_outbox').update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', 'pending').select('id').maybeSingle();
    if (!claim.data?.id) continue;

    const { data: webhook } = await db.from('webhooks').select('target_url,secret,enabled').eq('id', job.webhook_id).eq('tenant_id', job.tenant_id).maybeSingle();
    if (!webhook?.enabled) {
      await db.from('webhook_outbox').update({ status: 'failed', last_error: 'Webhook is disabled or no longer exists.', updated_at: new Date().toISOString() }).eq('id', job.id);
      continue;
    }

    const body = JSON.stringify(job.payload);
    const signature = await sign(webhook.secret, body);
    const attempt = Number(job.attempts ?? 0) + 1;
    const attemptedAt = new Date().toISOString();
    try {
      const response = await fetch(webhook.target_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Aegis-AI-Webhooks/1.0',
          'x-aegis-event': job.event_type,
          'x-aegis-delivery-id': job.id,
          'x-aegis-signature-256': `sha256=${signature}`,
        },
        body,
        redirect: 'error',
      });
      const text = await response.text();
      const success = response.status >= 200 && response.status < 300;
      await db.from('webhook_delivery_attempts').insert({
        tenant_id: job.tenant_id, webhook_id: job.webhook_id, audit_log_id: job.audit_log_id,
        event_type: job.event_type, attempt, status_code: response.status, success,
        error_message: success ? null : text.slice(0, 1000), attempted_at: attemptedAt,
      });
      if (success) {
        await db.from('webhook_outbox').update({ status: 'delivered', attempts: attempt, last_error: null, updated_at: new Date().toISOString() }).eq('id', job.id);
        results.push({ id: job.id, status: 'delivered' });
      } else {
        const delay = RETRY_DELAYS_SECONDS[Math.min(attempt - 1, RETRY_DELAYS_SECONDS.length - 1)];
        const exhausted = attempt >= 5;
        await db.from('webhook_outbox').update({
          status: exhausted ? 'failed' : 'pending', attempts: attempt, last_error: `HTTP ${response.status}: ${text.slice(0, 1000)}`,
          next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', job.id);
        results.push({ id: job.id, status: exhausted ? 'failed' : 'retrying' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const delay = RETRY_DELAYS_SECONDS[Math.min(attempt - 1, RETRY_DELAYS_SECONDS.length - 1)];
      const exhausted = attempt >= 5;
      await db.from('webhook_delivery_attempts').insert({
        tenant_id: job.tenant_id, webhook_id: job.webhook_id, audit_log_id: job.audit_log_id,
        event_type: job.event_type, attempt, success: false, error_message: message.slice(0, 1000), attempted_at: attemptedAt,
        next_retry_at: exhausted ? null : new Date(Date.now() + delay * 1000).toISOString(),
      });
      await db.from('webhook_outbox').update({
        status: exhausted ? 'failed' : 'pending', attempts: attempt, last_error: message.slice(0, 1000),
        next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      results.push({ id: job.id, status: exhausted ? 'failed' : 'retrying' });
    }
  }

  return Response.json({ ok: true, results });
});
