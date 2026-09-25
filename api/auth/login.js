import crypto from 'node:crypto';
import { urlAutorizacao } from '../../lib/graph.js';

export default function handler(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `ms_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`);
  res.redirect(302, urlAutorizacao(state));
}
