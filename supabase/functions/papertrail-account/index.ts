import { createClient } from 'npm:@supabase/supabase-js@2.108.0';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
  if (!token) return reply({ error: 'Unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return reply({ error: 'Unauthorized' }, 401);
  let payload;
  try { payload = await req.json() } catch { return reply({ error: 'Invalid request' }, 400) }
  if (payload.confirmation !== 'DELETE') return reply({ error: 'Confirmation required' }, 400);
  try {
    const preflight = await admin.rpc('papertrail_can_delete_account', { p_user_id:user.id });
    if (preflight.error) throw preflight.error;
    if (preflight.data !== true) return reply({ error:'shared_account' },409);
    // Revoke refresh tokens first. Access JWTs remain valid until expiry; getUser checks prevent reuse here.
    const revoked = await admin.auth.admin.signOut(token, 'global');
    if (revoked.error) throw revoked.error;
    while (true) {
      const { data, error: listError } = await admin.storage.from('note-images').list(user.id, { limit: 100 });
      if (listError) throw listError;
      if (!data?.length) break;
      const { error: removeError } = await admin.storage.from('note-images').remove(data.map(file => user.id + '/' + file.name));
      if (removeError) throw removeError;
    }
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) throw result.error;
    return reply({ deleted: true });
  } catch { return reply({ error: 'Deletion failed' }, 500) }
});
