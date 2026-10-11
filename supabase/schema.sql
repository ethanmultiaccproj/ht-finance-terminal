begin;
-- Safe to run in a new Supabase project's SQL editor; reruns preserve table data.
create table if not exists public.members(id uuid primary key references auth.users(id), role text not null check(role in ('intern','manager')));
create table if not exists public.proposals(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.members(id),symbol text not null check(symbol ~ '^[A-Z.-]{1,12}$'),side text not null check(side in ('buy','sell')),quantity numeric not null check(quantity>0 and quantity<100000000),thesis text not null check(length(thesis) between 20 and 4000),risks text not null check(length(risks) between 1 and 2000),status text not null default 'pending' check(status in ('pending','approved','rejected','executed')),reviewed_by uuid references public.members(id),reviewed_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.trades(id uuid primary key default gen_random_uuid(),proposal_id uuid not null unique references public.proposals(id),author_id uuid not null references public.members(id),executed_by uuid not null references public.members(id),symbol text not null,side text not null,quantity numeric not null,price numeric not null check(price>0 and price<100000000),created_at timestamptz not null default now());
create index if not exists proposals_author_created_idx on public.proposals(author_id,created_at desc);
create index if not exists proposals_status_created_idx on public.proposals(status,created_at desc);
create index if not exists trades_author_created_idx on public.trades(author_id,created_at desc);
create index if not exists trades_created_idx on public.trades(created_at desc);
alter table public.members enable row level security;
alter table public.proposals enable row level security;
alter table public.trades enable row level security;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members where id=auth.uid() and role='manager') $$;
drop policy if exists member_read on public.members;
create policy member_read on public.members for select to authenticated using(id=auth.uid() or public.is_manager());
drop policy if exists proposal_read on public.proposals;
create policy proposal_read on public.proposals for select to authenticated using(author_id=auth.uid() or public.is_manager());
drop policy if exists proposal_insert on public.proposals;
create policy proposal_insert on public.proposals for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.members where id=auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists trade_read on public.trades;
create policy trade_read on public.trades for select to authenticated using(author_id=auth.uid() or public.is_manager());
revoke all on public.members,public.proposals,public.trades from anon,authenticated;
grant select on public.members,public.proposals,public.trades to authenticated;
grant insert(author_id,symbol,side,quantity,thesis,risks) on public.proposals to authenticated;
create or replace function public.review_proposal(proposal_id uuid,decision text) returns void language plpgsql security definer set search_path='' as $$ begin
if not public.is_manager() then raise exception 'Manager access required'; end if;
if decision not in ('approved','rejected') or decision is null then raise exception 'Invalid decision'; end if;
update public.proposals set status=decision,reviewed_by=auth.uid(),reviewed_at=now() where id=proposal_id and status='pending';
if not found then raise exception 'Proposal already reviewed or missing'; end if;
end $$;
create or replace function public.execute_proposal(proposal_id uuid,fill_price numeric) returns void language plpgsql security definer set search_path='' as $$ declare p public.proposals; begin
if not public.is_manager() then raise exception 'Manager access required'; end if;
if fill_price is null or fill_price<=0 or fill_price>=100000000 or fill_price='NaN'::numeric then raise exception 'Invalid fill price'; end if;
select * into p from public.proposals where id=proposal_id for update;
if not found or p.status<>'approved' then raise exception 'An approved, unexecuted proposal is required'; end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.author_id::text,0));
if p.side='buy' then
  if p.quantity*fill_price > 100000 - coalesce((select sum(case when side='buy' then quantity*price else -quantity*price end) from public.trades where author_id=p.author_id),0) then
    raise exception 'This paper account does not have enough cash for that fill';
  end if;
else
  if p.quantity > coalesce((select sum(case when side='buy' then quantity else -quantity end) from public.trades where author_id=p.author_id and symbol=p.symbol),0) then
    raise exception 'This paper account does not hold enough shares to sell';
  end if;
end if;
insert into public.trades(proposal_id,author_id,executed_by,symbol,side,quantity,price) values(p.id,p.author_id,auth.uid(),p.symbol,p.side,p.quantity,fill_price);
update public.proposals set status='executed' where id=p.id;
end $$;
create or replace function public.list_club_members() returns table(user_id uuid,email text,full_name text,role text,joined_at timestamptz) language plpgsql stable security definer set search_path='' as $$ begin
if not public.is_manager() then raise exception 'Manager access required'; end if;
return query
select u.id,u.email,coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',split_part(u.email,'@',1)),m.role,u.created_at
from auth.users u
left join public.members m on m.id=u.id
order by (m.role is null),u.created_at desc;
end $$;
create or replace function public.set_member_role(target_user_id uuid,assigned_role text) returns void language plpgsql security definer set search_path='' as $$ declare manager_count integer; begin
if not public.is_manager() then raise exception 'Manager access required'; end if;
if target_user_id is null or assigned_role not in ('intern','manager') or assigned_role is null then raise exception 'Choose an intern or manager role'; end if;
if target_user_id=auth.uid() and assigned_role<>'manager' then raise exception 'You cannot remove your own manager access'; end if;
if not exists(select 1 from auth.users where id=target_user_id) then raise exception 'Google user has not signed in yet'; end if;
select count(*) into manager_count from public.members where role='manager';
if exists(select 1 from public.members where id=target_user_id and role='manager') and assigned_role<>'manager' and manager_count<=1 then
  raise exception 'The club must keep at least one manager';
end if;
insert into public.members(id,role) values(target_user_id,assigned_role)
on conflict(id) do update set role=excluded.role;
end $$;
revoke all on function public.is_manager(),public.review_proposal(uuid,text),public.execute_proposal(uuid,numeric),public.list_club_members(),public.set_member_role(uuid,text) from public;
grant execute on function public.is_manager(),public.review_proposal(uuid,text),public.execute_proposal(uuid,numeric),public.list_club_members(),public.set_member_role(uuid,text) to authenticated;
commit;
