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

alter table allocations
  add constraint if not exists allocations_bill_fk
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
