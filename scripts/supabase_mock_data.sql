-- Supabase mock schema + seed data (walmart_ prefixed, snake_case)
-- Run in Supabase SQL editor

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.walmart_trucks (
  truck_id text primary key,
  home_dc text not null,
  equipment_type text not null,
  capacity_lbs integer not null,
  capacity_cuft integer not null,
  year integer not null,
  mpg double precision not null,
  cost_per_mile double precision not null,
  status_monday text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.walmart_drivers (
  driver_id text primary key,
  name text not null,
  home_dc text not null,
  assigned_truck_id text unique,
  schedule_type text not null,
  hos_cycle text not null,
  hos_available_monday double precision not null,
  start_time_policy text not null,
  static_start_time text,
  experience_years integer not null,
  endorsements text[] not null default '{}',
  days_from_home_mon integer not null default 0,
  week_miles_target integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint walmart_drivers_truck_fk foreign key (assigned_truck_id)
    references public.walmart_trucks (truck_id) on delete set null
);

create table if not exists public.walmart_scenarios (
  scenario_id text primary key,
  name text not null,
  problem_type text not null,
  description text not null,
  loads_affected integer not null,
  baseline_cost double precision not null,
  vetra_cost double precision not null,
  savings double precision not null,
  savings_pct double precision not null,
  primary_lever text not null,
  kpis jsonb not null default '{}'::jsonb,
  confidence text not null,
  recommended_for text not null,
  created_at timestamptz default now()
);

create table if not exists public.walmart_loads (
  load_id text primary key,
  scenario_id text not null references public.walmart_scenarios (scenario_id),
  day_of_week text not null,
  day_of_week_index integer not null,
  origin_city text not null,
  destination_city text not null,
  corridor text not null,
  distance_miles integer not null,
  equipment_required text not null,
  weight_lbs integer not null,
  commodity text not null,
  pickup_window_open text not null,
  pickup_window_close text not null,
  delivery_window_open text not null,
  delivery_window_close text not null,
  transit_time_hours double precision not null,
  traffic_multiplier double precision not null,
  priority text not null,
  rate_per_mile double precision not null,
  total_revenue double precision not null,
  assigned_truck_id text references public.walmart_trucks (truck_id),
  assigned_driver_id text references public.walmart_drivers (driver_id),
  status text not null,
  pairing_candidate_id text references public.walmart_loads (load_id),
  pairing_gap_hours double precision,
  pairing_distance_miles integer,
  domicile_distance_miles integer not null,
  hos_required_hours double precision not null,
  second_truck_cost double precision not null,
  wait_cost_per_hour double precision not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.walmart_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id text not null,
  run_name text not null,
  inputs jsonb not null,
  results jsonb not null,
  baseline_cost double precision not null,
  vetra_cost double precision not null,
  savings double precision not null,
  trucks_saved double precision not null,
  wait_added_hours double precision not null,
  schedule_risk double precision not null,
  pairing_rate double precision,
  drift_miles double precision,
  utilization_pct double precision,
  created_at timestamptz default now()
);

create table if not exists public.walmart_vendor_scorecards (
  id uuid primary key default gen_random_uuid(),
  week_of date not null,
  total_loads integer not null,
  completed_on_time integer not null,
  completed_late integer not null,
  late_pickup integer not null,
  late_delivery integer not null,
  second_truck_deployed integer not null,
  exceptions integer not null,
  completion_rate_pct double precision not null,
  on_time_pickup_pct double precision not null,
  on_time_delivery_pct double precision not null,
  exception_rate_pct double precision not null,
  avg_dwell_time_hours double precision not null,
  missed_pairings integer not null,
  baseline_weekly_cost double precision not null,
  vetra_weekly_cost double precision not null,
  weekly_savings double precision not null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Mock Data
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.walmart_trucks (truck_id, home_dc, equipment_type, capacity_lbs, capacity_cuft, year, mpg, cost_per_mile, status_monday)
values
  ('TRK-0001', 'DC-001', 'Dry Van 53ft', 44000, 2700, 2022, 6.7, 2.05, 'Available'),
  ('TRK-0002', 'DC-002', 'Reefer 53ft', 42500, 2550, 2021, 6.1, 2.35, 'In Maintenance'),
  ('TRK-0003', 'DC-003', 'Flatbed', 48000, 0, 2020, 6.4, 2.18, 'Reserved');

insert into public.walmart_drivers (driver_id, name, home_dc, assigned_truck_id, schedule_type, hos_cycle, hos_available_monday, start_time_policy, static_start_time, experience_years, endorsements, days_from_home_mon, week_miles_target)
values
  ('DRV-0001', 'Marcus Webb', 'DC-001', 'TRK-0001', '5-day', '70hr/8day', 9.5, 'Rolling', null, 12, array['Hazmat'], 0, 2500),
  ('DRV-0002', 'Sofia Ruiz', 'DC-002', 'TRK-0002', '4-day', '60hr/7day', 7.0, 'Static-0600', '06:00', 8, array[]::text[], 0, 2100),
  ('DRV-0003', 'Andre Morris', 'DC-003', 'TRK-0003', 'Regional', '70hr/8day', 10.0, 'Static-0800', '08:00', 15, array['Doubles'], 0, 1800);

insert into public.walmart_scenarios (scenario_id, name, problem_type, description, loads_affected, baseline_cost, vetra_cost, savings, savings_pct, primary_lever, kpis, confidence, recommended_for)
values
  ('SCN-01', 'Tight Window Rejection — Dallas Hub', 'P1', 'Tight window rejection demo', 480, 314736, 197760, 116976, 37.2, 'Wait tolerance relaxation', '{"trucksSaved":4,"milesSaved":1200,"waitAddedHours":45,"riskDeltaPp":-2}', 'High', 'Cost-sensitive lanes'),
  ('SCN-02', 'Double-Drop Opportunity — Memphis Corridor', 'P1', 'Return load pairing demo', 420, 52400, 21200, 31200, 59.5, 'Return load pairing', '{"trucksSaved":6,"milesSaved":900,"waitAddedHours":12,"riskDeltaPp":-1}', 'High', 'Backhaul-heavy corridors');

insert into public.walmart_loads (
  load_id, scenario_id, day_of_week, day_of_week_index, origin_city, destination_city, corridor,
  distance_miles, equipment_required, weight_lbs, commodity,
  pickup_window_open, pickup_window_close, delivery_window_open, delivery_window_close,
  transit_time_hours, traffic_multiplier, priority, rate_per_mile, total_revenue,
  assigned_truck_id, assigned_driver_id, status, pairing_candidate_id, pairing_gap_hours,
  pairing_distance_miles, domicile_distance_miles, hos_required_hours, second_truck_cost, wait_cost_per_hour
)
values
  ('LD-00001', 'SCN-01', 'Monday', 1, 'Dallas, TX', 'Memphis, TN', 'Dallas, TX → Memphis, TN', 452, 'Dry Van 53ft', 38000, 'General Merchandise',
   '08:00', '10:00', '17:00', '19:00', 9.2, 1.15, 'Standard', 3.10, 1401.2, 'TRK-0001', 'DRV-0001', 'Completed On Time', null, null, null, 220, 10.7, 1220.0, 62.0),
  ('LD-00002', 'SCN-01', 'Tuesday', 2, 'Memphis, TN', 'Atlanta, GA', 'Memphis, TN → Atlanta, GA', 393, 'Reefer 53ft', 32000, 'Grocery/Perishable',
   '06:00', '08:00', '14:00', '16:00', 7.5, 1.0, 'High', 3.45, 1354.0, 'TRK-0002', 'DRV-0002', 'In Transit', 'LD-00003', 2.1, 40, 310, 9.0, 1210.0, 70.0),
  ('LD-00003', 'SCN-02', 'Wednesday', 3, 'Chicago, IL', 'Kansas City, MO', 'Chicago, IL → Kansas City, MO', 502, 'Flatbed', 41000, 'Building Materials',
   '07:00', '09:00', '18:00', '20:00', 10.4, 1.0, 'Critical', 2.95, 1480.0, 'TRK-0003', 'DRV-0003', 'Pending Pickup', null, null, null, 480, 11.9, 1250.0, 75.0);

insert into public.walmart_vendor_scorecards (
  week_of, total_loads, completed_on_time, completed_late, late_pickup, late_delivery,
  second_truck_deployed, exceptions, completion_rate_pct, on_time_pickup_pct, on_time_delivery_pct,
  exception_rate_pct, avg_dwell_time_hours, missed_pairings, baseline_weekly_cost, vetra_weekly_cost, weekly_savings
)
values
  ('2025-03-03', 10000, 4200, 1200, 800, 700, 500, 300, 42.0, 89.0, 88.0, 8.0, 2.4, 500, 482000, 398000, 84000);
