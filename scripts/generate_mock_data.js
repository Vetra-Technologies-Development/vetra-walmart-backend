#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Simple mock data generator for trucks, drivers, and loads
// Produces: mock_data/gen_trucks.json, mock_data/gen_drivers.json, mock_data/gen_loads.json

const OUT = path.join(__dirname, '..', 'mock_data');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function pad(prefix, n, digits) {
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

// Load Walmart DC CSV if present (use Store # + City as DC id), otherwise fallback to placeholder DCs
const DC_CSV_PATH = path.join(__dirname, '..', 'Walmart DC - Sheet1.csv');
let DCs = [];
if (fs.existsSync(DC_CSV_PATH)) {
  const raw = fs.readFileSync(DC_CSV_PATH, 'utf8');
  const rows = raw.split(/\r?\n/).map(r => r.split(','));
  // find header row index
  const headerIdx = rows.findIndex(r => r[0] && r[0].toLowerCase().includes('store'));
  if (headerIdx >= 0) {
    const header = rows[headerIdx].map(h => (h||'').trim());
    const colIndex = (name) => header.findIndex(h => h.toLowerCase().includes(name));
    const idxStore = colIndex('store');
    const idxAddr1 = colIndex('address line 1');
    const idxCity = colIndex('city');
    const idxState = colIndex('state');
    const seen = new Map();
    for (let i = headerIdx+1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 4) continue;
      const store = (r[idxStore] || '').trim();
      const addr = (r[idxAddr1] || '').trim();
      const city = (r[idxCity] || '').trim();
      const state = (r[idxState] || '').trim();
      if (!store) continue;
      const key = store;
      if (!seen.has(key)) {
        const id = `WDC-${String(store).padStart(4,'0')}`;
        seen.set(key, { id, store, addr, city, state });
      }
    }
    DCs = Array.from(seen.values()).map(d => d.id);
  }
}
if (!DCs.length) {
  DCs = Array.from({ length: 20 }, (_, i) => `DC-${String(i+1).padStart(3,'0')}`);
}



function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RNG seed and global counts
const SEED = 42;
const TRUCK_COUNT = 5000;
const DRIVER_COUNT = 5000;
const LOAD_COUNT = 10000;
const OUTPUT_DIR = path.join(__dirname, '..', 'mock_data');

const rand = mulberry32(SEED);

function randFloat(min, max) {
  return rand() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(randFloat(min, max + 1));
}

function weightedPick(items) {
  const r = rand();
  let sum = 0;
  for (const it of items) {
    sum += it.weight;
    if (r <= sum) return it.value;
  }
  return items[items.length - 1].value;
}

function normalClamp(mean, sd, min, max) {
  // Box-Muller
  const u = 1 - rand();
  const v = 1 - rand();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const val = mean + z * sd;
  return Math.max(min, Math.min(max, val));
}

function padId(prefix, n, width) {
  return prefix + String(n).padStart(width, "0");
}

const HOME_DCS = [
  { id: "DC-001", city: "Searcy, AR", weight: 0.2 },
  { id: "DC-002", city: "Brookhaven, MS", weight: 0.1 },
  { id: "DC-003", city: "Clarksville, AR", weight: 0.12 },
  { id: "DC-004", city: "Palestine, TX", weight: 0.15 },
  { id: "DC-005", city: "Marcy, NY", weight: 0.05 },
  { id: "DC-006", city: "Shelby, NC", weight: 0.07 },
  { id: "DC-007", city: "Midlothian, TX", weight: 0.18 },
  { id: "DC-008", city: "New Braunfels, TX", weight: 0.08 },
  { id: "DC-009", city: "Tobyhanna, PA", weight: 0.03 },
  { id: "DC-010", city: "Loveland, CO", weight: 0.02 },
];

const CORRIDORS = [
  ["Dallas, TX", "Memphis, TN", 452],
  ["Memphis, TN", "Atlanta, GA", 393],
  ["Chicago, IL", "Kansas City, MO", 502],
  ["Houston, TX", "Dallas, TX", 239],
  ["Nashville, TN", "Memphis, TN", 211],
  ["St. Louis, MO", "Chicago, IL", 297],
  ["Atlanta, GA", "Nashville, TN", 248],
  ["Kansas City, MO", "St. Louis, MO", 249],
  ["Dallas, TX", "Houston, TX", 239],
  ["Memphis, TN", "Nashville, TN", 211],
  ["Chicago, IL", "St. Louis, MO", 297],
  ["Atlanta, GA", "Memphis, TN", 393],
  ["Houston, TX", "San Antonio, TX", 197],
  ["San Antonio, TX", "Dallas, TX", 274],
  ["Memphis, TN", "Little Rock, AR", 137],
  ["Little Rock, AR", "Dallas, TX", 319],
  ["Nashville, TN", "Atlanta, GA", 248],
  ["Chicago, IL", "Indianapolis, IN", 181],
  ["Indianapolis, IN", "Cincinnati, OH", 111],
  ["Cincinnati, OH", "Columbus, OH", 107],
  ["Columbus, OH", "Pittsburgh, PA", 185],
  ["Pittsburgh, PA", "Philadelphia, PA", 304],
  ["Philadelphia, PA", "New York, NY", 95],
  ["Kansas City, MO", "Wichita, KS", 197],
  ["Wichita, KS", "Oklahoma City, OK", 159],
  ["Oklahoma City, OK", "Dallas, TX", 207],
  ["Dallas, TX", "Shreveport, LA", 191],
  ["Shreveport, LA", "New Orleans, LA", 334],
  ["New Orleans, LA", "Jackson, MS", 187],
  ["Jackson, MS", "Memphis, TN", 210],
  ["Memphis, TN", "Louisville, KY", 397],
  ["Louisville, KY", "Cincinnati, OH", 100],
  ["Cincinnati, OH", "Cleveland, OH", 244],
  ["Cleveland, OH", "Detroit, MI", 170],
  ["Detroit, MI", "Chicago, IL", 281],
  ["Chicago, IL", "Milwaukee, WI", 92],
  ["Milwaukee, WI", "Minneapolis, MN", 337],
  ["Minneapolis, MN", "Des Moines, IA", 245],
  ["Des Moines, IA", "Kansas City, MO", 193],
  ["Kansas City, MO", "Omaha, NE", 187],
  ["Omaha, NE", "Denver, CO", 537],
  ["Denver, CO", "Albuquerque, NM", 449],
  ["Albuquerque, NM", "El Paso, TX", 267],
  ["El Paso, TX", "San Antonio, TX", 550],
  ["San Antonio, TX", "Houston, TX", 197],
  ["Houston, TX", "Baton Rouge, LA", 268],
  ["Baton Rouge, LA", "New Orleans, LA", 81],
  ["Atlanta, GA", "Charlotte, NC", 245],
  ["Charlotte, NC", "Raleigh, NC", 162],
  ["Raleigh, NC", "Richmond, VA", 158],
];

const FIRST_NAMES = [
  "Marcus","Lena","Terrance","Sofia","James","Nina","DeShawn","Priya","Carlos",
  "Aisha","Brandon","Rosa","Kevin","Fatima","Derek","Mei","Andre","Jennifer",
  "Tyrone","Elena","Miguel","Sarah","Darnell","Lisa","Roberto","Karen","Antoine",
  "Diane","Jamal","Christine","Emmanuel","Brenda","Travis","Yolanda","Russell",
  "Patricia","Hassan","Noah","Maria","Isabel","Omar","Lakshmi","Ravi","Anita",
  "Alejandro","Daniela","Jorge","Monica","Evelyn","Gabriel","Kendra","Malik"
];

const LAST_NAMES = [
  "Webb","Park","Hill","Ruiz","Okafor","Kowalski","Morris","Mehta","Garcia","Johnson",
  "Williams","Brown","Jones","Davis","Miller","Wilson","Moore","Taylor","Anderson",
  "Thomas","Jackson","White","Harris","Martin","Thompson","Lewis","Robinson","Walker",
  "Perez","Hall","Young","Allen","Sanchez","Wright","King","Scott","Hernandez",
  "Ramirez","Patel","Singh","Khan","Nguyen","Lopez","Gonzalez","Carter","Bailey"
];

const EQUIPMENT = [
  { type: "Dry Van 53ft", weight: 0.60, capLbs: 44000, capCuft: 2700, mpgMin: 6.2, mpgMax: 7.1 },
  { type: "Reefer 53ft", weight: 0.25, capLbs: 42500, capCuft: 2550, mpgMin: 5.8, mpgMax: 6.6 },
  { type: "Flatbed", weight: 0.15, capLbs: 48000, capCuft: 0, mpgMin: 6.0, mpgMax: 6.9 },
];

const DRIVER_SCHEDULE = [
  { value: "5-day", weight: 0.55 },
  { value: "4-day", weight: 0.25 },
  { value: "Regional", weight: 0.20 },
];

const HOS_CYCLE = [
  { value: "70hr/8day", weight: 0.70 },
  { value: "60hr/7day", weight: 0.30 },
];

const START_POLICY = [
  { value: "Rolling", weight: 0.50 },
  { value: "Static-0600", weight: 0.30 },
  { value: "Static-0800", weight: 0.20 },
];

const COMMODITIES = [
  { value: "General Merchandise", weight: 0.40 },
  { value: "Grocery/Perishable", weight: 0.20 },
  { value: "Automotive Parts", weight: 0.10 },
  { value: "Electronics", weight: 0.10 },
  { value: "Building Materials", weight: 0.08 },
  { value: "Apparel", weight: 0.07 },
  { value: "Hazmat Class 3", weight: 0.05 },
];

const STATUS = [
  { value: "Completed On Time", weight: 0.42 },
  { value: "Completed Late", weight: 0.12 },
  { value: "In Transit", weight: 0.15 },
  { value: "Pending Pickup", weight: 0.11 },
  { value: "Missed Pairing", weight: 0.08 },
  { value: "Second Truck Deployed", weight: 0.05 },
  { value: "Domicile Drift Risk", weight: 0.04 },
  { value: "HOS Violation Risk", weight: 0.03 },
];

const DAY_DIST = [
  { value: "Monday", weight: 0.22 },
  { value: "Tuesday", weight: 0.21 },
  { value: "Wednesday", weight: 0.20 },
  { value: "Thursday", weight: 0.20 },
  { value: "Friday", weight: 0.17 },
];

const SCENARIO_DEFS = [
  { id: "SCN-01", name: "Tight Window Rejection — Dallas Hub", problem: "P1",
    description: "Loads where delivery completes 06:00-09:00 in Dallas TX, and a pickup is available 09:30-13:00 within 40 miles. System rejects pairing due to <3h gap policy. Pairing gap: 0.5–2.5h. Baseline: 2nd truck deployed. Vetra: wait & pair saves $1,840/event avg.",
    loads: 480, lever: "Wait tolerance relaxation", confidence: "High", recommended: "Cost-sensitive lanes with short delivery-pickup gaps" },
  { id: "SCN-02", name: "Double-Drop Opportunity — Memphis Corridor", problem: "P1",
    description: "Outbound Memphis→Atlanta delivery finishes by 14:00. Return Memphis pickup opens 16:00 same day. Gap: 2h. Distance to pickup: 8 miles. Baseline cost: $52,400 extra trucks. Vetra saves: $31,200 weekly.",
    loads: 420, lever: "Return load pairing", confidence: "High", recommended: "Backhaul-heavy corridors" },
  { id: "SCN-03", name: "Cross-Dock Near-Miss — Chicago", problem: "P1",
    description: "Chicago cross-dock has morning delivery (07:00-10:00) and afternoon pickup (13:00-16:00) at same facility. System treats as separate due to driver reassignment logic. Vetra pairs 78% of these. Saves $890/event.",
    loads: 390, lever: "Same-driver dwell policy", confidence: "High", recommended: "Cross-dock facilities with AM delivery / PM pickup" },
  { id: "SCN-04", name: "High-Gap Pairing — Nashville to Atlanta", problem: "P1",
    description: "4h gap between Nashville delivery and Atlanta pickup. Current policy: max 2h wait. At $65/hr wait cost vs $2.10/mi second truck: Vetra shows waiting is optimal for 71% of cases.",
    loads: 350, lever: "Break-even wait calculation", confidence: "High", recommended: "Lanes where breakEven > 4h gap (most 200–400mi lanes)" },
  { id: "SCN-05", name: "Multi-Stop Cascade Failure", problem: "P1",
    description: "Driver has 3 sequential stops. Second stop delay causes third stop pairing to be rejected by downstream scheduler. Cascade recovery saves $2,100/driver/week.",
    loads: 510, lever: "Dynamic window flex", confidence: "Medium", recommended: "Multi-stop routes with tight sequential windows" },
  { id: "SCN-06", name: "Reefer Pairing Constraint", problem: "P1",
    description: "Reefer loads have stricter wait tolerance (temp-sensitive). Pairing possible only within 1.5h gap. Vetra identifies 45% of reefer loads still safely pairable.",
    loads: 290, lever: "Temp-aware dwell ceiling", confidence: "Medium", recommended: "Reefer loads with gap ≤ 1.5h" },
  { id: "SCN-07", name: "Weekend Carry-Over Pairing", problem: "P1",
    description: "Friday delivery at 16:00 with Monday pickup at 07:00 same region. Current system sends new driver Monday. Vetra shows same driver feasible in 58% of cases, saves $1,650/event.",
    loads: 260, lever: "34h restart utilization", confidence: "High", recommended: "Friday delivery + Monday pickup same region" },
  { id: "SCN-08", name: "Flatbed Window Mismatch", problem: "P1",
    description: "Flatbed pickups require facility dock crew (rigid 08:00-11:00 window). Delivery finishes at 07:30 nearby. Gap: 30 min – 3.5h. Pairing feasible for 62% when wait tolerance relaxed by 1h.",
    loads: 310, lever: "+1h wait tolerance", confidence: "Medium", recommended: "Flatbed loads near 08:00 dock-open facilities" },
  { id: "SCN-09", name: "Weak Pull — Revenue Max Early Week", problem: "P2",
    description: "Drivers accept loads without domicile consideration Mon-Tue. By Wednesday avg driver is 520mi from home. Repositioning cost Thu-Fri: $4,200/driver avg. 20 drivers at risk of failing return by Friday.",
    loads: 480, lever: "Domicile pull weighting", confidence: "Medium", recommended: "High-revenue distant loads Mon-Tue with moderate correction" },
  { id: "SCN-10", name: "Strong Pull — Conservative Routing", problem: "P2",
    description: "Domicile penalty applied from Day 1. Drivers stay within 250mi of home all week. Revenue opportunity cost: $3,100/driver/week vs weak pull. Tradeoff: miss 12% of high-revenue distant loads.",
    loads: 440, lever: "Return guarantee", confidence: "High", recommended: "SLA-critical lanes requiring guaranteed Friday return" },
  { id: "SCN-11", name: "Mid-Week Drift Cascade", problem: "P2",
    description: "Tuesday load takes driver 380mi from home (acceptable). Wednesday load compounds to 610mi (at risk). Thursday: no loads available returning toward home. Driver deadheads 590mi Friday. Cost: $1,238 empty miles.",
    loads: 370, lever: "Early intervention reroute", confidence: "High", recommended: "5-day horizon planning on 300mi+ lanes" },
  { id: "SCN-12", name: "Regional Cluster — Moderate Pull", problem: "P2",
    description: "Drivers operating in tight regional cluster (within 200mi radius). Domicile pull is naturally satisfied by freight availability. Benchmark: near-zero repositioning cost.",
    loads: 520, lever: "Natural freight availability", confidence: "High", recommended: "Baseline reference for regional operations" },
  { id: "SCN-13", name: "Multi-Driver Domicile Conflict", problem: "P2",
    description: "3+ drivers from same DC all drift away mid-week. No loads available returning to DC-001 Thursday. System must decide: deadhead some, delay others, or reassign. Tests fleet-level vs individual optimization.",
    loads: 330, lever: "Driver staggering across week", confidence: "Medium", recommended: "DCs with 3+ drivers competing for same return lanes" },
  { id: "SCN-14", name: "5-Day Horizon Planning vs 2-Day", problem: "P2",
    description: "Same set of loads planned with 48h horizon vs 5-day horizon. 5-day horizon allows early domicile correction on Day 2. 48h horizon misses opportunity, forces expensive Day 4 correction.",
    loads: 410, lever: "Horizon extension to 5 days", confidence: "High", recommended: "Any operation currently using ≤48h planning window" },
  { id: "SCN-15", name: "Rolling Clock — Peak Hour Alignment Failure", problem: "P3",
    description: "Drivers on rolling HOS naturally arrive at peak congestion windows (Chicago 07:00-09:00, Atlanta 07:30-09:30, Dallas 07:00-09:00). Static start at 06:00 avoids peak for 73% of these lanes.",
    loads: 460, lever: "Static 06:00 start", confidence: "High", recommended: "Urban corridors: Chicago, Atlanta, Dallas AM delivery" },
  { id: "SCN-16", name: "Static Start — HOS Waste Early Week", problem: "P3",
    description: "Static 06:00 start Mon means driver exhausts HOS by 17:00. Rolling start same driver could legally run until 20:00. Lost utilization: 2.8h/driver on Mondays. Utilization cost: $3,400/week fleet-wide.",
    loads: 390, lever: "Rolling clock adoption", confidence: "High", recommended: "Long-haul drivers where HOS maximization > predictability" },
  { id: "SCN-17", name: "Hybrid Policy — Regional Segmentation", problem: "P3",
    description: "Rolling for long-haul (>350mi) lanes. Static for regional (<200mi) lanes. Result: 94% window alignment on regional, 89% utilization on long-haul. Benchmark: best of both policies.",
    loads: 500, lever: "Policy segmentation by lane", confidence: "High", recommended: "Mixed fleets with both regional and long-haul lanes" },
  { id: "SCN-18", name: "Static Start — Predictability Premium", problem: "P3",
    description: "Receivers (Walmart DCs) prefer 06:00 static arrivals for dock planning. Static policy reduces receiver wait time by 42 min avg. Service reliability gain: +11pp vs rolling. Cost: -$2,800/week utilization loss. Net: favorable for high-SLA lanes.",
    loads: 420, lever: "Receiver dock alignment", confidence: "High", recommended: "High-SLA lanes where receiver wait is contractual" },
  { id: "SCN-19", name: "Rolling Clock Drift — Late Week HOS Crunch", problem: "P3",
    description: "Rolling drivers who ran hard Mon-Tue face HOS limits Thu afternoon. Cannot complete Friday loads. 23 loads require reassignment. Static policy eliminates this in 81% of cases.",
    loads: 350, lever: "Static policy adoption", confidence: "High", recommended: "Drivers who run hard Mon-Tue, need Friday availability" },
  { id: "SCN-20", name: "Combined Policy Test — All Three Problems Active", problem: "Combined",
    description: "Loads that simultaneously involve: a missed pairing opportunity (P1), a driver more than 300mi from home (P2), and a start-time policy conflict (P3). Tests interaction effects across all three problem types.",
    loads: 380, lever: "Unified cross-problem optimizer", confidence: "Medium", recommended: "Full fleet deployment — maximum Vetra impact" },
];

function scaleScenarioCounts(defs, total) {
  const baseSum = defs.reduce((a, d) => a + d.loads, 0);
  const scaled = defs.map(d => ({ ...d, loads: Math.round(d.loads * total / baseSum) }));
  let scaledSum = scaled.reduce((a, d) => a + d.loads, 0);
  let diff = total - scaledSum;
  let idx = 0;
  while (diff !== 0) {
    scaled[idx % scaled.length].loads += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    idx++;
  }
  return scaled;
}

function timeStr(hourFloat) {
  let h = Math.floor(hourFloat);
  let m = Math.round((hourFloat - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  h = ((h % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function trafficMultiplier(day, pickupHour, corridorText) {
  const urban = ["Chicago", "Atlanta", "Dallas"].some(c => corridorText.includes(c));
  if (urban) return 1.35;
  if (day === "Monday" && pickupHour >= 6 && pickupHour <= 9) return 1.15;
  if (day === "Friday" && pickupHour >= 14 && pickupHour <= 18) return 1.25;
  return 1.0;
}

function pickDay() {
  return weightedPick(DAY_DIST.map(d => ({ value: d.value, weight: d.weight })));
}

function dayIndex(day) {
  return ["Monday","Tuesday","Wednesday","Thursday","Friday"].indexOf(day) + 1;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(OUTPUT_DIR);

  // Trucks
  const trucks = [];
  for (let i = 1; i <= TRUCK_COUNT; i++) {
    const equipType = weightedPick(EQUIPMENT.map(e => ({ value: e.type, weight: e.weight })));
    const equip = EQUIPMENT.find(e => e.type === equipType);
    const homeDc = weightedPick(HOME_DCS.map(d => ({ value: d.id, weight: d.weight })));
    const year = randInt(2018, 2024);
    const mpg = +randFloat(equip.mpgMin, equip.mpgMax).toFixed(2);
    const costBase = equipType === "Reefer 53ft" ? 2.1 : equipType === "Flatbed" ? 2.0 : 1.9;
    const yearAdj = (year - 2018) * 0.03;
    const costPerMile = +Math.min(2.34, Math.max(1.82, costBase + yearAdj + randFloat(-0.08, 0.08))).toFixed(2);
    const status = weightedPick([
      { value: "Available", weight: 0.85 },
      { value: "In Maintenance", weight: 0.08 },
      { value: "Reserved", weight: 0.07 },
    ]);
    trucks.push({
      truck_id: padId("TRK-", i, 4),
      home_dc: homeDc,
      equipment_type: equipType,
      capacity_lbs: equip.capLbs,
      capacity_cuft: equip.capCuft,
      year,
      mpg,
      cost_per_mile: costPerMile,
      assigned_driver: padId("DRV-", i, 4),
      status_monday: status,
    });
  }

  // Drivers
  const drivers = [];
  for (let i = 1; i <= DRIVER_COUNT; i++) {
    const truck = trucks[i - 1];
    const scheduleType = weightedPick(DRIVER_SCHEDULE);
    const hosCycle = weightedPick(HOS_CYCLE);
    const startPolicy = weightedPick(START_POLICY);
    const staticStart = startPolicy === "Rolling" ? null : (startPolicy === "Static-0600" ? "06:00" : "08:00");
    const endorsementRoll = rand();
    let endorsements = [];
    if (endorsementRoll < 0.15) endorsements = ["Hazmat"];
    else if (endorsementRoll < 0.35) endorsements = ["Doubles"];
    const weekMilesTarget = scheduleType === "5-day"
      ? randInt(2200, 2800)
      : scheduleType === "4-day"
        ? randInt(1800, 2400)
        : randInt(2000, 2600);
    drivers.push({
      driver_id: padId("DRV-", i, 4),
      name: `${FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]}`,
      home_dc: truck.home_dc,
      assigned_truck: truck.truck_id,
      schedule_type: scheduleType,
      hos_cycle: hosCycle,
      hos_available_monday: +randFloat(4.0, 11.0).toFixed(1),
      start_time_policy: startPolicy,
      static_start_time: staticStart,
      experience_years: randInt(1, 25),
      endorsements,
      days_from_home_mon: 0,
      week_miles_target: weekMilesTarget,
    });
  }

  // Scenarios (scaled to 10,000 total)
  const scenariosScaled = scaleScenarioCounts(SCENARIO_DEFS, LOAD_COUNT);
  const scenarios = scenariosScaled.map(s => {
    const baseline = +(s.loads * randFloat(240, 420)).toFixed(2);
    const savings = +(baseline * randFloat(0.22, 0.58)).toFixed(2);
    const vetra = +(baseline - savings).toFixed(2);
    const savingsPct = +((savings / baseline) * 100).toFixed(1);
    return {
      scenario_id: s.id,
      name: s.name,
      problem_type: s.problem,
      description: s.description,
      loads_affected: s.loads,
      baseline_cost: baseline,
      vetra_cost: vetra,
      savings,
      savings_pct: savingsPct,
      primary_lever: s.lever,
      kpis: {
        trucks_saved: randInt(10, 60),
        miles_saved: randInt(500, 5000),
        wait_added_hours: +randFloat(50, 240).toFixed(1),
        risk_delta_pp: +randFloat(-6, 2).toFixed(1),
        second_trucks_eliminated: randInt(5, 80),
        drivers_returned_home: randInt(5, 45),
        utilization_gain_pct: +randFloat(-4, 9).toFixed(1),
      },
      confidence: s.confidence,
      recommended_for: s.recommended,
    };
  });

  // Precompute driver hours
  const driverHours = new Map();
  drivers.forEach(d => {
    driverHours.set(d.driver_id, {
      Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, total: 0
    });
  });

  const loads = [];
  let scenarioIdx = 0;
  let scenarioRemaining = scenariosScaled[0].loads;

  for (let i = 1; i <= LOAD_COUNT; i++) {
    if (scenarioRemaining <= 0) {
      scenarioIdx += 1;
      scenarioRemaining = scenariosScaled[scenarioIdx].loads;
    }
    const scenario = scenariosScaled[scenarioIdx];
    scenarioRemaining -= 1;

    const day = pickDay();
    const dayIdx = dayIndex(day);
    const corridor = CORRIDORS[randInt(0, CORRIDORS.length - 1)];
    const origin = corridor[0];
    const dest = corridor[1];
    const distance = corridor[2];

    const equipmentRequired = weightedPick([
      { value: "Dry Van 53ft", weight: 0.62 },
      { value: "Reefer 53ft", weight: 0.24 },
      { value: "Flatbed", weight: 0.14 },
    ]);

    const equip = EQUIPMENT.find(e => e.type === equipmentRequired);

    let pickupOpen = randInt(5, distance > 400 ? 10 : 14);
    let pickupClose = pickupOpen + randInt(2, 4);
    const traffic = trafficMultiplier(day, pickupOpen, `${origin} ${dest}`);
    let transit = +(distance / 55 * traffic).toFixed(2);
    let buffer = randFloat(0, 2);
    let deliveryOpen = pickupClose + transit + buffer;
    if (deliveryOpen > 22) {
      const shift = Math.min(4, deliveryOpen - 22);
      pickupOpen = Math.max(5, pickupOpen - shift);
      pickupClose = pickupOpen + randInt(2, 4);
      deliveryOpen = pickupClose + transit + buffer;
    }
    const deliveryClose = deliveryOpen + randFloat(2, 4);

    const weight = Math.round(normalClamp(
      equipmentRequired === "Dry Van 53ft" ? 38000 : equipmentRequired === "Reefer 53ft" ? 34000 : 36000,
      equipmentRequired === "Dry Van 53ft" ? 4500 : equipmentRequired === "Reefer 53ft" ? 5000 : 6000,
      equipmentRequired === "Dry Van 53ft" ? 28000 : equipmentRequired === "Reefer 53ft" ? 22000 : 18000,
      equip.capLbs
    ));

    const commodity = weightedPick(COMMODITIES);
    const priority = weightedPick([
      { value: "Standard", weight: 0.70 },
      { value: "High", weight: 0.20 },
      { value: "Critical", weight: 0.10 },
    ]);

    const rateBase = equipmentRequired === "Reefer 53ft" ? 3.0 : equipmentRequired === "Flatbed" ? 2.9 : 2.7;
    const priorityAdj = priority === "Critical" ? 0.6 : priority === "High" ? 0.25 : 0.0;
    const ratePerMile = +Math.min(4.2, Math.max(2.45, rateBase + priorityAdj + randFloat(-0.15, 0.35))).toFixed(2);
    const totalRevenue = +(distance * ratePerMile).toFixed(2);

    const hosRequired = +(transit + 1.5).toFixed(2);
    const waitCostPerHour = +randFloat(45, 85).toFixed(2);

    // Assign truck/driver (85% target, if feasible)
    let assignedTruck = null;
    let assignedDriver = null;
    let costPerMile = equip.type === "Reefer 53ft" ? 2.25 : equip.type === "Flatbed" ? 2.1 : 2.0;

    if (rand() < 0.85) {
      let tries = 0;
      while (tries < 25) {
        const truck = trucks[randInt(0, trucks.length - 1)];
        if (truck.equipment_type !== equipmentRequired) { tries++; continue; }
        const driverIdx = parseInt(truck.assigned_driver.split("-")[1], 10) - 1;
        const driver = drivers[driverIdx] || drivers[randInt(0, drivers.length - 1)];
        const hours = driverHours.get(driver.driver_id);
        if (hours[day] + transit <= 11 && hours.total + transit <= 70) {
          assignedTruck = truck.truck_id;
          assignedDriver = driver.driver_id;
          costPerMile = truck.cost_per_mile;
          hours[day] += transit;
          hours.total += transit;
          break;
        }
        tries++;
      }
    }

    const status = weightedPick(STATUS);
    const pairingCandidateId = null;
    const pairingGapHours = null;
    const pairingDistanceMiles = null;
    const domicileDistanceMiles = randInt(50, 650);
    const secondTruckCost = +(costPerMile * distance).toFixed(2);

    loads.push({
      load_id: padId("LD-", i, 5),
      scenario_id: scenario.id,
      day_of_week: day,
      origin_city: origin,
      destination_city: dest,
      corridor: `${origin} → ${dest}`,
      distance_miles: distance,
      equipment_required: equipmentRequired,
      weight_lbs: weight,
      commodity,
      pickup_window_open: timeStr(pickupOpen),
      pickup_window_close: timeStr(pickupClose),
      delivery_window_open: timeStr(deliveryOpen),
      delivery_window_close: timeStr(deliveryClose),
      transit_time_hours: transit,
      traffic_multiplier: +traffic.toFixed(2),
      priority,
      rate_per_mile: ratePerMile,
      total_revenue: totalRevenue,
      assigned_truck: assignedTruck,
      assigned_driver: assignedDriver,
      status,
      pairing_candidate_id: pairingCandidateId,
      pairing_gap_hours: pairingGapHours,
      pairing_distance_miles: pairingDistanceMiles,
      domicile_distance_miles: domicileDistanceMiles,
      day_of_week_index: dayIdx,
      hos_required_hours: hosRequired,
      second_truck_cost: secondTruckCost,
      wait_cost_per_hour: waitCostPerHour,
    });
  }

  // Pairing candidates (30% of loads, within same scenario)
  const loadsByScenario = new Map();
  for (const l of loads) {
    if (!loadsByScenario.has(l.scenario_id)) loadsByScenario.set(l.scenario_id, []);
    loadsByScenario.get(l.scenario_id).push(l);
  }
  for (const [scenarioId, list] of loadsByScenario.entries()) {
    const target = Math.floor(list.length * 0.30);
    const indices = new Set();
    while (indices.size < target) {
      indices.add(randInt(0, list.length - 1));
    }
    for (const idx of indices) {
      const load = list[idx];
      let cand = list[randInt(0, list.length - 1)];
      let safety = 0;
      while (cand.load_id === load.load_id && safety < 10) {
        cand = list[randInt(0, list.length - 1)];
        safety++;
      }
      load.pairing_candidate_id = cand.load_id;
      load.pairing_gap_hours = +randFloat(0.5, 5.0).toFixed(2);
      load.pairing_distance_miles = randInt(5, 85);
    }
  }

  // Write output files
  fs.writeFileSync(path.join(OUTPUT_DIR, "scenarios.json"), JSON.stringify(scenarios, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, "trucks.json"), JSON.stringify(trucks, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, "drivers.json"), JSON.stringify(drivers, null, 2));

  const batchSize = 1000;
  const batchCount = Math.ceil(LOAD_COUNT / batchSize);
  for (let b = 0; b < batchCount; b++) {
    const slice = loads.slice(b * batchSize, (b + 1) * batchSize);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `loads_batch_${b + 1}.json`),
      JSON.stringify(slice, null, 2)
    );
  }

  console.log("Mock data generated in", OUTPUT_DIR);
}

main();
