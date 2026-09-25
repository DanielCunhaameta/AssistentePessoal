import { waitUntil } from '@vercel/functions';
import { tokenAcesso } from '../../lib/graph.js';
import { processarMensagem } from '../../lib/processar.js';

// Recebe as notificações do Microsoft Graph. Precisa responder em até 3 s,
// então confirma na hora e processa em segundo plano.
export default function handler(req, res) {
  if (req.query.validationToken) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(req.query.validationToken);
  }
  if (req.method !== 'POST') return res.status(405).end();

  const avisos = (req.body?.value || []).filter((n) => n.clientState === process.env.GRAPH_CLIENT_STATE);
  if (avisos.length) waitUntil(processar(avisos));
  res.status(202).end();
}

async function processar(avisos) {
  const token = await tokenAcesso();
  for (const n of avisos) {
    const id = n.resourceData?.id;
    if (!id) continue;
    try {
      await processarMensagem(id, token);
    } catch (e) {
      console.error('Webhook: falha ao processar', id, e.message);
    }
  }
}
