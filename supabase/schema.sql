-- MV Car Detail · schema (Supabase project "proyectumia", everything prefixed mvcd_)
-- Public reads: services, settings, photos, published testimonials, slots (no customer data).
-- Writes: only the admin (mvcd_admins). Customers book through mvcd_book() which checks overlaps atomically.

create table if not exists public.mvcd_admins (email text primary key);
insert into public.mvcd_admins values ('mvcardetail01@gmail.com') on conflict do nothing;

create or replace function public.mvcd_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mvcd_admins where email = lower(auth.jwt() ->> 'email'))
$$;

create table if not exists public.mvcd_services (
  slug text primary key,
  name text not null,
  price numeric(8,2) not null,
  duration_min int not null,
  tagline text not null default '',
  includes text[] not null default '{}',
  note text not null default '',
  level int not null,             -- 1..5, drives the 3D car animation
  popular boolean not null default false,
  active boolean not null default true
);

create table if not exists public.mvcd_settings (key text primary key, value jsonb not null);

create table if not exists public.mvcd_photos (
  id bigint generated always as identity primary key,
  url text not null,
  caption text not null default '',
  section text not null default 'gallery' check (section in ('hero','gallery')),
  sort int not null default 0
);

create table if not exists public.mvcd_testimonials (
  id bigint generated always as identity primary key,
  name text not null,
  vehicle text not null default '',
  text text not null,
  rating int not null default 5 check (rating between 1 and 5),
  photo_url text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.mvcd_bookings (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null references public.mvcd_services(slug),
  service_name text not null,
  price numeric(8,2) not null,
  offer_applied boolean not null default false,
  start_at timestamptz not null,
  end_at timestamptz not null,
  city text not null,
  address text not null,
  name text not null,
  phone text not null,
  email text not null,
  vehicle text not null,
  notes text not null default '',
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','done')),
  gcal_event_id text,
  created_at timestamptz not null default now()
);

-- Busy time, no customer data: safe to expose publicly + realtime.
-- source 'booking' rows mirror mvcd_bookings; 'gcal' rows are synced from Google Calendar by n8n.
create table if not exists public.mvcd_slots (
  id bigint generated always as identity primary key,
  start_at timestamptz not null,
  end_at timestamptz not null,
  source text not null check (source in ('booking','gcal')),
  booking_id uuid unique references public.mvcd_bookings(id) on delete cascade,
  gcal_id text unique
);
create index if not exists mvcd_slots_range on public.mvcd_slots (start_at, end_at);

alter table public.mvcd_admins enable row level security;
alter table public.mvcd_services enable row level security;
alter table public.mvcd_settings enable row level security;
alter table public.mvcd_photos enable row level security;
alter table public.mvcd_testimonials enable row level security;
alter table public.mvcd_bookings enable row level security;
alter table public.mvcd_slots enable row level security;

drop policy if exists "read" on public.mvcd_services;
create policy "read" on public.mvcd_services for select using (true);
drop policy if exists "admin" on public.mvcd_services;
create policy "admin" on public.mvcd_services for all using (mvcd_is_admin()) with check (mvcd_is_admin());

drop policy if exists "read" on public.mvcd_settings;
create policy "read" on public.mvcd_settings for select using (true);
drop policy if exists "admin" on public.mvcd_settings;
create policy "admin" on public.mvcd_settings for all using (mvcd_is_admin()) with check (mvcd_is_admin());

drop policy if exists "read" on public.mvcd_photos;
create policy "read" on public.mvcd_photos for select using (true);
drop policy if exists "admin" on public.mvcd_photos;
create policy "admin" on public.mvcd_photos for all using (mvcd_is_admin()) with check (mvcd_is_admin());

drop policy if exists "read" on public.mvcd_testimonials;
create policy "read" on public.mvcd_testimonials for select using (published or mvcd_is_admin());
drop policy if exists "admin" on public.mvcd_testimonials;
create policy "admin" on public.mvcd_testimonials for all using (mvcd_is_admin()) with check (mvcd_is_admin());

drop policy if exists "admin" on public.mvcd_bookings;
create policy "admin" on public.mvcd_bookings for all using (mvcd_is_admin()) with check (mvcd_is_admin());

drop policy if exists "read" on public.mvcd_slots;
create policy "read" on public.mvcd_slots for select using (true);
drop policy if exists "admin" on public.mvcd_slots;
create policy "admin" on public.mvcd_slots for all using (mvcd_is_admin()) with check (mvcd_is_admin());

-- Keep slots in sync with bookings (cancelled bookings free their slot).
create or replace function public.mvcd_sync_slot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from mvcd_slots where booking_id = new.id;
  if new.status <> 'cancelled' then
    insert into mvcd_slots (start_at, end_at, source, booking_id)
    values (new.start_at, new.end_at, 'booking', new.id);
  end if;
  return new;
end $$;
drop trigger if exists mvcd_sync_slot on public.mvcd_bookings;
create trigger mvcd_sync_slot after insert or update of start_at, end_at, status on public.mvcd_bookings
for each row execute function public.mvcd_sync_slot();

-- Public booking entry point. Price comes from the DB, never from the browser.
create or replace function public.mvcd_book(
  p_service text, p_start timestamptz, p_city text, p_address text,
  p_name text, p_phone text, p_email text, p_vehicle text, p_notes text, p_first_time boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s mvcd_services;
  o jsonb;
  v_end timestamptz;
  v_price numeric;
  v_offer boolean := false;
  v_id uuid;
  local_start timestamp := p_start at time zone 'America/New_York';
  dow int := extract(isodow from local_start);
begin
  select * into s from mvcd_services where slug = p_service and active;
  if not found then raise exception 'Unknown service'; end if;
  if p_start < now() + interval '2 hours' then raise exception 'Please pick a later time'; end if;
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_phone,''))) < 7
     or coalesce(p_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(trim(coalesce(p_address,''))) < 4 then
    raise exception 'Please complete your contact details';
  end if;

  -- 30 min travel buffer after each job (mobile service)
  v_end := p_start + make_interval(mins => s.duration_min + 30);

  -- business hours (Eastern): Mon-Fri 8:00-18:30, Sat 9:00-15:00, Sun closed
  if dow = 7
     or (dow = 6 and (local_start::time < '09:00' or (local_start + make_interval(mins => s.duration_min))::time > '15:00'))
     or (dow < 6 and (local_start::time < '08:00' or (local_start + make_interval(mins => s.duration_min))::time > '18:30')) then
    raise exception 'Outside business hours';
  end if;

  perform pg_advisory_xact_lock(hashtext('mvcd_book'));
  if exists (select 1 from mvcd_slots where start_at < v_end and end_at > p_start) then
    raise exception 'That time was just taken, please choose another slot';
  end if;

  v_price := s.price;
  select value into o from mvcd_settings where key = 'offer';
  if p_first_time and o is not null and (o->>'active')::boolean and o->>'service' = s.slug then
    v_price := (o->>'price')::numeric;
    v_offer := true;
  end if;

  insert into mvcd_bookings (service_slug, service_name, price, offer_applied, start_at, end_at, city, address,
                             name, phone, email, vehicle, notes)
  values (s.slug, s.name, v_price, v_offer, p_start, v_end, p_city, trim(p_address),
          trim(p_name), trim(p_phone), lower(trim(p_email)), trim(coalesce(p_vehicle,'')), left(coalesce(p_notes,''), 1000))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.mvcd_book from public;
grant execute on function public.mvcd_book to anon, authenticated;

-- Realtime availability
do $$ begin
  alter publication supabase_realtime add table public.mvcd_slots;
exception when duplicate_object then null; end $$;

-- Storage for admin uploads
insert into storage.buckets (id, name, public) values ('mvcd-media', 'mvcd-media', true)
on conflict (id) do nothing;
drop policy if exists "mvcd admin write" on storage.objects;
create policy "mvcd admin write" on storage.objects for all to authenticated
  using (bucket_id = 'mvcd-media' and public.mvcd_is_admin())
  with check (bucket_id = 'mvcd-media' and public.mvcd_is_admin());

-- Seed data
insert into public.mvcd_services (slug, name, price, duration_min, tagline, includes, note, level, popular) values
('exterior', 'Exterior Wash', 35, 45, 'Professional exterior hand wash for a clean, refreshed finish.',
 array['Exterior hand wash','Wheel and tire cleaning','Exterior window cleaning','Tire dressing','Exterior towel drying'],
 'Starting at $35 for sedans and coupes. Additional charges may apply based on vehicle condition.', 1, false),
('deep', 'Deep Cleaning', 49, 75, 'Refresh your vehicle inside and out with our essential detailing package.',
 array['Exterior hand wash','Wheel and tire cleaning','Interior vacuum','Dashboard and console wipe-down','Interior and exterior window cleaning','Light interior surface cleaning','Tire dressing'],
 'Starting at $49. Deep stain removal, shampooing and pet hair removal are not included. Final pricing depends on vehicle condition.', 2, false),
('interior', 'Interior Detail', 89, 120, 'A thorough interior cleaning designed to restore freshness, comfort and a well-maintained appearance.',
 array['Detailed interior vacuum','Seats, carpets and floor mats cleaning','Dashboard, console and door panel cleaning','Interior trim and cup holder detailing','Interior window cleaning','Interior surface conditioning where appropriate','Light spot treatment'],
 'Starting at $89. Heavy stains, excessive pet hair and intensive extraction may require additional charges. Exterior wash not included.', 3, false),
('full', 'Full Detail', 149, 180, 'Complete interior and exterior detailing to enhance your vehicle''s cleanliness and overall appearance.',
 array['Thorough exterior hand wash','Wheel and tire detailing','Door jamb cleaning','Detailed interior vacuum','Dashboard, console and door panel cleaning','Seats and floor mats cleaning','Interior and exterior window cleaning','Tire dressing','Spray paint protection'],
 'Starting at $149. Heavy stain extraction, paint correction and ceramic coating are not included.', 4, true),
('premium', 'Premium Detail', 175, 240, 'Our enhanced detailing package for customers seeking a higher level of interior care and exterior finish.',
 array['Thorough exterior hand wash','Detailed wheel and tire cleaning','Door jamb cleaning','Deep interior vacuum','Detailed dashboard, console and trim cleaning','Seats, carpets and floor mats cleaning','Targeted shampoo or extraction of light stains','Interior surface conditioning','Interior and exterior window cleaning','Enhanced spray paint protection','Tire dressing'],
 'Starting at $175. Severe stains, extensive extraction, paint correction and ceramic coating require a separate quote.', 5, false)
on conflict (slug) do nothing;

insert into public.mvcd_settings (key, value) values
('offer', '{"active": true, "service": "premium", "price": 149, "code": "FIRSTSHINE", "headline": "First detail with us? Get Premium for the price of Full.", "detail": "Premium Detail for $149 instead of $175 on your first booking. Deeper interior care, light stain extraction and enhanced paint protection."}')
on conflict (key) do nothing;

insert into public.mvcd_photos (url, caption, section, sort)
select * from (values
  ('/img/setmore-1.webp', 'Aircraft & vehicle detailing on the ramp', 'hero', 0),
  ('/img/work-2.webp', 'Hangar call — we bring everything', 'gallery', 1),
  ('/img/work-7.webp', 'BMW M4 foam bath', 'gallery', 2),
  ('/img/work-5.webp', 'Cadillac Escalade snow foam', 'gallery', 3),
  ('/img/work-10.webp', 'Audi Q7 interior reset', 'gallery', 4),
  ('/img/work-3.webp', 'Leather conditioning', 'gallery', 5),
  ('/img/work-8.webp', 'Deep gloss on a classic', 'gallery', 6),
  ('/img/setmore-9.webp', 'Luxury interior detail', 'gallery', 7),
  ('/img/setmore-8.webp', 'Wheel & tire deep clean', 'gallery', 8),
  ('/img/work-6.webp', 'Driveway service: M3 & RS3', 'gallery', 9),
  ('/img/work-11.webp', 'Engine bay detail', 'gallery', 10),
  ('/img/setmore-10.webp', 'G-Wagon wash', 'gallery', 11),
  ('/img/setmore-6.webp', 'Aircraft cabin detailing', 'gallery', 12),
  ('/img/work-9.webp', 'Two-bucket hand wash', 'gallery', 13),
  ('/img/setmore-7.webp', 'Leather protection', 'gallery', 14),
  ('/img/work-4.webp', 'R33 Skyline & S14 day', 'gallery', 15)
) v where not exists (select 1 from public.mvcd_photos);

-- n8n pushes busy blocks from Google Calendar (events not created by bookings). Replaces future gcal rows.
create or replace function public.mvcd_sync_gcal(p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from mvcd_slots where source = 'gcal' and end_at > now();
  insert into mvcd_slots (start_at, end_at, source, gcal_id)
  select (e->>'start')::timestamptz, (e->>'end')::timestamptz, 'gcal', e->>'id'
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e
  where (e->>'end')::timestamptz > now()
  on conflict (gcal_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mvcd_sync_gcal from public, anon, authenticated;
grant execute on function public.mvcd_sync_gcal to service_role;

-- Google rating shown on the landing (editable in admin → Testimonials)
insert into public.mvcd_settings (key, value) values
('google', '{"rating": 5.0, "count": 17, "url": "https://maps.app.goo.gl/Kv2w4gDw9cT3go1c7"}')
on conflict (key) do nothing;

-- Card photo per service (used on /landing), and the shop's Google profile
alter table public.mvcd_services add column if not exists image_url text not null default '';
update public.mvcd_settings set value = '{"rating": 4.9, "count": 46, "url": "https://maps.app.goo.gl/iEH7dF7M1SHxewJR6", "address": "3937 Pembroke Rd, Hollywood, FL 33021", "linkme": "https://link.me/mvcardetail"}' where key = 'google';
