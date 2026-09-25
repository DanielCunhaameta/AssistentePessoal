import { trocarCodigo, graph, salvarTokens, garantirAssinatura } from '../../lib/graph.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina(res, status, msg) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conexão Microsoft</title>
<body style="font-family:Inter,system-ui,sans-serif;background:#1e2024;color:#e9e7e1;padding:2rem;max-width:36rem;margin:auto;line-height:1.5">
<h1 style="font-family:Oswald,sans-serif;font-weight:500">Não foi possível conectar</h1>
<p>${esc(msg)}</p><p><a href="/" style="color:#F5C433">Voltar ao painel</a></p></body>`);
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;
  if (error) return pagina(res, 400, `A Microsoft recusou o acesso: ${error_description || error}`);

  const cookie = /(?:^|;\s*)ms_state=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  if (!code || !state || state !== cookie) {
    return pagina(res, 400, 'O login expirou ou veio de outra aba. Volte ao painel e clique em "Conectar Microsoft" de novo.');
  }

  try {
    const t = await trocarCodigo(code);
    const me = await graph('/me?$select=mail,userPrincipalName', { token: t.access_token });
    const email = (me.mail || me.userPrincipalName || '').toLowerCase();
    if (email !== (process.env.OWNER_EMAIL || '').toLowerCase()) {
      return pagina(res, 403, `A conta ${email} não é a dona deste assistente. Entre com ${process.env.OWNER_EMAIL}.`);
    }
    await salvarTokens(t, email);
    await garantirAssinatura(t.access_token);
    res.setHeader('Set-Cookie', 'ms_state=; Path=/api/auth; Max-Age=0');
    res.redirect(302, '/?conectado=1');
  } catch (e) {
    console.error(e);
    pagina(res, 500, e.message);
  }
}
