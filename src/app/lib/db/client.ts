// src/app/lib/db/client.ts
// Supabase admin client — server-side only

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const columnStyle = (process.env.SUPABASE_COLUMN_STYLE || "snake").toLowerCase();
const col = (camel: string, snake: string) =>
  columnStyle === "camel" ? camel : snake;

export const TABLES = {
  drivers: process.env.SUPABASE_TABLE_DRIVERS || "walmart_drivers",
  trucks: process.env.SUPABASE_TABLE_TRUCKS || "walmart_trucks",
  loads: process.env.SUPABASE_TABLE_LOADS || "walmart_loads",
  scenarios: process.env.SUPABASE_TABLE_SCENARIOS || "walmart_scenarios",
  simulationRuns:
    process.env.SUPABASE_TABLE_SIMULATION_RUNS || "walmart_simulation_runs",
  vendorScorecards:
    process.env.SUPABASE_TABLE_VENDOR_SCORECARDS || "walmart_vendor_scorecards",
};

export const COLUMNS = {
  drivers: {
    driverId: col("driverId", "driver_id"),
    assignedTruckId: col("assignedTruckId", "assigned_truck_id"),
    homeDc: col("homeDc", "home_dc"),
    startTimePolicy: col("startTimePolicy", "start_time_policy"),
    scheduleType: col("scheduleType", "schedule_type"),
    hosCycle: col("hosCycle", "hos_cycle"),
    name: col("name", "name"),
  },
  trucks: {
    truckId: col("truckId", "truck_id"),
    equipmentType: col("equipmentType", "equipment_type"),
    statusMonday: col("statusMonday", "status_monday"),
    homeDc: col("homeDc", "home_dc"),
  },
  loads: {
    loadId: col("loadId", "load_id"),
    scenarioId: col("scenarioId", "scenario_id"),
    dayOfWeek: col("dayOfWeek", "day_of_week"),
    originCity: col("originCity", "origin_city"),
    destinationCity: col("destinationCity", "destination_city"),
    corridor: col("corridor", "corridor"),
    distanceMiles: col("distanceMiles", "distance_miles"),
    equipmentRequired: col("equipmentRequired", "equipment_required"),
    weightLbs: col("weightLbs", "weight_lbs"),
    commodity: col("commodity", "commodity"),
    pickupWindowOpen: col("pickupWindowOpen", "pickup_window_open"),
    pickupWindowClose: col("pickupWindowClose", "pickup_window_close"),
    deliveryWindowOpen: col("deliveryWindowOpen", "delivery_window_open"),
    deliveryWindowClose: col("deliveryWindowClose", "delivery_window_close"),
    transitTimeHours: col("transitTimeHours", "transit_time_hours"),
    priority: col("priority", "priority"),
    ratePerMile: col("ratePerMile", "rate_per_mile"),
    totalRevenue: col("totalRevenue", "total_revenue"),
    assignedTruckId: col("assignedTruckId", "assigned_truck_id"),
    assignedDriverId: col("assignedDriverId", "assigned_driver_id"),
    status: col("status", "status"),
    pairingCandidateId: col("pairingCandidateId", "pairing_candidate_id"),
    pairingGapHours: col("pairingGapHours", "pairing_gap_hours"),
    pairingDistanceMiles: col("pairingDistanceMiles", "pairing_distance_miles"),
    domicileDistanceMiles: col("domicileDistanceMiles", "domicile_distance_miles"),
    hosRequiredHours: col("hosRequiredHours", "hos_required_hours"),
    secondTruckCost: col("secondTruckCost", "second_truck_cost"),
    waitCostPerHour: col("waitCostPerHour", "wait_cost_per_hour"),
  },
  scenarios: {
    scenarioId: col("scenarioId", "scenario_id"),
    problemType: col("problemType", "problem_type"),
    name: col("name", "name"),
    loadsAffected: col("loadsAffected", "loads_affected"),
  },
  simulationRuns: {
    scenarioId: col("scenarioId", "scenario_id"),
    runName: col("runName", "run_name"),
    inputs: col("inputs", "inputs"),
    results: col("results", "results"),
    baselineCost: col("baselineCost", "baseline_cost"),
    vetraCost: col("vetraCost", "vetra_cost"),
    savings: col("savings", "savings"),
    trucksSaved: col("trucksSaved", "trucks_saved"),
    waitAddedHours: col("waitAddedHours", "wait_added_hours"),
    scheduleRisk: col("scheduleRisk", "schedule_risk"),
    pairingRate: col("pairingRate", "pairing_rate"),
    driftMiles: col("driftMiles", "drift_miles"),
    utilizationPct: col("utilizationPct", "utilization_pct"),
  },
  vendorScorecards: {
    weekOf: col("weekOf", "week_of"),
  },
};
