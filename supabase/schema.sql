-- ============================================================
-- IPON: complete database, one file (run once in Supabase SQL Editor)
-- Safe to re-run. Contains, in order:
--   PART 1 base tables, RLS, buddy helpers     PART 2 continuous cutoffs + auto-deduct bills
--   PART 3 buddy repair + notifications        PART 4 correctness (dates, soft delete, totals, audit)
--   PART 5 accounts, transfers, assets, net worth   PART 6 guards + final additions
-- ============================================================
-- ============================================================
-- IPON — full schema (run once in Supabase SQL Editor)
-- ============================================================

-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cutoffs
create table if not exists cutoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  target_amount numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- Income entries
create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  cutoff_id uuid not null references cutoffs(id) on delete cascade,
  amount numeric(12,2) not null,
  source text,
  note text,
  created_at timestamptz default now()
);

-- Allocations
create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  cutoff_id uuid not null references cutoffs(id) on delete cascade,
  category text not null check (category in ('savings','bills','groceries','other')),
  amount numeric(12,2) not null,
  note text,
  bill_id uuid,
  shared boolean default false,
  estimated boolean default false,
  created_at timestamptz default now()
);

-- Recurring bills (with flexible due date scheduling)
create table if not exists recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  category text not null default 'Utilities',
  expected_amount numeric(12,2) not null,
  frequency text not null default 'monthly',
  due_schedule text not null default 'end_of_month'
    check (due_schedule in ('end_of_month','specific_days','per_cutoff','custom_date')),
  due_days integer[],
  due_custom_date date,
  shared boolean default false,
  icon text default '🧾',
  note text,
  active boolean default true,
  created_at timestamptz default now()
);

alter table allocations drop constraint if exists allocations_bill_fk;
alter table allocations
  add constraint allocations_bill_fk
  foreign key (bill_id) references recurring_bills(id) on delete set null;

-- Buddy links
create table if not exists buddy_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  unique (requester_id, addressee_id)
);

-- Food entries (one row per user per day)
create table if not exists food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  breakfast text,
  brunch text,
  lunch text,
  merienda text,
  dinner text,
  extra text,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

-- Mood entries (one row per user per day)
create table if not exists mood_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  mood text not null,
  note text,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

-- ============================================================
-- Helper: buddy visibility check
-- ============================================================
create or replace function public.is_buddy(other_user uuid)
returns boolean as $$
  select exists (
    select 1 from buddy_links
    where status = 'accepted'
      and (
        (requester_id = auth.uid() and addressee_id = other_user)
        or (addressee_id = auth.uid() and requester_id = other_user)
      )
  );
$$ language sql security definer stable;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table cutoffs enable row level security;
alter table income_entries enable row level security;
alter table allocations enable row level security;
alter table recurring_bills enable row level security;
alter table buddy_links enable row level security;
alter table food_entries enable row level security;
alter table mood_entries enable row level security;

-- Profiles
drop policy if exists "profiles viewable by auth" on profiles;
create policy "profiles viewable by auth" on profiles for select using (auth.role() = 'authenticated');
drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles for update using (auth.uid() = id);

-- Cutoffs
drop policy if exists "view own or buddy cutoffs" on cutoffs;
create policy "view own or buddy cutoffs" on cutoffs for select using (auth.uid() = user_id or public.is_buddy(user_id));
drop policy if exists "manage own cutoffs" on cutoffs;
create policy "manage own cutoffs" on cutoffs for insert with check (auth.uid() = user_id);
drop policy if exists "update own cutoffs" on cutoffs;
create policy "update own cutoffs" on cutoffs for update using (auth.uid() = user_id);
drop policy if exists "delete own cutoffs" on cutoffs;
create policy "delete own cutoffs" on cutoffs for delete using (auth.uid() = user_id);

-- Income
drop policy if exists "view own or buddy income" on income_entries;
create policy "view own or buddy income" on income_entries for select using (auth.uid() = user_id or public.is_buddy(user_id));
drop policy if exists "insert own income" on income_entries;
create policy "insert own income" on income_entries for insert with check (auth.uid() = user_id);
drop policy if exists "update own income" on income_entries;
create policy "update own income" on income_entries for update using (auth.uid() = user_id);
drop policy if exists "delete own income" on income_entries;
create policy "delete own income" on income_entries for delete using (auth.uid() = user_id);

-- Allocations
drop policy if exists "view own or buddy allocations" on allocations;
create policy "view own or buddy allocations" on allocations for select using (auth.uid() = user_id or public.is_buddy(user_id));
drop policy if exists "insert own allocations" on allocations;
create policy "insert own allocations" on allocations for insert with check (auth.uid() = user_id);
drop policy if exists "update own allocations" on allocations;
create policy "update own allocations" on allocations for update using (auth.uid() = user_id);
drop policy if exists "delete own allocations" on allocations;
create policy "delete own allocations" on allocations for delete using (auth.uid() = user_id);

-- Bills
drop policy if exists "view own or buddy bills" on recurring_bills;
create policy "view own or buddy bills" on recurring_bills for select using (auth.uid() = user_id or public.is_buddy(user_id));
drop policy if exists "insert own bills" on recurring_bills;
create policy "insert own bills" on recurring_bills for insert with check (auth.uid() = user_id);
drop policy if exists "update own bills" on recurring_bills;
create policy "update own bills" on recurring_bills for update using (auth.uid() = user_id);
drop policy if exists "delete own bills" on recurring_bills;
create policy "delete own bills" on recurring_bills for delete using (auth.uid() = user_id);

-- Buddy links
drop policy if exists "view own buddy links" on buddy_links;
create policy "view own buddy links" on buddy_links for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists "create buddy invite" on buddy_links;
create policy "create buddy invite" on buddy_links for insert with check (auth.uid() = requester_id);
drop policy if exists "respond to buddy invite" on buddy_links;
create policy "respond to buddy invite" on buddy_links for update using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists "remove buddy link" on buddy_links;
create policy "remove buddy link" on buddy_links for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Food entries
drop policy if exists "view own or buddy food" on food_entries;
create policy "view own or buddy food" on food_entries for select using (auth.uid() = user_id or public.is_buddy(user_id));
drop policy if exists "insert own food" on food_entries;
create policy "insert own food" on food_entries for insert with check (auth.uid() = user_id);
drop policy if exists "update own food" on food_entries;
create policy "update own food" on food_entries for update using (auth.uid() = user_id);
drop policy if exists "delete own food" on food_entries;
create policy "delete own food" on food_entries for delete using (auth.uid() = user_id);

-- Mood entries
drop policy if exists "view own or buddy mood" on mood_entries;
create policy "view own or buddy mood" on mood_entries for select using (auth.uid() = user_id or public.is_buddy(user_id));
drop policy if exists "insert own mood" on mood_entries;
create policy "insert own mood" on mood_entries for insert with check (auth.uid() = user_id);
drop policy if exists "update own mood" on mood_entries;
create policy "update own mood" on mood_entries for update using (auth.uid() = user_id);
drop policy if exists "delete own mood" on mood_entries;
create policy "delete own mood" on mood_entries for delete using (auth.uid() = user_id);

-- ============================================================
-- Continuous cutoffs + auto-deducting bills (v2)
-- ============================================================
alter table cutoffs add column if not exists carried_in_savings numeric(12,2) not null default 0;

alter table recurring_bills
  add column if not exists next_due_date date,
  add column if not exists due_anchor_day int,
  add column if not exists auto_deduct boolean not null default true,
  add column if not exists last_charged_on date;
-- recurring_bills.frequency already exists: use 'weekly' | 'monthly' | 'yearly'

alter table allocations add column if not exists due_date date;
create unique index if not exists allocations_bill_due_uniq on allocations (bill_id, due_date);

update recurring_bills set
  due_anchor_day = coalesce(due_anchor_day, extract(day from coalesce(due_custom_date, current_date))::int),
  next_due_date  = coalesce(next_due_date, due_custom_date, current_date)
where next_due_date is null;   -- the user reviews these dates once in the new Bills screen

create or replace function public.advance_due(d date, freq text, anchor int)
returns date language sql immutable as $$
  select case freq
    when 'weekly' then d + 7
    when 'yearly' then (d + interval '1 year')::date
    else least(
      (date_trunc('month', d) + interval '1 month')::date + (coalesce(anchor, extract(day from d)::int) - 1),
      (date_trunc('month', d) + interval '2 month - 1 day')::date)
  end
$$;

create or replace function public.process_due_bills(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b recurring_bills; cid uuid; n int := 0;
        today date := (now() at time zone 'Asia/Manila')::date;
begin
  for b in select * from recurring_bills
           where active and auto_deduct and next_due_date <= today
             and (p_user is null or user_id = p_user) loop
    while b.next_due_date <= today loop
      select id into cid from cutoffs
        where user_id = b.user_id and b.next_due_date between start_date and end_date limit 1;
      if cid is null then
        select id into cid from cutoffs where user_id = b.user_id order by start_date desc limit 1;
      end if;
      exit when cid is null;   -- no cutoff yet: leave the bill due, it catches up later
      insert into allocations (user_id, cutoff_id, category, amount, note, bill_id, shared, estimated, due_date)
        values (b.user_id, cid, 'bills', b.expected_amount, b.name || ' (auto)', b.id, b.shared, true, b.next_due_date)
        on conflict (bill_id, due_date) do nothing;
      n := n + 1;
      b.next_due_date := advance_due(b.next_due_date, b.frequency, b.due_anchor_day);
      update recurring_bills set next_due_date = b.next_due_date, last_charged_on = today where id = b.id;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.process_my_due_bills()
returns int language sql security definer set search_path = public as
$$ select public.process_due_bills(auth.uid()) $$;

revoke all on function public.process_due_bills(uuid) from public, anon, authenticated;
grant execute on function public.process_my_due_bills() to authenticated;

-- ============================================================
-- Buddy system repair + notifications (v3)
-- ============================================================
-- the app now uses lowercase statuses ('pending' | 'accepted' | 'declined') to match the CHECK constraint
update buddy_links set status = lower(status) where status <> lower(status);

-- one link per pair, in either direction
create unique index if not exists buddy_pair_uniq
  on buddy_links (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- only the person being invited may accept/decline (requester could previously self-accept)
drop policy if exists "respond to buddy invite" on buddy_links;
create policy "respond to buddy invite" on buddy_links for update
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);

-- any buddy link (even pending) lets the two people see each other's profile; strangers cannot list emails
create or replace function public.has_buddy_link(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from buddy_links
    where (requester_id = auth.uid() and addressee_id = other)
       or (addressee_id = auth.uid() and requester_id = other))
$$;
drop policy if exists "profiles viewable by auth" on profiles;
drop policy if exists "profiles viewable by self or linked" on profiles;
create policy "profiles viewable by self or linked" on profiles for select
  using (auth.uid() = id or public.has_buddy_link(id));

-- invite lookup without exposing the whole profiles table
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, email text) language sql security definer stable set search_path = public as $$
  select p.id, p.email from profiles p
  where lower(p.email) = lower(trim(p_email)) and p.id <> auth.uid() limit 1
$$;
revoke all on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;

-- notifications, created by a trigger (clients never insert them)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  related_user_id uuid references profiles(id) on delete set null,
  related_buddy_link_id uuid references buddy_links(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
drop policy if exists "read own notifications" on notifications;
create policy "read own notifications" on notifications for select using (auth.uid() = user_id);
drop policy if exists "update own notifications" on notifications;
create policy "update own notifications" on notifications for update using (auth.uid() = user_id);

create or replace function public.notify_buddy_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into notifications (user_id, type, title, message, related_user_id, related_buddy_link_id)
    select new.addressee_id, 'BUDDY_INVITE', 'Buddy request',
           coalesce(p.email, 'Someone') || ' wants to be your savings buddy', new.requester_id, new.id
    from profiles p where p.id = new.requester_id;
  end if;
  return new;
end $$;
drop trigger if exists on_buddy_invite on buddy_links;
create trigger on_buddy_invite after insert on buddy_links
  for each row execute procedure public.notify_buddy_invite();

-- Optional daily auto-deduct (Supabase > Database > Extensions > enable pg_cron first):
-- select cron.schedule('process-due-bills', '5 16 * * *', $$select public.process_due_bills(null)$$);

-- ===== PART 4 =====
-- Ipon migration 003: correct dates, soft delete, safe totals, audit trail.
-- Run AFTER ipon-full-schema.sql. Idempotent.

-- 1. Real entry dates (editable, back-datable), in Manila time
alter table income_entries add column if not exists entry_date date;
alter table allocations    add column if not exists entry_date date;
update income_entries set entry_date = (created_at at time zone 'Asia/Manila')::date where entry_date is null;
update allocations    set entry_date = coalesce(due_date, (created_at at time zone 'Asia/Manila')::date) where entry_date is null;
alter table income_entries alter column entry_date set default ((now() at time zone 'Asia/Manila')::date);
alter table income_entries alter column entry_date set not null;
alter table allocations    alter column entry_date set default ((now() at time zone 'Asia/Manila')::date);
alter table allocations    alter column entry_date set not null;

-- auto-deducted bills are dated on their due date
create or replace function public.set_entry_date_from_due()
returns trigger language plpgsql as $$
begin
  if new.due_date is not null then new.entry_date := new.due_date; end if;
  return new;
end $$;
drop trigger if exists allocations_entry_date on allocations;
create trigger allocations_entry_date before insert on allocations
  for each row execute procedure public.set_entry_date_from_due();

-- 2. Soft delete + closable cutoffs
alter table income_entries add column if not exists deleted_at timestamptz;
alter table allocations    add column if not exists deleted_at timestamptz;
alter table recurring_bills add column if not exists deleted_at timestamptz;
alter table cutoffs add column if not exists deleted_at timestamptz;
alter table cutoffs add column if not exists closed_at timestamptz;

-- 3. A cutoff can no longer wipe its entries when removed
alter table income_entries drop constraint if exists income_entries_cutoff_id_fkey;
alter table income_entries add constraint income_entries_cutoff_id_fkey
  foreign key (cutoff_id) references cutoffs(id) on delete restrict;
alter table allocations drop constraint if exists allocations_cutoff_id_fkey;
alter table allocations add constraint allocations_cutoff_id_fkey
  foreign key (cutoff_id) references cutoffs(id) on delete restrict;

-- 4. Indexes for long-term use
create index if not exists income_user_date_idx on income_entries (user_id, entry_date desc) where deleted_at is null;
create index if not exists alloc_user_date_idx  on allocations (user_id, entry_date desc) where deleted_at is null;
create index if not exists alloc_user_cat_idx   on allocations (user_id, category) where deleted_at is null;
create index if not exists alloc_cutoff_idx     on allocations (cutoff_id);
create index if not exists income_cutoff_idx    on income_entries (cutoff_id);

-- 5. Totals computed in the database (the API caps queries at 1,000 rows)
create or replace function public.get_money_summary(p_cutoff uuid default null)
returns table (total_income numeric, total_out numeric, available numeric,
               total_savings numeric, cutoff_income numeric, cutoff_savings numeric)
language sql stable set search_path = public as $$
  select
    (select coalesce(sum(amount),0) from income_entries where user_id = auth.uid() and deleted_at is null),
    (select coalesce(sum(amount),0) from allocations   where user_id = auth.uid() and deleted_at is null),
    (select coalesce(sum(amount),0) from income_entries where user_id = auth.uid() and deleted_at is null)
      - (select coalesce(sum(amount),0) from allocations where user_id = auth.uid() and deleted_at is null),
    (select coalesce(sum(amount),0) from allocations   where user_id = auth.uid() and deleted_at is null and category = 'savings'),
    (select coalesce(sum(amount),0) from income_entries where user_id = auth.uid() and deleted_at is null and cutoff_id = p_cutoff),
    (select coalesce(sum(amount),0) from allocations   where user_id = auth.uid() and deleted_at is null and category = 'savings' and cutoff_id = p_cutoff)
$$;

-- 6. Paged ledger with running Available balance (newest first)
create or replace function public.get_ledger(p_limit int default 50, p_offset int default 0, p_deleted boolean default false)
returns table (id uuid, kind text, cutoff_id uuid, entry_date date, created_at timestamptz,
               amount numeric, category text, note text, bill_id uuid, running_available numeric)
language sql stable set search_path = public as $$
  with l as (
    select i.id, 'income'::text as kind, i.cutoff_id, i.entry_date, i.created_at, i.amount,
           'income'::text as category, coalesce(i.source, i.note) as note, null::uuid as bill_id,
           i.amount as signed, i.deleted_at
      from income_entries i where i.user_id = auth.uid()
    union all
    select a.id, 'allocation', a.cutoff_id, a.entry_date, a.created_at, a.amount,
           a.category, a.note, a.bill_id, -a.amount, a.deleted_at
      from allocations a where a.user_id = auth.uid()
  ), r as (
    select l.*, sum(case when l.deleted_at is null then l.signed else 0 end)
             over (order by l.entry_date, l.created_at, l.id) as running_available
      from l
  )
  select r.id, r.kind, r.cutoff_id, r.entry_date, r.created_at, r.amount, r.category, r.note, r.bill_id, r.running_available
    from r
   where (r.deleted_at is not null) = p_deleted
   order by r.entry_date desc, r.created_at desc, r.id desc
   limit p_limit offset p_offset
$$;
grant execute on function public.get_money_summary(uuid) to authenticated;
grant execute on function public.get_ledger(int, int, boolean) to authenticated;

-- 7. Audit trail: every edit or hard delete keeps the old row
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  user_id uuid, table_name text not null, row_id uuid, action text not null,
  old_row jsonb, new_row jsonb, changed_at timestamptz default now()
);
alter table audit_log enable row level security;
drop policy if exists "read own audit" on audit_log;
create policy "read own audit" on audit_log for select using (auth.uid() = user_id);

create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, table_name, row_id, action, old_row, new_row)
  values (case when tg_op = 'DELETE' then old.user_id else new.user_id end,
          tg_table_name,
          case when tg_op = 'DELETE' then old.id else new.id end,
          tg_op, to_jsonb(old), case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists audit_income on income_entries;
create trigger audit_income after update or delete on income_entries for each row execute procedure public.log_audit();
drop trigger if exists audit_alloc on allocations;
create trigger audit_alloc after update or delete on allocations for each row execute procedure public.log_audit();
drop trigger if exists audit_bills on recurring_bills;
create trigger audit_bills after update or delete on recurring_bills for each row execute procedure public.log_audit();
drop trigger if exists audit_cutoffs on cutoffs;
create trigger audit_cutoffs after update or delete on cutoffs for each row execute procedure public.log_audit();

-- ===== PART 5 =====
-- Ipon migration 004: accounts, transfers, assets/liabilities, net-worth snapshots.
-- Run AFTER migration 003. Idempotent.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'bank' check (kind in ('cash','bank','ewallet','savings','other')),
  opening_balance numeric(12,2) not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists accounts_one_default on accounts (user_id) where is_default and archived_at is null;

alter table income_entries add column if not exists account_id uuid references accounts(id) on delete restrict;
alter table allocations    add column if not exists account_id uuid references accounts(id) on delete restrict;

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  from_account uuid not null references accounts(id) on delete restrict,
  to_account uuid not null references accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default ((now() at time zone 'Asia/Manila')::date),
  note text, deleted_at timestamptz, created_at timestamptz default now(),
  check (from_account <> to_account)
);

create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('asset','liability')),
  name text not null,
  category text not null default 'other',
  archived_at timestamptz, created_at timestamptz default now()
);
create table if not exists holding_values (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references holdings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  value numeric(14,2) not null check (value >= 0),
  as_of date not null default ((now() at time zone 'Asia/Manila')::date),
  note text, created_at timestamptz default now(),
  unique (holding_id, as_of)
);
create table if not exists networth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  as_of date not null,
  cash_total numeric(14,2) not null default 0,
  assets_total numeric(14,2) not null default 0,
  liabilities_total numeric(14,2) not null default 0,
  net_worth numeric(14,2) not null default 0,
  created_at timestamptz default now(),
  unique (user_id, as_of)
);

do $$
declare t text;
begin
  foreach t in array array['accounts','transfers','holdings','holding_values','networth_snapshots'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- give every existing user one default account and attach their old entries to it
insert into accounts (user_id, name, kind, is_default)
select p.id, 'Main', 'bank', true from profiles p
where not exists (select 1 from accounts a where a.user_id = p.id);
update income_entries i set account_id = (select a.id from accounts a where a.user_id = i.user_id and a.is_default limit 1) where i.account_id is null;
update allocations x set account_id = (select a.id from accounts a where a.user_id = x.user_id and a.is_default limit 1) where x.account_id is null;

create index if not exists income_account_idx on income_entries (account_id) where deleted_at is null;
create index if not exists alloc_account_idx on allocations (account_id) where deleted_at is null;
create index if not exists hv_holding_idx on holding_values (holding_id, as_of desc);

-- balance of every account right now (opening + income - allocations +/- transfers)
create or replace function public.get_account_balances()
returns table (account_id uuid, name text, kind text, balance numeric)
language sql stable set search_path = public as $$
  select a.id, a.name, a.kind,
    a.opening_balance
    + coalesce((select sum(amount) from income_entries i where i.account_id = a.id and i.deleted_at is null), 0)
    - coalesce((select sum(amount) from allocations x where x.account_id = a.id and x.deleted_at is null), 0)
    + coalesce((select sum(amount) from transfers t where t.to_account = a.id and t.deleted_at is null), 0)
    - coalesce((select sum(amount) from transfers t where t.from_account = a.id and t.deleted_at is null), 0)
  from accounts a where a.user_id = auth.uid() and a.archived_at is null order by a.created_at
$$;

-- latest value of every holding, plus totals
create or replace function public.get_net_worth()
returns table (cash_total numeric, assets_total numeric, liabilities_total numeric, net_worth numeric)
language sql stable set search_path = public as $$
  with cash as (select coalesce(sum(balance),0) v from public.get_account_balances()),
  latest as (
    select distinct on (h.id) h.kind, v.value from holdings h
    join holding_values v on v.holding_id = h.id
    where h.user_id = auth.uid() and h.archived_at is null
    order by h.id, v.as_of desc),
  s as (select coalesce(sum(value) filter (where kind='asset'),0) a,
               coalesce(sum(value) filter (where kind='liability'),0) l from latest)
  select cash.v, s.a, s.l, cash.v + s.a - s.l from cash, s
$$;
grant execute on function public.get_account_balances() to authenticated;
grant execute on function public.get_net_worth() to authenticated;

-- ===== PART 5b: account fixes =====
-- Ipon migration 005: keep account balances in step with Available. Run AFTER 003 and 004. Idempotent.

-- bills remember which account pays them
alter table recurring_bills add column if not exists account_id uuid references accounts(id) on delete set null;

-- income saved without an account goes to the default account
create or replace function public.income_default_account()
returns trigger language plpgsql as $$
begin
  if new.account_id is null then
    select a.id into new.account_id from accounts a
     where a.user_id = new.user_id and a.is_default and a.archived_at is null limit 1;
  end if;
  return new;
end $$;
drop trigger if exists income_default_account_trg on income_entries;
create trigger income_default_account_trg before insert on income_entries
  for each row execute procedure public.income_default_account();

-- allocations: use the bill's own account first, then the default account
create or replace function public.alloc_default_account()
returns trigger language plpgsql as $$
begin
  if new.account_id is null and new.bill_id is not null then
    select b.account_id into new.account_id from recurring_bills b where b.id = new.bill_id;
  end if;
  if new.account_id is null then
    select a.id into new.account_id from accounts a
     where a.user_id = new.user_id and a.is_default and a.archived_at is null limit 1;
  end if;
  return new;
end $$;
drop trigger if exists alloc_default_account_trg on allocations;
create trigger alloc_default_account_trg before insert on allocations
  for each row execute procedure public.alloc_default_account();

-- repair rows already saved without an account (old bill payments, auto-deductions)
update allocations x set account_id = (
  select coalesce(b.account_id, (select a.id from accounts a where a.user_id = x.user_id and a.is_default and a.archived_at is null limit 1))
  from (select 1) s left join recurring_bills b on b.id = x.bill_id)
where x.account_id is null;
update income_entries i set account_id = (
  select a.id from accounts a where a.user_id = i.user_id and a.is_default and a.archived_at is null limit 1)
where i.account_id is null;

-- Monthly report (income, spending by category, savings) for one month
create or replace function public.get_monthly_report(p_month date)
returns table (income numeric, bills numeric, groceries numeric, other numeric, savings numeric)
language sql stable set search_path = public as $$
  select
    (select coalesce(sum(amount),0) from income_entries where user_id = auth.uid() and deleted_at is null
       and entry_date >= date_trunc('month', p_month)::date and entry_date < (date_trunc('month', p_month) + interval '1 month')::date),
    (select coalesce(sum(amount),0) from allocations where user_id = auth.uid() and deleted_at is null and category = 'bills'
       and entry_date >= date_trunc('month', p_month)::date and entry_date < (date_trunc('month', p_month) + interval '1 month')::date),
    (select coalesce(sum(amount),0) from allocations where user_id = auth.uid() and deleted_at is null and category = 'groceries'
       and entry_date >= date_trunc('month', p_month)::date and entry_date < (date_trunc('month', p_month) + interval '1 month')::date),
    (select coalesce(sum(amount),0) from allocations where user_id = auth.uid() and deleted_at is null and category = 'other'
       and entry_date >= date_trunc('month', p_month)::date and entry_date < (date_trunc('month', p_month) + interval '1 month')::date),
    (select coalesce(sum(amount),0) from allocations where user_id = auth.uid() and deleted_at is null and category = 'savings'
       and entry_date >= date_trunc('month', p_month)::date and entry_date < (date_trunc('month', p_month) + interval '1 month')::date)
$$;
grant execute on function public.get_monthly_report(date) to authenticated;

-- ============================================================
-- PART 6: final additions (guards, ledger with transfers, buddy + report helpers)
-- ============================================================

-- auto-deduct skips deleted bills
create or replace function public.process_due_bills(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b recurring_bills; cid uuid; n int := 0;
        today date := (now() at time zone 'Asia/Manila')::date;
begin
  for b in select * from recurring_bills
           where active and deleted_at is null and auto_deduct and next_due_date <= today
             and (p_user is null or user_id = p_user) loop
    while b.next_due_date <= today loop
      select id into cid from cutoffs
        where user_id = b.user_id and deleted_at is null
          and b.next_due_date between start_date and end_date limit 1;
      if cid is null then
        select id into cid from cutoffs where user_id = b.user_id and deleted_at is null
          order by start_date desc limit 1;
      end if;
      exit when cid is null;
      insert into allocations (user_id, cutoff_id, category, amount, note, bill_id, shared, estimated, due_date)
        values (b.user_id, cid, 'bills', b.expected_amount, b.name || ' (auto)', b.id, b.shared, true, b.next_due_date)
        on conflict (bill_id, due_date) do nothing;
      n := n + 1;
      b.next_due_date := advance_due(b.next_due_date, b.frequency, b.due_anchor_day);
      update recurring_bills set next_due_date = b.next_due_date, last_charged_on = today where id = b.id;
    end loop;
  end loop;
  return n;
end $$;

-- a closed cutoff accepts no new manual entries (auto-deducted bills are still allowed)
create or replace function public.guard_closed_cutoff()
returns trigger language plpgsql as $$
declare v_closed timestamptz;
begin
  select closed_at into v_closed from cutoffs where id = new.cutoff_id;
  if v_closed is not null
     and not ((to_jsonb(new)->>'bill_id') is not null and (to_jsonb(new)->>'due_date') is not null) then
    raise exception 'This cutoff is closed. Reopen it to add entries.';
  end if;
  return new;
end $$;
drop trigger if exists income_closed_guard on income_entries;
create trigger income_closed_guard before insert on income_entries
  for each row execute procedure public.guard_closed_cutoff();
drop trigger if exists alloc_closed_guard on allocations;
create trigger alloc_closed_guard before insert on allocations
  for each row execute procedure public.guard_closed_cutoff();

-- ledger now includes transfers (neutral: they never change total Available)
create or replace function public.get_ledger(p_limit int default 50, p_offset int default 0, p_deleted boolean default false)
returns table (id uuid, kind text, cutoff_id uuid, entry_date date, created_at timestamptz,
               amount numeric, category text, note text, bill_id uuid, running_available numeric)
language sql stable set search_path = public as $$
  with l as (
    select i.id, 'income'::text as kind, i.cutoff_id, i.entry_date, i.created_at, i.amount,
           'income'::text as category, coalesce(i.source, i.note) as note, null::uuid as bill_id,
           i.amount as signed, i.deleted_at
      from income_entries i where i.user_id = auth.uid()
    union all
    select a.id, 'allocation', a.cutoff_id, a.entry_date, a.created_at, a.amount,
           a.category, a.note, a.bill_id, -a.amount, a.deleted_at
      from allocations a where a.user_id = auth.uid()
    union all
    select t.id, 'transfer', null::uuid, t.entry_date, t.created_at, t.amount,
           'transfer', coalesce(t.note, fa.name || ' -> ' || ta.name), null::uuid, 0::numeric, t.deleted_at
      from transfers t
      join accounts fa on fa.id = t.from_account
      join accounts ta on ta.id = t.to_account
     where t.user_id = auth.uid()
  ), r as (
    select l.*, sum(case when l.deleted_at is null then l.signed else 0 end)
             over (order by l.entry_date, l.created_at, l.id) as running_available
      from l
  )
  select r.id, r.kind, r.cutoff_id, r.entry_date, r.created_at, r.amount, r.category, r.note, r.bill_id, r.running_available
    from r
   where (r.deleted_at is not null) = p_deleted
   order by r.entry_date desc, r.created_at desc, r.id desc
   limit p_limit offset p_offset
$$;

-- buddy totals computed in the database (checks the buddy link first)
create or replace function public.get_buddy_summary(p_buddy uuid)
returns table (total_savings numeric, cutoff_savings numeric, cutoff_target numeric, cutoff_start date, cutoff_end date)
language plpgsql stable security definer set search_path = public as $$
declare c cutoffs;
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  select * into c from cutoffs where user_id = p_buddy and deleted_at is null order by start_date desc limit 1;
  return query select
    (select coalesce(sum(a.amount),0) from allocations a where a.user_id = p_buddy and a.deleted_at is null and a.category = 'savings'),
    (select coalesce(sum(a.amount),0) from allocations a where a.user_id = p_buddy and a.deleted_at is null and a.category = 'savings' and a.cutoff_id = c.id),
    coalesce(c.target_amount, 0), c.start_date, c.end_date;
end $$;
revoke all on function public.get_buddy_summary(uuid) from public, anon;
grant execute on function public.get_buddy_summary(uuid) to authenticated;

-- cutoff-by-cutoff history for the Reports page
create or replace function public.get_cutoff_history()
returns table (cutoff_id uuid, start_date date, end_date date, target_amount numeric,
               income numeric, saved numeric, closed_at timestamptz)
language sql stable set search_path = public as $$
  select c.id, c.start_date, c.end_date, c.target_amount,
    (select coalesce(sum(i.amount),0) from income_entries i where i.cutoff_id = c.id and i.deleted_at is null),
    (select coalesce(sum(a.amount),0) from allocations a where a.cutoff_id = c.id and a.deleted_at is null and a.category = 'savings'),
    c.closed_at
  from cutoffs c where c.user_id = auth.uid() and c.deleted_at is null order by c.start_date desc
$$;
grant execute on function public.get_cutoff_history() to authenticated;

-- audit trail also covers the wealth tables
drop trigger if exists audit_transfers on transfers;
create trigger audit_transfers after update or delete on transfers for each row execute procedure public.log_audit();
drop trigger if exists audit_accounts on accounts;
create trigger audit_accounts after update or delete on accounts for each row execute procedure public.log_audit();
drop trigger if exists audit_holdings on holdings;
create trigger audit_holdings after update or delete on holdings for each row execute procedure public.log_audit();

-- every new user automatically gets a default account
create or replace function public.create_default_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into accounts (user_id, name, kind, is_default) values (new.id, 'Main', 'bank', true)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists profiles_default_account on profiles;
create trigger profiles_default_account after insert on profiles
  for each row execute procedure public.create_default_account();

-- ============================================================
-- PART 7: reconcile, account removal, private-by-default buddy sharing
-- ============================================================

-- Reconcile an account to its real balance (atomic; picks the open cutoff itself)
create or replace function public.reconcile_account(p_account uuid, p_real_balance numeric)
returns numeric language plpgsql set search_path = public as $$
declare v_cur numeric; v_diff numeric; v_cut uuid;
        v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select b.balance into v_cur from get_account_balances() b where b.account_id = p_account;
  if not found then raise exception 'Account not found'; end if;
  v_diff := round(p_real_balance - v_cur, 2);
  if v_diff = 0 then return 0; end if;
  select c.id into v_cut from cutoffs c
   where c.user_id = auth.uid() and c.deleted_at is null and c.closed_at is null
     and v_today between c.start_date and c.end_date order by c.start_date desc limit 1;
  if v_cut is null then
    select c.id into v_cut from cutoffs c
     where c.user_id = auth.uid() and c.deleted_at is null and c.closed_at is null
     order by c.start_date desc limit 1;
  end if;
  if v_cut is null then raise exception 'Create or reopen a cutoff before reconciling.'; end if;
  if v_diff > 0 then
    insert into income_entries (user_id, cutoff_id, account_id, amount, source, entry_date)
      values (auth.uid(), v_cut, p_account, v_diff, 'Reconcile Adjustment', v_today);
  else
    insert into allocations (user_id, cutoff_id, account_id, category, amount, note, entry_date)
      values (auth.uid(), v_cut, p_account, 'other', -v_diff, 'Reconcile Adjustment', v_today);
  end if;
  return v_diff;
end $$;

-- Remove an account: hard-delete only if it was never used, otherwise archive it
-- (its balance is moved to another account first, so totals never change)
create or replace function public.remove_account(p_account uuid, p_move_to uuid default null)
returns text language plpgsql set search_path = public as $$
declare a accounts; v_bal numeric; v_used boolean; v_n int; v_new_default uuid;
        v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into a from accounts where id = p_account and user_id = auth.uid() and archived_at is null;
  if not found then raise exception 'Account not found'; end if;
  select count(*) into v_n from accounts where user_id = auth.uid() and archived_at is null;
  if v_n <= 1 then raise exception 'You need at least one account.'; end if;
  select b.balance into v_bal from get_account_balances() b where b.account_id = p_account;
  v_bal := coalesce(v_bal, 0);
  if p_move_to is not null and (p_move_to = p_account or not exists
      (select 1 from accounts where id = p_move_to and user_id = auth.uid() and archived_at is null)) then
    raise exception 'Choose a different, active account to move to.';
  end if;
  if v_bal <> 0 and p_move_to is null then
    raise exception 'This account holds %. Choose where to move the balance.', v_bal;
  end if;
  v_used := exists (select 1 from income_entries where account_id = p_account)
         or exists (select 1 from allocations where account_id = p_account)
         or exists (select 1 from transfers where from_account = p_account or to_account = p_account);
  if v_bal > 0 then
    insert into transfers (user_id, from_account, to_account, amount, entry_date, note)
      values (auth.uid(), p_account, p_move_to, v_bal, v_today, 'Account removed: balance moved');
  elsif v_bal < 0 then
    insert into transfers (user_id, from_account, to_account, amount, entry_date, note)
      values (auth.uid(), p_move_to, p_account, -v_bal, v_today, 'Account removed: balance moved');
  end if;
  update recurring_bills set account_id = p_move_to where account_id = p_account;
  if a.is_default then
    update accounts set is_default = false where id = p_account;
    select x.id into v_new_default from accounts x
     where x.user_id = auth.uid() and x.archived_at is null and x.id <> p_account
     order by (x.id = p_move_to) desc nulls last, x.created_at limit 1;
    update accounts set is_default = true where id = v_new_default;
  end if;
  if not v_used and a.opening_balance = 0 then
    delete from accounts where id = p_account;
    return 'deleted';
  end if;
  update accounts set archived_at = now(), is_default = false where id = p_account;
  return 'archived';
end $$;

grant execute on function public.reconcile_account(uuid, numeric) to authenticated;
grant execute on function public.remove_account(uuid, uuid) to authenticated;

-- ---------- Buddy: private by default, share only what each person allows ----------
-- Buddies no longer read each other's tables directly; everything goes through the functions below.
drop policy if exists "view own or buddy cutoffs" on cutoffs;
drop policy if exists "view own cutoffs" on cutoffs;
create policy "view own cutoffs" on cutoffs for select using (auth.uid() = user_id);
drop policy if exists "view own or buddy income" on income_entries;
drop policy if exists "view own income" on income_entries;
create policy "view own income" on income_entries for select using (auth.uid() = user_id);
drop policy if exists "view own or buddy allocations" on allocations;
drop policy if exists "view own allocations" on allocations;
create policy "view own allocations" on allocations for select using (auth.uid() = user_id);
drop policy if exists "view own or buddy bills" on recurring_bills;
drop policy if exists "view own bills" on recurring_bills;
create policy "view own bills" on recurring_bills for select using (auth.uid() = user_id);
drop policy if exists "view own or buddy food" on food_entries;
drop policy if exists "view own food" on food_entries;
create policy "view own food" on food_entries for select using (auth.uid() = user_id);
drop policy if exists "view own or buddy mood" on mood_entries;
drop policy if exists "view own mood" on mood_entries;
create policy "view own mood" on mood_entries for select using (auth.uid() = user_id);

create table if not exists buddy_sharing (
  user_id uuid primary key references profiles(id) on delete cascade,
  share_savings   boolean not null default true,
  share_available boolean not null default false,
  share_progress  boolean not null default true,
  share_bills     boolean not null default false,
  share_mood      boolean not null default false,
  updated_at timestamptz default now()
);
alter table buddy_sharing enable row level security;
drop policy if exists "own sharing" on buddy_sharing;
create policy "own sharing" on buddy_sharing for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.buddy_pref(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case p_key when 'savings' then s.share_savings when 'available' then s.share_available
                       when 'progress' then s.share_progress when 'bills' then s.share_bills
                       when 'mood' then s.share_mood end
       from buddy_sharing s where s.user_id = p_user),
    p_key in ('savings', 'progress'))
$$;
revoke all on function public.buddy_pref(uuid, text) from public, anon, authenticated;

-- consecutive finished cutoffs in which the savings target was met
create or replace function public.savings_streak(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  with c as (
    select row_number() over (order by cu.start_date desc) as rn,
           (cu.target_amount > 0 and coalesce((select sum(a.amount) from allocations a
              where a.cutoff_id = cu.id and a.deleted_at is null and a.category = 'savings'), 0) >= cu.target_amount) as met
      from cutoffs cu
     where cu.user_id = p_user and cu.deleted_at is null
       and cu.end_date < (now() at time zone 'Asia/Manila')::date)
  select coalesce((select min(rn) from c where not met) - 1, (select count(*) from c))::int
$$;
revoke all on function public.savings_streak(uuid) from public, anon, authenticated;
create or replace function public.get_my_streak()
returns int language sql stable security definer set search_path = public as $$
  select public.savings_streak(auth.uid())
$$;
grant execute on function public.get_my_streak() to authenticated;

-- side-by-side overview; the buddy's numbers are NULL unless they chose to share them
create or replace function public.get_buddy_overview(p_buddy uuid)
returns table (
  buddy_email text, buddy_name text,
  my_total_savings numeric, my_available numeric, my_cutoff_saved numeric, my_cutoff_target numeric,
  my_cutoff_start date, my_cutoff_end date, my_streak int,
  b_total_savings numeric, b_available numeric, b_cutoff_saved numeric, b_cutoff_target numeric,
  b_cutoff_start date, b_cutoff_end date, b_streak int,
  b_shares_savings boolean, b_shares_available boolean, b_shares_progress boolean,
  b_shares_bills boolean, b_shares_mood boolean)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mc cutoffs; bc cutoffs; pr profiles;
        s_sav boolean; s_av boolean; s_pr boolean;
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  select * into pr from profiles where id = p_buddy;
  select * into mc from cutoffs where user_id = me and deleted_at is null order by start_date desc limit 1;
  select * into bc from cutoffs where user_id = p_buddy and deleted_at is null order by start_date desc limit 1;
  s_sav := public.buddy_pref(p_buddy, 'savings');
  s_av  := public.buddy_pref(p_buddy, 'available');
  s_pr  := public.buddy_pref(p_buddy, 'progress');
  return query select
    pr.email, pr.full_name,
    (select coalesce(sum(a.amount),0) from allocations a where a.user_id = me and a.deleted_at is null and a.category = 'savings'),
    (select coalesce(sum(i.amount),0) from income_entries i where i.user_id = me and i.deleted_at is null)
      - (select coalesce(sum(a.amount),0) from allocations a where a.user_id = me and a.deleted_at is null),
    (select coalesce(sum(a.amount),0) from allocations a where a.cutoff_id = mc.id and a.deleted_at is null and a.category = 'savings'),
    coalesce(mc.target_amount, 0), mc.start_date, mc.end_date, public.savings_streak(me),
    case when s_sav then (select coalesce(sum(a.amount),0) from allocations a where a.user_id = p_buddy and a.deleted_at is null and a.category = 'savings') end,
    case when s_av then (select coalesce(sum(i.amount),0) from income_entries i where i.user_id = p_buddy and i.deleted_at is null)
      - (select coalesce(sum(a.amount),0) from allocations a where a.user_id = p_buddy and a.deleted_at is null) end,
    case when s_pr then (select coalesce(sum(a.amount),0) from allocations a where a.cutoff_id = bc.id and a.deleted_at is null and a.category = 'savings') end,
    case when s_pr then coalesce(bc.target_amount, 0) end,
    case when s_pr then bc.start_date end, case when s_pr then bc.end_date end,
    case when s_pr then public.savings_streak(p_buddy) end,
    s_sav, s_av, s_pr, public.buddy_pref(p_buddy, 'bills'), public.buddy_pref(p_buddy, 'mood');
end $$;

-- last N cutoffs, you vs buddy, for a comparison chart
create or replace function public.get_buddy_history(p_buddy uuid, p_limit int default 6)
returns table (idx int, my_start date, my_saved numeric, my_target numeric,
               b_start date, b_saved numeric, b_target numeric)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_share boolean;
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  v_share := public.buddy_pref(p_buddy, 'progress');
  return query
  select g.i, m.start_date, m.saved, m.target, b.start_date, b.saved, b.target
    from generate_series(1, greatest(1, least(p_limit, 12))) as g(i)
    left join lateral (
      select c.start_date, c.target_amount as target,
             (select coalesce(sum(a.amount),0) from allocations a where a.cutoff_id = c.id and a.deleted_at is null and a.category = 'savings') as saved
        from cutoffs c where c.user_id = me and c.deleted_at is null
       order by c.start_date desc offset g.i - 1 limit 1) m on true
    left join lateral (
      select c.start_date, c.target_amount as target,
             (select coalesce(sum(a.amount),0) from allocations a where a.cutoff_id = c.id and a.deleted_at is null and a.category = 'savings') as saved
        from cutoffs c where c.user_id = p_buddy and c.deleted_at is null and v_share
       order by c.start_date desc offset g.i - 1 limit 1) b on true
   where m.start_date is not null or b.start_date is not null
   order by g.i;
end $$;

-- the buddy's bills that are marked shared (only if they allow it)
create or replace function public.get_buddy_shared_bills(p_buddy uuid)
returns table (name text, expected_amount numeric, next_due_date date, frequency text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  return query select b.name, b.expected_amount, b.next_due_date, b.frequency
    from recurring_bills b
   where b.user_id = p_buddy and b.shared and b.active and b.deleted_at is null
     and public.buddy_pref(p_buddy, 'bills')
   order by b.next_due_date;
end $$;

-- the buddy's mood for the last 7 days (only if they allow it)
create or replace function public.get_buddy_mood(p_buddy uuid)
returns table (log_date date, mood text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  return query select m.log_date, m.mood from mood_entries m
   where m.user_id = p_buddy and public.buddy_pref(p_buddy, 'mood')
     and m.log_date >= (now() at time zone 'Asia/Manila')::date - 6
   order by m.log_date desc;
end $$;

-- cheers: a small encouragement notification (max 5 per day per buddy)
create or replace function public.send_buddy_cheer(p_buddy uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int; v_email text;
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  select count(*) into n from notifications
   where user_id = p_buddy and related_user_id = me and type = 'BUDDY_CHEER' and created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'Daily cheer limit reached (5).'; end if;
  select email into v_email from profiles where id = me;
  insert into notifications (user_id, type, title, message, related_user_id)
  values (p_buddy, 'BUDDY_CHEER', 'Cheer from ' || coalesce(v_email, 'your buddy'),
          left(coalesce(nullif(trim(p_message), ''), 'You are doing great!'), 140), me);
end $$;

-- shared goals between two linked buddies
create table if not exists buddy_goals (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references buddy_links(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  start_date date not null default ((now() at time zone 'Asia/Manila')::date),
  due_date date,
  created_by uuid not null references profiles(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz default now()
);
alter table buddy_goals enable row level security;
drop policy if exists "goal select" on buddy_goals;
create policy "goal select" on buddy_goals for select using (exists (select 1 from buddy_links l
  where l.id = buddy_goals.link_id and l.status = 'accepted' and auth.uid() in (l.requester_id, l.addressee_id)));
drop policy if exists "goal insert" on buddy_goals;
create policy "goal insert" on buddy_goals for insert with check (created_by = auth.uid() and exists (select 1 from buddy_links l
  where l.id = buddy_goals.link_id and l.status = 'accepted' and auth.uid() in (l.requester_id, l.addressee_id)));
drop policy if exists "goal update" on buddy_goals;
create policy "goal update" on buddy_goals for update using (exists (select 1 from buddy_links l
  where l.id = buddy_goals.link_id and l.status = 'accepted' and auth.uid() in (l.requester_id, l.addressee_id)));
drop policy if exists "goal delete" on buddy_goals;
create policy "goal delete" on buddy_goals for delete using (exists (select 1 from buddy_links l
  where l.id = buddy_goals.link_id and l.status = 'accepted' and auth.uid() in (l.requester_id, l.addressee_id)));

create or replace function public.get_buddy_goals(p_buddy uuid)
returns table (goal_id uuid, name text, target_amount numeric, start_date date, due_date date,
               my_saved numeric, buddy_saved numeric, total_saved numeric, created_by uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_share boolean;
begin
  if not public.is_buddy(p_buddy) then raise exception 'Not a linked buddy'; end if;
  v_share := public.buddy_pref(p_buddy, 'savings');
  return query
  select g.id, g.name, g.target_amount, g.start_date, g.due_date,
         (select coalesce(sum(a.amount),0) from allocations a where a.user_id = me and a.deleted_at is null and a.category = 'savings' and a.entry_date >= g.start_date),
         case when v_share then (select coalesce(sum(a.amount),0) from allocations a where a.user_id = p_buddy and a.deleted_at is null and a.category = 'savings' and a.entry_date >= g.start_date) end,
         (select coalesce(sum(a.amount),0) from allocations a where a.user_id = me and a.deleted_at is null and a.category = 'savings' and a.entry_date >= g.start_date)
           + case when v_share then (select coalesce(sum(a.amount),0) from allocations a where a.user_id = p_buddy and a.deleted_at is null and a.category = 'savings' and a.entry_date >= g.start_date) else 0 end,
         g.created_by
    from buddy_goals g join buddy_links l on l.id = g.link_id
   where g.archived_at is null and l.status = 'accepted'
     and ((l.requester_id = me and l.addressee_id = p_buddy) or (l.requester_id = p_buddy and l.addressee_id = me))
   order by g.created_at desc;
end $$;

grant execute on function public.get_buddy_overview(uuid) to authenticated;
grant execute on function public.get_buddy_history(uuid, int) to authenticated;
grant execute on function public.get_buddy_shared_bills(uuid) to authenticated;
grant execute on function public.get_buddy_mood(uuid) to authenticated;
grant execute on function public.send_buddy_cheer(uuid, text) to authenticated;
grant execute on function public.get_buddy_goals(uuid) to authenticated;
