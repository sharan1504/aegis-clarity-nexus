import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { PgBoss } from 'pg-boss';
import { createClient } from '@supabase/supabase-js';

const connectionString = process.env.PGBOSS_DATABASE_URL ?? process.env.DATABASE_URL;
const queueSecret = process.env.AEGIS_JOB_QUEUE_SECRET;
const port = Number(process.env.AEGIS_JOB_WORKER_PORT ?? 8787);
if (!connectionString) throw new Error('PGBOSS_DATABASE_URL or DATABASE_URL is required.');
if (!queueSecret) throw new Error('AEGIS_JOB_QUEUE_SECRET is required.');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const db = createClient(supabaseUrl, serviceRoleKey);

const QUEUES = {
  provider: 'aegis.provider-sync', webhook: 'aegis.webhook-delivery', externalTicket: 'aegis.external-ticket',
  providerDlq: 'aegis.provider-sync-dlq', webhookDlq: 'aegis.webhook-delivery-dlq', externalTicketDlq: 'aegis.external-ticket-dlq',
};
const RETRY = { retryLimit: 4, retryDelay: 30, retryBackoff: true, retryDelayMax: 1800, heartbeatSeconds: 60 };
const boss = new PgBoss({ connectionString, schema: process.env.PGBOSS_SCHEMA ?? 'pgboss', monitorStateIntervalSeconds: 60 });
boss.on('error', (error) => console.error(JSON.stringify({ component: 'pgboss', level: 'error', error: error.message })));

async function postInternal(url, payload, secretName) {
  if (!url) throw new Error(`Internal job handler URL is not configured for ${secretName}.`);
  const secret = process.env[secretName];
  if (!secret) throw new Error(`${secretName} is not configured.`);
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}`, 'x-aegis-job-worker': 'pg-boss' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Internal job handler returned HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
  return await response.json().catch(() => ({}));
}

async function markProviderRun(data, status, errorMessage = null) {
  if (!data.syncRunId) return;
  await db.from('provider_sync_runs').update({ status, finished_at: new Date().toISOString(), error_message: errorMessage }).eq('id', data.syncRunId).eq('tenant_id', data.tenantId);
}

async function deliverWebhook(data, retryCount = 0) {
  const { data: webhook, error: webhookError } = await db.from('webhooks').select('target_url,secret,enabled').eq('id', data.webhook_id).eq('tenant_id', data.tenant_id).maybeSingle();
  if (webhookError) throw webhookError;
  if (!webhook?.enabled) {
    await db.from('webhook_outbox').update({ status: 'failed', last_error: 'Webhook is disabled or no longer exists.', updated_at: new Date().toISOString() }).eq('id', data.id).eq('tenant_id', data.tenant_id);
    return { skipped: true };
  }
  const body = JSON.stringify(data.payload);
  const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');
  const attempt = retryCount + 1;
  const idempotencyKey = `webhook:${data.tenant_id}:${data.id}:attempt:${attempt}`;
  const attemptedAt = new Date().toISOString();
  const { data: prior } = await db.from('webhook_delivery_attempts').select('success,status_code').eq('tenant_id', data.tenant_id).eq('idempotency_key', idempotencyKey).maybeSingle();
  if (prior?.success) return { skipped: true, statusCode: prior.status_code };
  try {
    const response = await fetch(webhook.target_url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Aegis-AI-Webhooks/1.0', 'x-aegis-event': data.event_type, 'x-aegis-delivery-id': data.id, 'x-aegis-signature-256': `sha256=${signature}` }, body, redirect: 'error' });
    const text = await response.text();
    const success = response.status >= 200 && response.status < 300;
    await db.from('webhook_delivery_attempts').upsert({ tenant_id: data.tenant_id, webhook_id: data.webhook_id, audit_log_id: data.audit_log_id, event_type: data.event_type, attempt, idempotency_key: idempotencyKey, status_code: response.status, success, error_message: success ? null : text.slice(0, 1000), attempted_at: attemptedAt }, { onConflict: 'tenant_id,idempotency_key' });
    if (!success) throw new Error(`Webhook returned HTTP ${response.status}: ${text.slice(0, 1000)}`);
    await db.from('webhook_outbox').update({ status: 'delivered', attempts: attempt, last_error: null, updated_at: new Date().toISOString() }).eq('id', data.id).eq('tenant_id', data.tenant_id);
    return { delivered: true, statusCode: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('webhook_delivery_attempts').upsert({ tenant_id: data.tenant_id, webhook_id: data.webhook_id, audit_log_id: data.audit_log_id, event_type: data.event_type, attempt, idempotency_key: idempotencyKey, success: false, error_message: message.slice(0, 1000), attempted_at: attemptedAt, next_retry_at: retryCount >= 4 ? null : new Date(Date.now() + 30000 * (2 ** Math.min(retryCount, 5))).toISOString() }, { onConflict: 'tenant_id,idempotency_key' });
    const exhausted = retryCount >= 4;
    await db.from('webhook_outbox').update({ status: exhausted ? 'failed' : 'pending', attempts: attempt, last_error: message.slice(0, 1000), next_attempt_at: exhausted ? new Date().toISOString() : new Date(Date.now() + 30000 * (2 ** Math.min(retryCount, 5))).toISOString(), updated_at: new Date().toISOString() }).eq('id', data.id).eq('tenant_id', data.tenant_id);
    throw error;
  }
}

async function main() {
  await boss.start();
  await boss.createQueue(QUEUES.providerDlq); await boss.createQueue(QUEUES.webhookDlq); await boss.createQueue(QUEUES.externalTicketDlq);
  await boss.createQueue(QUEUES.provider, { policy: 'stately', ...RETRY, deadLetter: QUEUES.providerDlq });
  await boss.createQueue(QUEUES.webhook, { policy: 'stately', ...RETRY, deadLetter: QUEUES.webhookDlq });
  await boss.createQueue(QUEUES.externalTicket, { policy: 'stately', ...RETRY, deadLetter: QUEUES.externalTicketDlq });
  await boss.work(QUEUES.provider, { teamSize: 4, teamConcurrency: 4, includeMetadata: true }, async (job) => {
    try { const result = await postInternal(process.env.PROVIDER_SYNC_INTERNAL_URL, job.data.payload, 'PROVIDER_SYNC_INTERNAL_SECRET'); await markProviderRun(job.data.payload, 'success'); return result; }
    catch (error) { const message = error instanceof Error ? error.message : String(error); if (job.retryCount >= job.retryLimit) await markProviderRun(job.data.payload, 'failed', message.slice(0, 2000)); throw error; }
  });
  await boss.work(QUEUES.webhook, { teamSize: 10, teamConcurrency: 10, includeMetadata: true }, async (job) => deliverWebhook(job.data.payload, job.retryCount));
  await boss.work(QUEUES.externalTicket, { teamSize: 4, teamConcurrency: 4, includeMetadata: true }, async (job) => postInternal(process.env.EXTERNAL_TICKET_INTERNAL_URL, job.data.payload, 'EXTERNAL_TICKET_INTERNAL_SECRET'));

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/enqueue') { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Not found' })); return; }
    if (req.headers.authorization !== `Bearer ${queueSecret}`) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Unauthorized' })); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const allowed = new Set([QUEUES.provider, QUEUES.webhook, QUEUES.externalTicket]);
      if (!allowed.has(body.queue) || !body.tenantId || !body.idempotencyKey || !body.payload) throw new Error('queue, tenantId, idempotencyKey and payload are required.');
      const jobId = await boss.send(body.queue, body.payload, { ...RETRY, singletonKey: `${body.tenantId}:${body.idempotencyKey}`, group: { id: body.tenantId } });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, jobId, queue: body.queue, idempotencyKey: body.idempotencyKey }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ component: 'job-enqueue', level: 'error', error: message }));
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: message }));
    }
  });
  server.listen(port, () => console.log(JSON.stringify({ component: 'aegis-job-worker', status: 'ready', port, queues: Object.values(QUEUES).slice(0, 3) })));
  const shutdown = async () => { server.close(); await boss.stop({ close: true }); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
main().catch((error) => { console.error(JSON.stringify({ component: 'aegis-job-worker', level: 'fatal', error: error instanceof Error ? error.stack ?? error.message : String(error) })); process.exit(1); });
