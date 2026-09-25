-- Assistente Pessoal — schema inicial
-- Cole no SQL Editor do projeto assistente_pessoal e execute uma vez.
-- Troque o e-mail abaixo se o login do painel usar outro endereço.

-- Conta Microsoft conectada (uma linha só). Acesso apenas pelo servidor (service role).
create table if not exists public.ms_conta (
  id            int primary key default 1 check (id = 1),
  email         text,
  access_token  text,
  refresh_token text,
  expira_em     timestamptz,
  atualizado_em timestamptz default now()
);

-- Assinaturas de webhook do Microsoft Graph.
create table if not exists public.graph_assinatura (
  id        text primary key,
  expira_em timestamptz,
  criado_em timestamptz default now()
);

-- Caixa unificada: cada e-mail (e, no futuro, WhatsApp/agenda) vira um item.
create table if not exists public.itens (
  id             uuid primary key default gen_random_uuid(),
  origem         text not null default 'email',
  externo_id     text not null unique,
  conversa_id    text,
  recebido_em    timestamptz,
  remetente_nome text,
  remetente_email text,
  assunto        text,
  previa         text,
  link           text,
  destino        text check (destino in ('direto','copia','lista')),
  categoria      text not null default 'acompanhar'
                 check (categoria in ('acao','acompanhar','pessoal','rotina')),
  resumo         text,
  acao           text,
  prazo          date,
  pedidos        text[] default '{}',
  obra           text,
  status         text not null default 'aberto' check (status in ('aberto','feito','arquivado')),
  concluido_em   timestamptz,
  criado_em      timestamptz default now()
);

create index if not exists itens_recebido_idx on public.itens (recebido_em desc);
create index if not exists itens_status_cat_idx on public.itens (status, categoria);

-- RLS: tokens e assinaturas ficam invisíveis para o navegador.
alter table public.ms_conta enable row level security;
alter table public.graph_assinatura enable row level security;
alter table public.itens enable row level security;

-- O painel só lê e atualiza itens quando logado com o e-mail do dono.
drop policy if exists itens_dono_select on public.itens;
create policy itens_dono_select on public.itens
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'danielgustavo@ametaengenharia.com.br');

drop policy if exists itens_dono_update on public.itens;
create policy itens_dono_update on public.itens
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'danielgustavo@ametaengenharia.com.br')
  with check ((auth.jwt() ->> 'email') = 'danielgustavo@ametaengenharia.com.br');

-- O painel só pode mudar status/concluido_em, nunca o conteúdo.
revoke update on public.itens from authenticated;
grant update (status, concluido_em) on public.itens to authenticated;

-- Status da conexão para o painel, sem expor tokens.
create or replace function public.status_conexao()
returns json
language sql
security definer
set search_path = public
as $$
  select case
    when (auth.jwt() ->> 'email') = 'danielgustavo@ametaengenharia.com.br' then
      json_build_object(
        'email',             (select email from ms_conta where id = 1),
        'assinatura_expira', (select max(expira_em) from graph_assinatura),
        'ultimo_item',       (select max(criado_em) from itens)
      )
  end;
$$;
revoke all on function public.status_conexao() from public, anon;
grant execute on function public.status_conexao() to authenticated;

-- Itens novos aparecem no painel em tempo real.
do $$
begin
  alter publication supabase_realtime add table public.itens;
exception when duplicate_object then null;
end $$;
