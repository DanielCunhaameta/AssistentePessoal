import { db } from './supabase.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const SCOPES = 'offline_access User.Read Mail.Read Calendars.Read';
const ASSINATURA_MINUTOS = 4200; // limite do Graph para e-mail é ~4230 min

const tenant = () => process.env.MS_TENANT_ID;
export const redirectUri = () => `${process.env.BASE_URL}/api/auth/callback`;

export function urlAutorizacao(state) {
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'select_account'
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${p}`;
}

async function pedirToken(params) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: SCOPES,
    ...params
  });
  const r = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Token Microsoft: ${j.error_description || j.error}`);
  return j;
}

export const trocarCodigo = (code) =>
  pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

export async function salvarTokens(t, email) {
  const linha = {
    id: 1,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_em: new Date(Date.now() + (t.expires_in - 120) * 1000).toISOString(),
    atualizado_em: new Date().toISOString()
  };
  if (email) linha.email = email;
  const { error } = await db.from('ms_conta').upsert(linha);
  if (error) throw error;
}

export async function tokenAcesso() {
  const { data, error } = await db.from('ms_conta').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) throw new Error('Conta Microsoft não conectada. Use "Conectar Microsoft" no painel.');
  if (data.access_token && new Date(data.expira_em) > new Date()) return data.access_token;
  const t = await pedirToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token });
  if (!t.refresh_token) t.refresh_token = data.refresh_token;
  await salvarTokens(t);
  return t.access_token;
}

export async function graph(caminho, { method = 'GET', body, headers = {}, token } = {}) {
  const tk = token || (await tokenAcesso());
  const r = await fetch(caminho.startsWith('http') ? caminho : GRAPH + caminho, {
    method,
    headers: {
      Authorization: `Bearer ${tk}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(`Graph ${method} ${caminho.split('?')[0]}: ${r.status} ${j?.error?.message || ''}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

// Renova a assinatura de webhook existente ou cria uma nova.
export async function garantirAssinatura(token) {
  const expira = new Date(Date.now() + ASSINATURA_MINUTOS * 60000).toISOString();
  const { data: atuais } = await db.from('graph_assinatura').select('id');

  for (const s of atuais || []) {
    try {
      await graph(`/subscriptions/${s.id}`, { method: 'PATCH', body: { expirationDateTime: expira }, token });
      await db.from('graph_assinatura').update({ expira_em: expira }).eq('id', s.id);
      return { renovada: s.id };
    } catch (e) {
      console.warn('Assinatura inválida, removendo', s.id, e.message);
      await db.from('graph_assinatura').delete().eq('id', s.id);
    }
  }

  const nova = await graph('/subscriptions', {
    method: 'POST',
    token,
    body: {
      changeType: 'created',
      notificationUrl: `${process.env.BASE_URL}/api/graph/webhook`,
      resource: "me/mailFolders('inbox')/messages",
      expirationDateTime: expira,
      clientState: process.env.GRAPH_CLIENT_STATE
    }
  });
  await db.from('graph_assinatura').insert({ id: nova.id, expira_em: nova.expirationDateTime });
  return { criada: nova.id };
}
