import { createClient } from '@supabase/supabase-js';

export const setupPreviewAuthStorage = () => {
  const dev = import.meta.env.DEV;
  const EDITOR = /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$/;
  const ancestor = (location.ancestorOrigins && location.ancestorOrigins[0]) || (document.referrer ? new URL(document.referrer).origin : '');
  const editorOrigins = ancestor && EDITOR.test(ancestor)
    ? [ancestor]
    : (dev ? ['https://lovable.dev', 'http://localhost:3000'] : ['https://lovable.dev']);
  const RESULT = 'lovable-preview-auth:result';
  const TIMEOUT = 2000;
  const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const request = (type: string, key: string, value?: string): Promise<{ ok: boolean; value?: string | null } | null> =>
    new Promise((resolve) => {
      const requestId = newId();
      let done = false;
      const timer: ReturnType<typeof setTimeout> = setTimeout(() => finish(null), TIMEOUT);
      const finish = (r: { ok: boolean; value?: string | null } | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(r);
      };
      const onMessage = (e: MessageEvent) => {
        if (editorOrigins.indexOf(e.origin) < 0) return;
        const d = e.data;
        if (!d || d.channel !== 'lovable-preview-auth' || d.requestId !== requestId) return;
        finish(d.type === `${type}:result` ? { ok: Boolean(d.ok), value: d.value ?? null } : null);
      };
      window.addEventListener('message', onMessage);
      window.parent.postMessage({ channel: 'lovable-preview-auth', type, requestId, key, value }, editorOrigins[0]);
    });

  return {
    getItem: async (key: string) => (await request('getItem', key))?.value ?? null,
    setItem: async (key: string, value: string) => { await request('setItem', key, value); },
    removeItem: async (key: string) => { await request('removeItem', key); },
  };
};

export const createPreviewAuthClient = () => {
  const storage = setupPreviewAuthStorage();
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { storage } },
  );
};
