import { db } from './supabase.js';
import { graph, tokenAcesso } from './graph.js';
import { classificar } from './classificar.js';

const CATEGORIAS = ['acao', 'acompanhar', 'pessoal', 'rotina'];
const ROTINA = /\b(nota fiscal|nf-?e|nfs-?e|nfse|danfe|boleto|fatura|xml)\b/i;
const CAMPOS = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,webLink,conversationId';

const dono = () => (process.env.OWNER_EMAIL || '').toLowerCase();
const contem = (lista) => (lista || []).some((r) => r.emailAddress?.address?.toLowerCase() === dono());

export async function processarMensagem(id, token) {
  const { data: existe } = await db.from('itens').select('id').eq('externo_id', id).maybeSingle();
  if (existe) return 'duplicado';

  const m = await graph(`/me/messages/${encodeURIComponent(id)}?$select=${CAMPOS}`, {
    token,
    headers: { Prefer: 'outlook.body-content-type="text"' }
  });
  if (m.from?.emailAddress?.address?.toLowerCase() === dono()) return 'proprio';

  const destino = contem(m.toRecipients) ? 'direto' : contem(m.ccRecipients) ? 'copia' : 'lista';

  // Economia: NF/boleto que chega por lista vira rotina sem chamar a IA.
  let c;
  if (destino === 'lista' && ROTINA.test(`${m.subject} ${m.bodyPreview}`)) {
    c = { categoria: 'rotina', resumo: m.subject, acao: null, prazo: null, pedidos: [], obra: null };
  } else {
    try {
      c = await classificar(m, destino);
    } catch (e) {
      console.error('Falha na classificação', id, e.message);
      c = { categoria: destino === 'lista' ? 'rotina' : 'acompanhar', resumo: (m.bodyPreview || '').slice(0, 200) };
    }
  }

  const linha = {
    origem: 'email',
    externo_id: m.id,
    conversa_id: m.conversationId,
    recebido_em: m.receivedDateTime,
    remetente_nome: m.from?.emailAddress?.name || null,
    remetente_email: m.from?.emailAddress?.address || null,
    assunto: m.subject || null,
    previa: m.bodyPreview || null,
    link: m.webLink || null,
    destino,
    categoria: CATEGORIAS.includes(c.categoria) ? c.categoria : 'acompanhar',
    resumo: c.resumo || null,
    acao: c.acao || null,
    prazo: /^\d{4}-\d{2}-\d{2}$/.test(c.prazo || '') ? c.prazo : null,
    pedidos: Array.isArray(c.pedidos) ? c.pedidos.map(String) : [],
    obra: c.obra || null
  };
  const { error } = await db.from('itens').upsert(linha, { onConflict: 'externo_id', ignoreDuplicates: true });
  if (error) throw error;
  return linha.categoria;
}

// Busca na caixa de entrada o que chegou nas últimas `horas` e ainda não foi processado.
export async function sincronizar({ horas = 26, limiteMs = 240000 } = {}) {
  const inicio = Date.now();
  const token = await tokenAcesso();
  const desde = new Date(Date.now() - horas * 3600e3).toISOString();

  const params = new URLSearchParams({
    $select: 'id,receivedDateTime',
    $filter: `receivedDateTime ge ${desde}`,
    $orderby: 'receivedDateTime desc',
    $top: '50'
  });
  let url = `/me/mailFolders/inbox/messages?${params}`;
  const ids = [];
  while (url && ids.length < 400) {
    const pagina = await graph(url, { token });
    ids.push(...(pagina.value || []).map((m) => m.id));
    url = pagina['@odata.nextLink'] || null;
  }

  const { data: ja } = await db.from('itens').select('externo_id').gte('recebido_em', desde);
  const conhecidos = new Set((ja || []).map((i) => i.externo_id));
  const novos = ids.filter((id) => !conhecidos.has(id));

  const resultado = { encontrados: ids.length, novos: novos.length, processados: 0, erros: 0 };
  for (let i = 0; i < novos.length; i += 5) {
    if (Date.now() - inicio > limiteMs) break;
    const lote = await Promise.allSettled(novos.slice(i, i + 5).map((id) => processarMensagem(id, token)));
    for (const r of lote) {
      if (r.status === 'fulfilled') resultado.processados++;
      else { resultado.erros++; console.error(r.reason?.message); }
    }
  }
  resultado.pendentes = novos.length - resultado.processados - resultado.erros;
  return resultado;
}
