import { createClient } from '@supabase/supabase-js';

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Valida o token de sessão do painel e confirma que é o dono.
export async function usuarioDono(req) {
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const dono = (process.env.OWNER_EMAIL || '').toLowerCase();
  return data.user.email?.toLowerCase() === dono ? data.user : null;
}
