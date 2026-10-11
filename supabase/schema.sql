-- Run once in a new Supabase project's SQL editor.
create table public.members(id uuid primary key references auth.users(id), role text not null check(role in ('intern','manager')));
create table public.proposals(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.members(id),symbol text not null check(symbol ~ '^[A-Z.\-]{1,12}$'),side text not null check(side in ('buy','sell')),quantity numeric not null check(quantity>0 and quantity<100000000),thesis text not null check(length(thesis) between 20 and 4000),risks text not null check(length(risks) between 1 and 2000),status text not null default 'pending' check(status in ('pending','approved','rejected','executed')),reviewed_by uuid references public.members(id),reviewed_at timestamptz,created_at timestamptz not null default now());
create table public.trades(id uuid primary key default gen_random_uuid(),proposal_id uuid not null unique references public.proposals(id),author_id uuid not null references public.members(id),executed_by uuid not null references public.members(id),symbol text not null,side text not null,quantity numeric not null,price numeric not null check(price>0 and price<100000000),created_at timestamptz not null default now());
alter table public.members enable row level security;
alter table public.proposals enable row level security;
alter table public.trades enable row level security;
create function public.is_manager() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members where id=auth.uid() and role='manager') $$;
create policy member_read on public.members for select to authenticated using(id=auth.uid() or public.is_manager());
create policy proposal_read on public.proposals for select to authenticated using(author_id=auth.uid() or public.is_manager());
create policy proposal_insert on public.proposals for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.members where id=auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null);
create policy trade_read on public.trades for select to authenticated using(author_id=auth.uid() or public.is_manager());
revoke all on public.members,public.proposals,public.trades from anon,authenticated;
grant select on public.members,public.proposals,public.trades to authenticated;
grant insert(author_id,symbol,side,quantity,thesis,risks) on public.proposals to authenticated;
create function public.review_proposal(proposal_id uuid,decision text) returns void language plpgsql security definer set search_path='' as $$ begin
if not public.is_manager() then raise exception 'Manager access required'; end if;
if decision not in ('approved','rejected') or decision is null then raise exception 'Invalid decision'; end if;
update public.proposals set status=decision,reviewed_by=auth.uid(),reviewed_at=now() where id=proposal_id and status='pending';
if not found then raise exception 'Proposal already reviewed or missing'; end if;
end $$;
create function public.execute_proposal(proposal_id uuid,fill_price numeric) returns void language plpgsql security definer set search_path='' as $$ declare p public.proposals; begin
if not public.is_manager() then raise exception 'Manager access required'; end if;
if fill_price is null or fill_price<=0 or fill_price>=100000000 or fill_price='NaN'::numeric then raise exception 'Invalid fill price'; end if;
select * into p from public.proposals where id=proposal_id for update;
if not found or p.status<>'approved' then raise exception 'An approved, unexecuted proposal is required'; end if;
insert into public.trades(proposal_id,author_id,executed_by,symbol,side,quantity,price) values(p.id,p.author_id,auth.uid(),p.symbol,p.side,p.quantity,fill_price);
update public.proposals set status='executed' where id=p.id;
end $$;
revoke all on function public.is_manager(),public.review_proposal(uuid,text),public.execute_proposal(uuid,numeric) from public;
grant execute on function public.is_manager(),public.review_proposal(uuid,text),public.execute_proposal(uuid,numeric) to authenticated;
