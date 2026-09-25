// Triagem de uma mensagem com a API da Anthropic.
// Regras espelham a triagem manual combinada: ação / acompanhar / pessoal / rotina.

const SISTEMA = `Você faz a triagem da caixa de entrada de Daniel, que trabalha na AMETA Engenharia (construção, várias obras, consórcios e entidades jurídicas; ferramentas internas integradas ao Sienge).

Classifique cada e-mail em UMA categoria:
- "acao": pede algo diretamente a Daniel (responder, cancelar, aprovar, enviar, conferir) ou tem prazo que depende dele.
- "acompanhar": assunto de trabalho em andamento em que Daniel está em cópia ou que ele deve acompanhar, sem pedido direto a ele.
- "pessoal": compras, entregas, bancos, serviços e assuntos pessoais.
- "rotina": envio automático ou de rotina sem ação (NF, boleto, fatura, newsletter, notificação de sistema) recebido por lista de grupo.

Extraia:
- "resumo": uma frase curta em português, com o essencial (quem, o quê).
- "acao": o que Daniel precisa fazer, em uma frase imperativa curta; null se nada.
- "prazo": data no formato AAAA-MM-DD se houver vencimento ou prazo explícito; null caso contrário. Use a data de recebimento para resolver datas relativas.
- "pedidos": lista de números de pedido/PC/ordem de compra citados (só os dígitos).
- "obra": obra, consórcio ou entidade citada (ex.: "Consórcio Vias Guajará", "AMETA OCC"); null se nenhuma.

Responda SOMENTE com um objeto JSON, sem texto antes ou depois:
{"categoria":"...","resumo":"...","acao":null,"prazo":null,"pedidos":[],"obra":null}`;

const nomes = (lista) =>
  (lista || []).map((r) => `${r.emailAddress?.name || ''} <${r.emailAddress?.address || ''}>`).join(', ');

export async function classificar(m, destino) {
  const corpo = (m.body?.content || m.bodyPreview || '').replace(/\s+/g, ' ').slice(0, 3500);
  const texto = [
    `Destino para Daniel: ${destino} (direto = está no Para; copia = está em Cc; lista = chegou por lista de grupo)`,
    `Recebido em: ${m.receivedDateTime}`,
    `De: ${nomes([m.from])}`,
    `Para: ${nomes(m.toRecipients)}`,
    `Cc: ${nomes(m.ccRecipients)}`,
    `Assunto: ${m.subject || '(sem assunto)'}`,
    `Corpo: ${corpo}`
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SISTEMA,
      messages: [{ role: 'user', content: texto }]
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic: ${r.status} ${j?.error?.message || ''}`);
  const saida = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return JSON.parse(saida.slice(saida.indexOf('{'), saida.lastIndexOf('}') + 1));
}
