import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { processDeletions } from './worker.mjs';
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status:405});
  const secret = req.headers.get('x-deletion-secret');
  if (!secret || secret.length < 64 || secret.length > 128) return new Response('Unauthorized', {status:403});
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: {persistSession:false, autoRefreshToken:false}
  });
  const result = await processDeletions(client, secret);
  return Response.json(result, {status:result.status});
});
