// src/app/lib/formulas/scenarios.ts
// Vetra x Walmart — 20 Scenario Formula Engine (TypeScript)

export interface SimulationInputs {
  waitToleranceHours:  number;   // 0–6
  pickupFlex:          number;   // 0–4
  deliveryFlex:        number;   // 0–4
  domicilePull:        "weak" | "moderate" | "strong" | "custom";
  startPolicy:         "rolling" | "static" | "hybrid";
  riskMode:            "aggressive" | "balanced" | "conservative";
  planningHorizon:     "24h" | "48h" | "5days";
  trafficMultiplier:   number;   // 1.0 | 1.2 | 1.5
}

export interface ScenarioDelta {
  savings:              number;
  baselineCost:         number;
  vetraCost:            number;
  trucksSaved?:         number;
  waitAddedHours?:      number;
  scheduleRiskDelta?:   number;
  pairingRate?:         string;
  savingsPerEvent?:     number;
  insight?:             string;
  [key: string]:        any;
}

// ─── GLOBAL CONSTANTS ────────────────────────────────────────────────────────
const G = {
  CPM_DRY_VAN:    2.10,
  CPM_REEFER:     2.45,
  CPM_FLATBED:    2.28,
  IDLE_RATE:      65,
  IDLE_REEFER:    85,
  DEADHEAD_CPM:   1.82,
  AVG_SPEED:      55,
  HOS_DAY:        11,
  HOS_CYCLE_70:   70,
  SERVICE_TIME:   1.5,
  TRUCK2_FIXED:   285,
  REVENUE_PER_HR: 176,  // $3.20/mi × 55mph
};

const truck2Cost = (miles: number, cpm = G.CPM_DRY_VAN) =>
  miles * cpm + G.TRUCK2_FIXED;

const waitCost = (hours: number, rate = G.IDLE_RATE) =>
  hours * rate;

const riskAdj = (mode: string, aggressive = 1.10, balanced = 1.0, conservative = 0.85) =>
  mode === "aggressive" ? aggressive : mode === "conservative" ? conservative : balanced;

// ─── PROBLEM 1 — MISSED PAIRINGS ─────────────────────────────────────────────

// SCN-01: Tight Window Rejection — Dallas Hub
function scn01(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 480, AVG_MILES = 452, AVG_GAP = 1.5, AVG_DEADHEAD = 18;
  const timeScore     = Math.min(1, inp.waitToleranceHours / 2.5);
  const distScore     = Math.min(1, 40 / 40); // fixed 40mi radius
  const rate          = Math.min(0.95, timeScore * distScore * 0.71 * riskAdj(inp.riskMode));
  const paired        = Math.round(LOADS * rate);
  const unpaired      = LOADS - paired;
  const baseline      = LOADS * truck2Cost(AVG_MILES);
  const vetra         = paired * waitCost(AVG_GAP)
                      + paired * AVG_DEADHEAD * G.DEADHEAD_CPM
                      + unpaired * truck2Cost(AVG_MILES);
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    trucksSaved:       paired,
    waitAddedHours:    Math.round(paired * AVG_GAP),
    scheduleRiskDelta: +(AVG_GAP * 3.2 * riskAdj(inp.riskMode, 1.4, 1.0, 0.8)).toFixed(1),
    pairingRate:       (rate * 100).toFixed(1) + "%",
    savingsPerEvent:   paired > 0 ? Math.round((baseline - vetra) / paired) : 0,
    breakEvenHours:    +((truck2Cost(AVG_MILES)) / G.IDLE_RATE).toFixed(1),
    insight:           `${paired} of ${LOADS} loads successfully paired — saves $${Math.round((baseline-vetra)/paired).toLocaleString()} per event`,
  };
}

// SCN-02: Double-Drop Opportunity — Memphis Corridor
function scn02(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 420, RTN_MILES = 393, GAP = 2.0, DEADHEAD = 8;
  const toleranceOk = inp.waitToleranceHours >= 2.0 ? 1 : inp.waitToleranceHours / 2.0;
  const rate        = Math.min(0.95, 0.85 * toleranceOk * riskAdj(inp.riskMode, 0.92, 0.85, 0.76));
  const paired      = Math.round(LOADS * rate);
  const unpaired    = LOADS - paired;
  const baseline    = 52400; // from spec
  const vetra       = paired * waitCost(GAP)
                    + paired * DEADHEAD * G.DEADHEAD_CPM
                    + unpaired * truck2Cost(RTN_MILES);
  return {
    savings:          Math.round(baseline - vetra),
    baselineCost:     baseline,
    vetraCost:        Math.round(vetra),
    trucksSaved:      paired,
    waitAddedHours:   Math.round(paired * GAP),
    deadheadMiles:    paired * DEADHEAD,
    utilizationGain:  (rate * 100).toFixed(1) + "%",
    scheduleRiskDelta: +(GAP * 2.1).toFixed(1),
    insight:          `Memphis backhaul: 8mi deadhead + 2h wait vs $${truck2Cost(RTN_MILES).toFixed(0)} second truck on 393mi lane`,
  };
}

// SCN-03: Cross-Dock Near-Miss — Chicago
function scn03(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 390, DISPATCH_COST = 210, AVG_GAP = 4.5, TARGET = 0.78;
  const dwellScore  = Math.min(1, inp.waitToleranceHours / AVG_GAP);
  const rate        = Math.min(TARGET, dwellScore * 0.85 * riskAdj(inp.riskMode, 1.08, 1.0, 0.88));
  const paired      = Math.round(LOADS * rate);
  const unpaired    = LOADS - paired;
  const baseline    = LOADS * DISPATCH_COST;
  const vetra       = paired * waitCost(AVG_GAP) + unpaired * DISPATCH_COST;
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    driverSwapsAvoided:paired,
    dwellHoursAdded:   Math.round(paired * AVG_GAP),
    scheduleRiskDelta: +(AVG_GAP * 1.8).toFixed(1),
    savingsPerEvent:   paired > 0 ? Math.round((baseline - vetra) / paired) : 0,
    insight:           `Same facility — zero deadhead. Keeping same driver eliminates dispatch cost of $${DISPATCH_COST}/event`,
  };
}

// SCN-04: High-Gap Pairing — Nashville to Atlanta
function scn04(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 350, MILES = 248, GAP = 4.0, BASE_PAIR = 0.71;
  const breakEven       = truck2Cost(MILES) / G.IDLE_RATE;
  const toleranceFeas   = inp.waitToleranceHours >= GAP ? 1 : inp.waitToleranceHours / GAP;
  const rate            = Math.min(0.92, BASE_PAIR * toleranceFeas * riskAdj(inp.riskMode, 1.12, 1.0, 0.82));
  const paired          = Math.round(LOADS * rate);
  const unpaired        = LOADS - paired;
  const baseline        = LOADS * truck2Cost(MILES);
  const vetra           = paired * waitCost(GAP) + unpaired * truck2Cost(MILES);
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    trucksSaved:       paired,
    breakEvenHours:    +breakEven.toFixed(1),
    waitVsTruckVerdict:GAP < breakEven ? "WAIT IS CHEAPER" : "TRUCK IS CHEAPER",
    waitCostPerLoad:   Math.round(waitCost(GAP)),
    truckCostPerLoad:  Math.round(truck2Cost(MILES)),
    scheduleRiskDelta: +(GAP * 3.8).toFixed(1),
    insight:           `Break-even at ${breakEven.toFixed(1)}h — 4h gap is well below. Current 2h policy leaves $${Math.round((baseline-vetra)/1000)}K on the table`,
  };
}

// SCN-05: Multi-Stop Cascade Failure
function scn05(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 510, REPOSITION_MILES = 180, STOP2_DELAY = 1.2, BUFFER = 0.15;
  const cascade     = STOP2_DELAY * (1 + BUFFER); // 1.38h
  const baseFail    = cascade >= 1.5 ? 0.52 : 0.30;
  const recovery    = Math.min(0.91, Math.min(1, inp.deliveryFlex / cascade) * 0.88 * riskAdj(inp.riskMode, 1.12, 1.0, 0.82));
  const rejected    = Math.round(LOADS * baseFail);
  const recovered   = Math.round(rejected * recovery);
  const stillFail   = rejected - recovered;
  const baseline    = rejected * truck2Cost(REPOSITION_MILES);
  const vetra       = recovered * waitCost(cascade) + stillFail * truck2Cost(REPOSITION_MILES);
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    cascadeDelayHours: +cascade.toFixed(2),
    loadsRecovered:    recovered,
    trucksSaved:       recovered,
    scheduleRiskDelta: +(cascade * 2.5).toFixed(1),
    insight:           `Cascade: ${STOP2_DELAY}h Stop 2 delay × 1.15 buffer = ${cascade.toFixed(2)}h. Vetra's dynamic window flex recovers ${recovered} loads`,
  };
}

// SCN-06: Reefer Pairing Constraint
function scn06(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 290, MILES = 340, TEMP_DRIFT = 2.3, MAX_DRIFT_F = 4.0, TARGET = 0.45;
  const safeMaxDwell    = MAX_DRIFT_F / TEMP_DRIFT;   // 1.74h
  const effectiveDwell  = Math.min(inp.waitToleranceHours, safeMaxDwell);
  const rate            = Math.min(TARGET, (effectiveDwell / 1.5) * 0.50 * riskAdj(inp.riskMode, 1.08, 1.0, 0.80));
  const paired          = Math.round(LOADS * rate);
  const unpaired        = LOADS - paired;
  const baseline        = LOADS * truck2Cost(MILES, G.CPM_REEFER);
  const vetra           = paired * waitCost(effectiveDwell, G.IDLE_REEFER)
                        + unpaired * truck2Cost(MILES, G.CPM_REEFER);
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    reeferLoadsPaired: paired,
    safeMaxDwellHours: +safeMaxDwell.toFixed(2),
    tempDriftRiskF:    +(inp.waitToleranceHours * TEMP_DRIFT).toFixed(1),
    tempSafetyStatus:  inp.waitToleranceHours * TEMP_DRIFT <= MAX_DRIFT_F ? "WITHIN LIMITS" : "⚠ EXCEEDS THRESHOLD",
    scheduleRiskDelta: +(effectiveDwell * 2.9).toFixed(1),
    insight:           `Temperature ceiling: ${safeMaxDwell.toFixed(2)}h safe dwell. Vetra identifies ${paired} reefer loads safely pairable`,
  };
}

// SCN-07: Weekend Carry-Over Pairing
function scn07(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 260, MILES = 280, DISPATCH = 195, BASE_RATE = 0.58;
  const rate     = Math.min(0.85, BASE_RATE * riskAdj(inp.riskMode, 1.15, 1.0, 0.82));
  const paired   = Math.round(LOADS * rate);
  const unpaired = LOADS - paired;
  const baseline = LOADS * (truck2Cost(MILES) + DISPATCH);
  const vetra    = 0 + unpaired * (truck2Cost(MILES) + DISPATCH); // paired = $0 incremental
  return {
    savings:             Math.round(baseline - vetra),
    baselineCost:        Math.round(baseline),
    vetraCost:           Math.round(vetra),
    carryOverLoads:      paired,
    newDriversAvoided:   paired,
    weekendDispatchSaved:Math.round(paired * DISPATCH),
    scheduleRiskDelta:   2.1,
    insight:             `34h restart resets HOS over weekend at zero incremental cost. ${paired} drivers repositioned for free`,
  };
}

// SCN-08: Flatbed Window Mismatch
function scn08(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 310, MILES = 195, TARGET = 0.62, AVG_GAP = 2.0;
  const toleranceScore = Math.min(1, inp.waitToleranceHours / 1.0);
  const rate           = Math.min(TARGET, toleranceScore * 0.65 * riskAdj(inp.riskMode, 1.10, 1.0, 0.82));
  const paired         = Math.round(LOADS * rate);
  const unpaired       = LOADS - paired;
  const baseline       = LOADS * truck2Cost(MILES, G.CPM_FLATBED);
  const vetra          = paired * waitCost(AVG_GAP) + unpaired * truck2Cost(MILES, G.CPM_FLATBED);
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    flatbedsPaired:    paired,
    dockWaitMin:       Math.round(waitCost(0.5)),
    waitVsTruck:       `$${Math.round(waitCost(AVG_GAP))} wait vs $${Math.round(truck2Cost(MILES, G.CPM_FLATBED))} truck`,
    scheduleRiskDelta: +(AVG_GAP * 2.2).toFixed(1),
    insight:           inp.waitToleranceHours >= 1.0
      ? `+1h tolerance unlocks ${TARGET*100}% of flatbed loads — dock opens 08:00, driver ready 07:30`
      : "Need ≥1h wait tolerance to absorb dock-open gap",
  };
}

// ─── PROBLEM 2 — BUNGEE EFFECT ───────────────────────────────────────────────

const PULL_MAP: Record<string, number> = { weak: 0.5, moderate: 1.0, strong: 2.0, custom: 1.5 };
const driftAtDay = (day: number, pull: string) => {
  let drift = 0;
  const p = PULL_MAP[pull] || 1.0;
  for (let d = 1; d <= day; d++) {
    drift += 280 * (1 / (1 + d * p * 0.18));
  }
  return Math.round(drift);
};
const emptyMiReturn = (endDrift: number, pull: string) => {
  const slack = (PULL_MAP[pull] || 1.0) * 40;
  return Math.max(0, endDrift - 150 - slack);
};

// SCN-09: Weak Pull — Revenue Max Early Week
function scn09(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 480, DRIVERS_AT_RISK = 20, REPOSITION = 4200;
  const profile    = [1,2,3,4,5].map(d => ({
    day:         ["Mon","Tue","Wed","Thu","Fri"][d-1],
    drift:       driftAtDay(d, "weak"),
    emptyMiles:  emptyMiReturn(driftAtDay(d, "weak"), "weak"),
    cost:        Math.round(emptyMiReturn(driftAtDay(d, "weak"), "weak") * G.DEADHEAD_CPM + 3200 + d*280),
    feasibility: driftAtDay(d, "weak") < 600 ? "Feasible" : "At Risk",
  }));
  const baseline   = DRIVERS_AT_RISK * REPOSITION;
  const vetra      = DRIVERS_AT_RISK * emptyMiReturn(driftAtDay(3,"moderate"), "moderate") * G.DEADHEAD_CPM * 0.45;
  return {
    savings:            Math.round(baseline - vetra),
    baselineCost:       baseline,
    vetraCost:          Math.round(vetra),
    weeklyDriftProfile: profile,
    endOfWeekDrift:     driftAtDay(5, "weak"),
    totalEmptyMiles:    emptyMiReturn(driftAtDay(5,"weak"), "weak"),
    driversAtRisk:      DRIVERS_AT_RISK,
    insight:            `Weak pull: end-of-week drift ${driftAtDay(5,"weak")}mi. Vetra switches to moderate pull Tue onward — saves 55% of reposition cost`,
  };
}

// SCN-10: Strong Pull — Conservative Routing
function scn10(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 440, DRIVERS = 50, OPP_COST = 3100;
  const profile = [1,2,3,4,5].map(d => ({
    day:         ["Mon","Tue","Wed","Thu","Fri"][d-1],
    drift:       Math.min(180, driftAtDay(d, "strong")),
    emptyMiles:  0,
    cost:        Math.round(3800 - d*180 + driftAtDay(d,"strong")*0.4),
    feasibility: "Feasible",
  }));
  return {
    savings:           0, // trade-off scenario — not a pure savings story
    baselineCost:      DRIVERS * OPP_COST,
    vetraCost:         0,
    weeklyDriftProfile:profile,
    returnSuccessRate: "100%",
    endOfWeekDrift:    driftAtDay(5,"strong"),
    totalEmptyMiles:   0,
    revenueLost:       DRIVERS * OPP_COST,
    insight:           `Strong pull: zero reposition risk but $${(OPP_COST*DRIVERS).toLocaleString()} in foregone weekly revenue — 12% of distant loads declined`,
  };
}

// SCN-11: Mid-Week Drift Cascade
function scn11(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 370, D2 = 380, D3 = 230, THRESHOLD = 500, EMPTY_COST = 1238;
  const cascade    = D2 + D3; // 610mi — exceeds 500mi threshold
  const driversHit = Math.round(LOADS / 3);
  const baseline   = driversHit * EMPTY_COST;
  const prevented  = inp.planningHorizon === "5days" ? 0.78 : 0.45;
  const vetra      = baseline * (1 - prevented);
  return {
    savings:             Math.round(baseline - vetra),
    baselineCost:        Math.round(baseline),
    vetraCost:           Math.round(vetra),
    compoundDriftMiles:  cascade,
    thresholdBreached:   cascade > THRESHOLD,
    emptyMilesFriday:    590,
    emptyCostPerDriver:  EMPTY_COST,
    preventionRate:      (prevented * 100).toFixed(0) + "%",
    insight:             `Day 2+3 drift: ${cascade}mi exceeds ${THRESHOLD}mi threshold. ${inp.planningHorizon === "5days" ? "5-day" : "48h"} horizon prevents ${(prevented*100).toFixed(0)}% of cascade`,
  };
}

// SCN-12: Regional Cluster Benchmark
function scn12(inp: SimulationInputs): ScenarioDelta {
  const profile = [1,2,3,4,5].map(d => ({
    day:         ["Mon","Tue","Wed","Thu","Fri"][d-1],
    drift:       Math.min(180, driftAtDay(d, "moderate")),
    emptyMiles:  0,
    cost:        3100 + d * 120,
    feasibility: "Feasible",
  }));
  return {
    savings:            0,
    baselineCost:       0,
    vetraCost:          0,
    weeklyDriftProfile: profile,
    repositioningCost:  0,
    returnSuccessRate:  "100%",
    insight:            "Natural freight within 200mi radius — domicile pull barely needed. Benchmark: best efficiency ratio of all P2 scenarios",
  };
}

// SCN-13: Multi-Driver Domicile Conflict
function scn13(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 330, DRIVERS = 3, AVAIL = 0.72, DEADHEAD = 890;
  const conflictProb = 1 - Math.pow(AVAIL, DRIVERS); // 62.7%
  const events       = Math.round(LOADS / DRIVERS);
  const baseline     = events * conflictProb * DEADHEAD;
  const vetraConf    = conflictProb * 0.38; // staggered
  const vetra        = events * vetraConf * DEADHEAD;
  return {
    savings:            Math.round(baseline - vetra),
    baselineCost:       Math.round(baseline),
    vetraCost:          Math.round(vetra),
    conflictProbability:(conflictProb * 100).toFixed(1) + "%",
    staggeredConflict:  (vetraConf * 100).toFixed(1) + "%",
    insight:            `1 - 0.72³ = ${(conflictProb*100).toFixed(1)}% conflict when 3 drivers share DC. Vetra staggers Mon/Wed/Fri returns → ${(vetraConf*100).toFixed(1)}%`,
  };
}

// SCN-14: 5-Day vs 2-Day Planning Horizon
function scn14(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 410, CORRECTION_MILES = 340;
  const detect48h  = 0.31;
  const detect5day = 0.79;
  const detect     = inp.planningHorizon === "5days" ? detect5day : detect48h;
  const affected   = LOADS * 0.35;
  const baseline   = affected * CORRECTION_MILES * G.DEADHEAD_CPM * (1 - detect48h);
  const vetra      = affected * CORRECTION_MILES * G.DEADHEAD_CPM * (1 - detect);
  return {
    savings:           Math.round(baseline - vetra),
    baselineCost:      Math.round(baseline),
    vetraCost:         Math.round(vetra),
    earlyDetectionRate:(detect * 100).toFixed(0) + "%",
    horizon48hDetect:  (detect48h * 100).toFixed(0) + "%",
    horizon5dDetect:   (detect5day * 100).toFixed(0) + "%",
    insight:           inp.planningHorizon === "5days"
      ? "5-day horizon catches drift Day 2, corrects before compounding — 79% detection vs 31% for 48h"
      : "48h horizon misses Day 3 compound drift — forces expensive Day 4 correction",
  };
}

// ─── PROBLEM 3 — ROLLING vs STATIC START ─────────────────────────────────────

// SCN-15: Rolling Clock — Peak Hour Alignment Failure
function scn15(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 460, AVG_TRANSIT = 2.0, DELAY = 0.8, AVOID_RATE = 0.73;
  const rollingStart = 7.5, staticStart = 6.0;
  const rollingArrival = rollingStart + AVG_TRANSIT; // 9.5h — in peak
  const rollingPeakHit = 0.68;
  const staticPeakHit  = 1 - AVOID_RATE;            // 0.27
  const peakHit = inp.startPolicy === "rolling" ? rollingPeakHit
                : inp.startPolicy === "static"  ? staticPeakHit
                : (rollingPeakHit + staticPeakHit) / 2;
  const baseline = LOADS * rollingPeakHit * DELAY * G.IDLE_RATE;
  const vetra    = LOADS * peakHit * DELAY * G.IDLE_RATE;
  return {
    savings:          Math.round(baseline - vetra),
    baselineCost:     Math.round(baseline),
    vetraCost:        Math.round(vetra),
    rollingPeakRate:  (rollingPeakHit * 100).toFixed(0) + "%",
    staticPeakRate:   (staticPeakHit * 100).toFixed(0) + "%",
    peakAvoidance:    `Static 06:00 avoids peak ${(AVOID_RATE*100).toFixed(0)}% of the time`,
    insight:          `Rolling avg arrival ${rollingArrival}:00 = peak congestion. Static 06:00 + ${AVG_TRANSIT}h transit = 08:00 arrival, just before peak`,
  };
}

// SCN-16: Static Start — HOS Waste Early Week
function scn16(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 390, DRIVERS = 50, STATIC_START = 6.0, ROLLING_START = 7.5;
  const staticExhaust  = STATIC_START + G.HOS_DAY;   // 17:00
  const rollingExhaust = ROLLING_START + G.HOS_DAY;  // 18:30
  const lostHours      = rollingExhaust - staticExhaust; // 1.5h
  const utilCost       = inp.startPolicy === "rolling" ? 0
                       : DRIVERS * lostHours * G.REVENUE_PER_HR;
  return {
    savings:            inp.startPolicy === "rolling" ? Math.round(utilCost) : 0,
    baselineCost:       Math.round(DRIVERS * lostHours * G.REVENUE_PER_HR),
    vetraCost:          Math.round(utilCost),
    lostHoursPerDriver: lostHours,
    staticExhaustAt:    `${staticExhaust}:00`,
    rollingExhaustAt:   `${rollingExhaust}:00`,
    utilizationCostWk:  Math.round(utilCost),
    weeklyFleetImpact:  3400, // from spec
    insight:            `Static burns HOS during pre-peak low-speed hours. Rolling clock naturally aligns with operational rhythm — ${lostHours}h lost/driver/day`,
  };
}

// SCN-17: Hybrid Policy — Regional Segmentation Benchmark
function scn17(inp: SimulationInputs): ScenarioDelta {
  const alignment   = 0.45 * 0.94 + 0.55 * 0.82; // 0.874
  const utilization = 0.45 * 0.79 + 0.55 * 0.89; // 0.845
  return {
    savings:          0,
    baselineCost:     0,
    vetraCost:        0,
    windowAlignment:  (alignment * 100).toFixed(0) + "%",
    utilization:      (utilization * 100).toFixed(0) + "%",
    regionalPolicy:   "Static 06:00 for <200mi lanes",
    longhaulPolicy:   "Rolling HOS for >350mi lanes",
    insight:          `Hybrid: ${(alignment*100).toFixed(0)}% alignment + ${(utilization*100).toFixed(0)}% utilization — best combined score of all three policies`,
  };
}

// SCN-18: Static Start — Predictability Premium
function scn18(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 420, RECV_RATE = 42/60, RECV_COST = 110, UTIL_LOSS = 2800;
  const recvSavings = LOADS * RECV_RATE * RECV_COST;
  const net         = recvSavings - UTIL_LOSS;
  return {
    savings:                Math.round(net),
    baselineCost:           Math.round(UTIL_LOSS),
    vetraCost:              0,
    receiverWaitSavings:    Math.round(recvSavings),
    utilizationLoss:        UTIL_LOSS,
    netWeeklyBenefit:       Math.round(net),
    serviceReliabilityGain: 11, // pp from spec
    avgReceiverWaitReduction:"42 min per delivery",
    verdict:                net > 0 ? "FAVORABLE for high-SLA lanes" : "MARGINAL — evaluate per lane",
    insight:                `Receiver wait savings $${Math.round(recvSavings).toLocaleString()} vs utilization loss $${UTIL_LOSS.toLocaleString()} — net ${net > 0 ? "positive" : "negative"} for high-SLA lanes`,
  };
}

// SCN-19: Rolling Clock Drift — Late Week HOS Crunch
function scn19(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 350, REASSIGNED = 23, REASSIGN_COST = 340, ELIM_RATE = 0.81;
  const hosRemaining = G.HOS_CYCLE_70 - 20 - 20; // 30h remaining Thursday
  const baseline     = REASSIGNED * REASSIGN_COST;
  const vetra        = inp.startPolicy === "static" ? baseline * (1 - ELIM_RATE)
                     : inp.startPolicy === "hybrid"  ? baseline * 0.45
                     : baseline;
  return {
    savings:            Math.round(baseline - vetra),
    baselineCost:       baseline,
    vetraCost:          Math.round(vetra),
    hosRemainingFriday: hosRemaining + "h",
    loadsReassigned:    REASSIGNED,
    eliminationRate:    (ELIM_RATE * 100).toFixed(0) + "%",
    insight:            `Static policy distributes HOS evenly — eliminates Friday crunch in ${(ELIM_RATE*100).toFixed(0)}% of cases. Rolling Mon-Tue overuse cascades to missed Friday loads`,
  };
}

// SCN-20: Combined — All Three Problems Active
function scn20(inp: SimulationInputs): ScenarioDelta {
  const LOADS = 380, INTERACTION = 1.23, SYNERGY = 0.15;
  // Pull component costs from representative scenario results
  const p1Delta = scn01(inp);
  const p2Delta = scn09(inp);
  const p3Delta = scn15(inp);
  const p1Base  = p1Delta.baselineCost * (LOADS / 480) * 0.38 * 3;
  const p2Base  = p2Delta.baselineCost * (LOADS / 480) * 0.34 * 3;
  const p3Base  = p3Delta.baselineCost * (LOADS / 480) * 0.28 * 3;
  const baseline = Math.round((p1Base + p2Base + p3Base) * INTERACTION);
  const indivSave = (p1Delta.savings + p2Delta.savings + p3Delta.savings) * (LOADS / 480);
  const synergySave = indivSave * SYNERGY;
  const vetra    = Math.max(0, baseline - indivSave - synergySave);
  return {
    savings:            Math.round(baseline - vetra),
    baselineCost:       baseline,
    vetraCost:          Math.round(vetra),
    p1Contribution:     Math.round(p1Base),
    p2Contribution:     Math.round(p2Base),
    p3Contribution:     Math.round(p3Base),
    interactionPenalty: `${((INTERACTION-1)*100).toFixed(0)}% cost amplification`,
    synergySavings:     Math.round(synergySave),
    insight:            `Combined solve: 23% interaction penalty on siloed approach. Vetra's unified optimizer recovers ${(SYNERGY*100).toFixed(0)}% additional savings through cross-problem rerouting`,
  };
}

// ─── MASTER RUNNER ────────────────────────────────────────────────────────────

export const SCENARIO_RUNNERS: Record<string, (inp: SimulationInputs) => ScenarioDelta> = {
  "SCN-01": scn01, "SCN-02": scn02, "SCN-03": scn03, "SCN-04": scn04,
  "SCN-05": scn05, "SCN-06": scn06, "SCN-07": scn07, "SCN-08": scn08,
  "SCN-09": scn09, "SCN-10": scn10, "SCN-11": scn11, "SCN-12": scn12,
  "SCN-13": scn13, "SCN-14": scn14, "SCN-15": scn15, "SCN-16": scn16,
  "SCN-17": scn17, "SCN-18": scn18, "SCN-19": scn19, "SCN-20": scn20,
};

export const SCENARIO_META: Record<string, { name: string; problem: string; loadsAffected: number }> = {
  "SCN-01": { name:"Tight Window Rejection — Dallas Hub",          problem:"P1", loadsAffected:480 },
  "SCN-02": { name:"Double-Drop Opportunity — Memphis Corridor",   problem:"P1", loadsAffected:420 },
  "SCN-03": { name:"Cross-Dock Near-Miss — Chicago",               problem:"P1", loadsAffected:390 },
  "SCN-04": { name:"High-Gap Pairing — Nashville to Atlanta",      problem:"P1", loadsAffected:350 },
  "SCN-05": { name:"Multi-Stop Cascade Failure",                   problem:"P1", loadsAffected:510 },
  "SCN-06": { name:"Reefer Pairing Constraint",                    problem:"P1", loadsAffected:290 },
  "SCN-07": { name:"Weekend Carry-Over Pairing",                   problem:"P1", loadsAffected:260 },
  "SCN-08": { name:"Flatbed Window Mismatch",                      problem:"P1", loadsAffected:310 },
  "SCN-09": { name:"Weak Pull — Revenue Max Early Week",           problem:"P2", loadsAffected:480 },
  "SCN-10": { name:"Strong Pull — Conservative Routing",           problem:"P2", loadsAffected:440 },
  "SCN-11": { name:"Mid-Week Drift Cascade",                       problem:"P2", loadsAffected:370 },
  "SCN-12": { name:"Regional Cluster Benchmark",                   problem:"P2", loadsAffected:520 },
  "SCN-13": { name:"Multi-Driver Domicile Conflict",               problem:"P2", loadsAffected:330 },
  "SCN-14": { name:"5-Day vs 2-Day Planning Horizon",              problem:"P2", loadsAffected:410 },
  "SCN-15": { name:"Rolling Clock — Peak Hour Alignment Failure",  problem:"P3", loadsAffected:460 },
  "SCN-16": { name:"Static Start — HOS Waste Early Week",          problem:"P3", loadsAffected:390 },
  "SCN-17": { name:"Hybrid Policy — Regional Segmentation",        problem:"P3", loadsAffected:500 },
  "SCN-18": { name:"Static Start — Predictability Premium",        problem:"P3", loadsAffected:420 },
  "SCN-19": { name:"Rolling Clock Drift — Late Week HOS Crunch",   problem:"P3", loadsAffected:350 },
  "SCN-20": { name:"Combined — All Three Problems Active",          problem:"Combined", loadsAffected:380 },
};

export function runScenario(scenarioId: string, inputs: SimulationInputs): ScenarioDelta {
  const runner = SCENARIO_RUNNERS[scenarioId];
  if (!runner) throw new Error(`Unknown scenario: ${scenarioId}`);
  return runner(inputs);
}

export function runAllScenarios(inputs: SimulationInputs) {
  return Object.entries(SCENARIO_META).map(([id, meta]) => ({
    scenarioId:    id,
    name:          meta.name,
    problemType:   meta.problem,
    loadsAffected: meta.loadsAffected,
    ...runScenario(id, inputs),
  }));
}
