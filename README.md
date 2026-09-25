# Assistente Pessoal

Caixa unificada do Daniel: e-mails do Outlook (Microsoft 365) chegam por webhook,
são triados por IA (ação, acompanhar, pessoal, rotina) e aparecem no painel.

- Painel: `index.html` (sem build)
- Funções: `api/` (Vercel)
- Banco: Supabase (`supabase/schema.sql`)

## Implantação

1. **Supabase** — no projeto `assistente_pessoal`, execute `supabase/schema.sql` no SQL Editor.
   Em Authentication → Users, crie seu usuário (e-mail + senha) e depois desative novos cadastros
   em Authentication → Sign In / Providers.
2. **GitHub** — suba esta pasta para um repositório novo (ex.: `construservengpa-jpg/assistente-pessoal`).
3. **Vercel** — importe o repositório e preencha as variáveis de `.env.example`.
   `BASE_URL` é a URL de produção (ex.: `https://assistente-pessoal.vercel.app`).
4. **Entra ID** — no app registrado, em Authentication, adicione a plataforma *Web* com o Redirect URI
   `BASE_URL/api/auth/callback`.
5. Abra o painel, entre, clique em **Conectar Microsoft** e depois em **Sincronizar**.

## Rotinas

- `api/graph/webhook` recebe cada e-mail novo em tempo real.
- `api/cron/diario` roda às 06h (Belém): renova o webhook (expira em ~3 dias) e recupera
  qualquer e-mail que tenha escapado nas últimas 26 h.
- `api/sincronizar` é o botão do painel (últimas 72 h).

## Custos

NF/boleto que chega por lista de grupo vira "rotina" sem chamar a IA. O resto é classificado
com o modelo em `ANTHROPIC_MODEL` (padrão: Haiku 4.5, o mais barato).
