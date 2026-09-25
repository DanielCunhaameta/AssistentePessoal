import { usuarioDono } from '../lib/supabase.js';
import { sincronizar } from '../lib/processar.js';

// Botão "Sincronizar agora" do painel.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await usuarioDono(req))) return res.status(401).json({ erro: 'Sessão inválida. Entre de novo no painel.' });
  const horas = Math.min(Math.max(Number(req.query.horas) || 26, 1), 24 * 7);
  try {
    res.status(200).json(await sincronizar({ horas }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
}
