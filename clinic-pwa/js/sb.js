// js/sb.js
import { createClient } from '../lib/supabase.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    console.log('[Storage] persist:', granted ? 'granted' : 'denied');
  }).catch(e => console.warn('[Storage] persist failed:', e));
}

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: 'clinic-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-application-name': 'clinic-pwa' },
  },
  db: { schema: 'public' },
});

sb.auth.onAuthStateChange((event, session) => {
  const ts = new Date().toISOString();
  console.log(`[AUTH ${ts}] Event: ${event}`, session?.user?.email || '');
});

export default sb;
