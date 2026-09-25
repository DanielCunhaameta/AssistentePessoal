import { tokenAcesso, garantirAssinatura } from '../../lib/graph.js';
import { sincronizar } from '../../lib/processar.js';

// Roda 1x por dia (limite do plano Hobby): renova o webhook e recupera o que escapou.
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ erro: 'não autorizado' });
  }
  try {
    const assinatura = await garantirAssinatura(await tokenAcesso());
    const sync = await sincronizar({ horas: 26 });
    res.status(200).json({ assinatura, sync });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
}
