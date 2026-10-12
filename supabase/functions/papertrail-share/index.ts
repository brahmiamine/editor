import { createClient } from 'npm:@supabase/supabase-js@2.108.0';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  let payload;
  try { payload = await req.json() } catch { return reply({ error: 'Invalid request' }, 400) }
  if (typeof payload.token !== 'string' || !/^[0-9a-f-]{72}$/i.test(payload.token)) return reply({ error: 'Invalid token' }, 400);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.token)))).map(value => value.toString(16).padStart(2, '0')).join('');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.from('note_shares').select('body').eq('token_hash', hash).gt('expires_at', new Date().toISOString()).maybeSingle();
  return error || !data ? reply({ error: 'Unavailable' }, 404) : reply({ body: data.body });
});
