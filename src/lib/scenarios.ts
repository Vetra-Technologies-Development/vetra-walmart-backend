// ─── VETRA SCENARIO FORMULA ENGINE ───────────────────────────────────────────
// All 20 scenarios — pure TypeScript functions
// Each scenario: baselineCost(), vetraCost(inputs), delta(inputs)

export interface SimulationInputs {
  waitToleranceHours:  number;   // 0–6
  pickupFlexHours:     number;   // 0–4
  deliveryFlexHours:   number;   // 0–4
  domicilePull:        "weak" | "moderate" | "strong" | "custom";
  startPolicy:         "rolling" | "static" | "hybrid";
  riskMode:            "aggressive" | "balanced" | "conservative";
  planningHorizon:     "24h" | "48h" | "5days";
  trafficMultiplier:   number;   // 1.0 | 1.2 | 1.5
}

export interface ScenarioDelta {
  savings:            number;
  trucksSaved?:       number;
  waitAddedHours?:    number;
  scheduleRiskDelta?: number;
  [key: string]:      unknown;
}

export interface ScenarioResult {
  scenarioId:   string;
  name:         string;
  problemType:  "P1" | "P2" | "P3" | "COMBINED";
  loadsAffected: number;
  baselineCost: number;
  vetraCost:    number;
  savings:      number;
  savingsPct:   number;
  delta:        ScenarioDelta;
  confidence:   "HIGH" | "MEDIUM" | "LOW";
}

// ─── SHARED CONSTANTS ────────────────────────────────────────────────────────

const G = {
  CPM_DRY_VAN:        2.10,
  CPM_REEFER:         2.45,
  CPM_FLATBED:        2.28,
  IDLE_COST_HR:       65,
  IDLE_REEFER_HR:     85,
  DEADHEAD_CPM:       1.82,
  AVG_SPEED_MPH:      55,
  HOS_MAX_DAY:        11,
  SERVICE_TIME_HR:    1.5,
  TRUCK2_FIXED:       285,
  REVENUE_PER_HOUR:   176,  // $3.20/mi × 55mph
};

const truck2Cost = (miles: number, cpm = G.CPM_DRY_VAN) =>
  miles * cpm + G.TRUCK2_FIXED;

const waitCost = (hours: number, rate = G.IDLE_COST_HR) =>
  hours * rate;

const riskMult = (mode: string) =>
  mode === "aggressive" ? 1.10 : mode === "conservative" ? 0.85 : 1.0;

// ─── P2 BUNGEE SHARED ────────────────────────────────────────────────────────

const PULL_MAP: Record<string, number> = {
  weak: 0.5, moderate: 1.0, strong: 2.0, custom: 1.5,
};
const BASE_PULL = 0.18;

const acceptanceProb = (day: number, pull: string) =>
  1 / (1 + day * (PULL_MAP[pull] ?? 1.0) * BASE_PULL);

const driftAtDay = (day: number, pull: string): number => {
  let drift = 0;
  for (let d = 1; d <= day; d++) drift += 280 * acceptanceProb(d, pull);
  return Math.round(drift);
};

const emptyMilesReturn = (endDrift: number, pull: string) =>
  Math.max(0, endDrift - 150 - (PULL_MAP[pull] ?? 1.0) * 40);

// ─── 20 SCENARIO DEFINITIONS ─────────────────────────────────────────────────

function scn01(inp: SimulationInputs): ScenarioResult {
  const LOADS = 480; const MILES = 452;
  const rate   = Math.min(0.95, (Math.min(1, inp.waitToleranceHours / 2.5) *
    Math.min(1, 40 / 40) * 0.71) * riskMult(inp.riskMode));
  const paired = Math.round(LOADS * rate);
  const base   = LOADS * truck2Cost(MILES);
  const vetra  = paired * (waitCost(1.5) + 18 * G.DEADHEAD_CPM) +
                 (LOADS - paired) * truck2Cost(MILES);
  const sav    = base - vetra;
  return {
    scenarioId: "SCN-01", name: "Tight Window Rejection — Dallas Hub",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: Math.round(sav), trucksSaved: paired,
      waitAddedHours: +(paired * 1.5).toFixed(0),
      scheduleRiskDelta: +(1.5 * 3.2 * (inp.riskMode === "aggressive" ? 1.4 : 1.0)).toFixed(1),
      pairingRate: `${(rate * 100).toFixed(1)}%`,
      breakEvenHours: +((truck2Cost(MILES)) / G.IDLE_COST_HR).toFixed(1),
      insight: "Current <3h gap policy is inverted — short gaps are BEST pairing candidates",
    },
  };
}

function scn02(inp: SimulationInputs): ScenarioResult {
  const LOADS = 420;
  const rAdj  = inp.riskMode === "aggressive" ? 0.92 : inp.riskMode === "conservative" ? 0.76 : 0.85;
  const rate  = Math.min(0.95, rAdj * Math.min(1, inp.waitToleranceHours / 2.0));
  const paired= Math.round(LOADS * rate);
  const base  = 52400;
  const vetra = paired * (waitCost(2.0) + 8 * G.DEADHEAD_CPM) +
                (LOADS - paired) * truck2Cost(393);
  const sav   = base - vetra;
  return {
    scenarioId: "SCN-02", name: "Double-Drop Opportunity — Memphis Corridor",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: base, vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: Math.round(sav), trucksSaved: paired,
      waitAddedHours: paired * 2, deadheadMiles: paired * 8,
      scheduleRiskDelta: 4.2,
      insight: "8-mile deadhead + 2h wait vs full 393mi second truck — math always favors pairing",
    },
  };
}

function scn03(inp: SimulationInputs): ScenarioResult {
  const LOADS = 390; const AVG_GAP = 4.5;
  const dwellScore = Math.min(1, inp.waitToleranceHours / AVG_GAP);
  const rate  = Math.min(0.78, dwellScore * 0.85 * riskMult(inp.riskMode));
  const paired= Math.round(LOADS * rate);
  const base  = LOADS * 210;
  const vetra = paired * waitCost(AVG_GAP) + (LOADS - paired) * 210;
  const sav   = base - vetra;
  return {
    scenarioId: "SCN-03", name: "Cross-Dock Near-Miss — Chicago",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "MEDIUM",
    delta: {
      savings: Math.round(sav), driverSwapsAvoided: paired,
      dwellHoursAdded: +(paired * AVG_GAP).toFixed(0),
      scheduleRiskDelta: +(AVG_GAP * 1.8).toFixed(1),
      insight: "Same facility — zero deadhead cost. Keeping driver at cross-dock eliminates new driver dispatch",
    },
  };
}

function scn04(inp: SimulationInputs): ScenarioResult {
  const LOADS = 350; const GAP = 4.0; const MILES = 248;
  const breakEven = truck2Cost(MILES) / G.IDLE_COST_HR;
  const tolScore  = Math.min(1, inp.waitToleranceHours / GAP);
  const rate      = Math.min(0.92, 0.71 * tolScore * riskMult(inp.riskMode));
  const paired    = Math.round(LOADS * rate);
  const base      = LOADS * truck2Cost(MILES);
  const vetra     = paired * waitCost(GAP) + (LOADS - paired) * truck2Cost(MILES);
  const sav       = base - vetra;
  return {
    scenarioId: "SCN-04", name: "High-Gap Pairing — Nashville to Atlanta",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: Math.round(sav), trucksSaved: paired,
      breakEvenHours: +breakEven.toFixed(1),
      waitVsTruckVerdict: GAP < breakEven ? "WAIT IS CHEAPER" : "TRUCK IS CHEAPER",
      policyGap: `Policy max ${inp.waitToleranceHours}h vs optimal ${breakEven.toFixed(1)}h break-even`,
      scheduleRiskDelta: +(GAP * 3.8).toFixed(1),
    },
  };
}

function scn05(inp: SimulationInputs): ScenarioResult {
  const LOADS = 510; const CASCADE = 1.2 * 1.15;
  const rejRate   = CASCADE >= 1.5 ? 0.52 : 0.30;
  const recRate   = Math.min(0.91, Math.min(1, inp.waitToleranceHours / CASCADE) * 0.88 * riskMult(inp.riskMode));
  const rejected  = LOADS * rejRate;
  const recovered = Math.round(rejected * recRate);
  const base      = rejected * truck2Cost(180);
  const vetra     = recovered * waitCost(CASCADE) + (rejected - recovered) * truck2Cost(180);
  const sav       = base - vetra;
  return {
    scenarioId: "SCN-05", name: "Multi-Stop Cascade Failure",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: base > 0 ? +((sav / base) * 100).toFixed(1) : 0,
    confidence: "MEDIUM",
    delta: {
      savings: Math.round(sav), cascadeDelayHours: +CASCADE.toFixed(2),
      loadsRecovered: recovered, trucksSaved: recovered,
      scheduleRiskDelta: +(CASCADE * 2.5).toFixed(1),
    },
  };
}

function scn06(inp: SimulationInputs): ScenarioResult {
  const LOADS = 290; const SAFE_DWELL = 4.0 / 2.3;
  const effectiveDwell = Math.min(inp.waitToleranceHours, SAFE_DWELL);
  const rate   = Math.min(0.45, (effectiveDwell / 1.5) * 0.50 * riskMult(inp.riskMode));
  const paired = Math.round(LOADS * rate);
  const base   = LOADS * truck2Cost(340, G.CPM_REEFER);
  const vetra  = paired * waitCost(effectiveDwell, G.IDLE_REEFER_HR) +
                 (LOADS - paired) * truck2Cost(340, G.CPM_REEFER);
  const sav    = base - vetra;
  return {
    scenarioId: "SCN-06", name: "Reefer Pairing Constraint",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "MEDIUM",
    delta: {
      savings: Math.round(sav), reeferLoadsPaired: paired,
      safeMaxDwellHrs: +SAFE_DWELL.toFixed(2),
      tempDriftRiskF: +(inp.waitToleranceHours * 2.3).toFixed(1),
      tempSafetyStatus: inp.waitToleranceHours * 2.3 <= 4.0 ? "WITHIN LIMITS" : "⚠ EXCEEDS THRESHOLD",
    },
  };
}

function scn07(inp: SimulationInputs): ScenarioResult {
  const LOADS = 260; const MILES = 280;
  const rate   = Math.min(0.85, 0.58 * riskMult(inp.riskMode));
  const paired = Math.round(LOADS * rate);
  const base   = LOADS * (truck2Cost(MILES) + 195);
  const vetra  = (LOADS - paired) * (truck2Cost(MILES) + 195);
  const sav    = base - vetra;
  return {
    scenarioId: "SCN-07", name: "Weekend Carry-Over Pairing",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "MEDIUM",
    delta: {
      savings: Math.round(sav), carryOverLoads: paired,
      newDriversAvoided: paired, weekendDispatchSaved: paired * 195,
      scheduleRiskDelta: 2.1,
      hosNote: "34h restart resets full HOS cycle — zero incremental cost to carry-over",
    },
  };
}

function scn08(inp: SimulationInputs): ScenarioResult {
  const LOADS = 310; const AVG_GAP = 2.0; const MILES = 195;
  const rate   = Math.min(0.62, Math.min(1, inp.waitToleranceHours / 1.0) * 0.65 * riskMult(inp.riskMode));
  const paired = Math.round(LOADS * rate);
  const base   = LOADS * truck2Cost(MILES, G.CPM_FLATBED);
  const vetra  = paired * waitCost(AVG_GAP) + (LOADS - paired) * truck2Cost(MILES, G.CPM_FLATBED);
  const sav    = base - vetra;
  return {
    scenarioId: "SCN-08", name: "Flatbed Window Mismatch",
    problemType: "P1", loadsAffected: LOADS,
    baselineCost: Math.round(base), vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "MEDIUM",
    delta: {
      savings: Math.round(sav), flatbedsPaired: paired,
      waitVsTruck: `$${waitCost(AVG_GAP).toFixed(0)} wait vs $${truck2Cost(MILES, G.CPM_FLATBED).toFixed(0)} truck`,
      keyInsight: inp.waitToleranceHours >= 1.0
        ? "+1h tolerance unlocks 62% of flatbed loads"
        : "Need ≥1h tolerance to unlock pairings",
      scheduleRiskDelta: +(AVG_GAP * 2.2).toFixed(1),
    },
  };
}

function scn09(inp: SimulationInputs): ScenarioResult {
  const LOADS = 480; const DRIVERS_AT_RISK = 20;
  const endDrift = driftAtDay(5, "weak");
  const emptyMi  = emptyMilesReturn(endDrift, "weak");
  const base     = DRIVERS_AT_RISK * 4200;
  const vetra    = Math.round(DRIVERS_AT_RISK * emptyMilesReturn(
    Math.round(driftAtDay(3, "moderate") * 0.6), "moderate") * G.DEADHEAD_CPM * 0.45);
  const sav      = base - vetra;
  return {
    scenarioId: "SCN-09", name: "Weak Pull — Revenue Max Early Week",
    problemType: "P2", loadsAffected: LOADS,
    baselineCost: base, vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: Math.round(sav), endOfWeekDriftMiles: endDrift,
      totalEmptyMiles: emptyMi, driversAtReturnRisk: DRIVERS_AT_RISK,
      avgRepositionCost: 4200,
      weeklyDriftProfile: [1,2,3,4,5].map(d => ({
        day: ["Mon","Tue","Wed","Thu","Fri"][d-1],
        drift: driftAtDay(d, "weak"),
        emptyMiles: emptyMilesReturn(driftAtDay(d, "weak"), "weak"),
      })),
    },
  };
}

function scn10(inp: SimulationInputs): ScenarioResult {
  const LOADS = 440;
  const endDrift = driftAtDay(5, "strong");
  const revLost  = 3100 * 50;
  return {
    scenarioId: "SCN-10", name: "Strong Pull — Conservative Routing",
    problemType: "P2", loadsAffected: LOADS,
    baselineCost: revLost, vetraCost: 0,
    savings: revLost, savingsPct: 100,
    confidence: "HIGH",
    delta: {
      savings: revLost, returnSuccessRate: "100%",
      endOfWeekDriftMiles: endDrift, totalEmptyMiles: 0,
      revenueLostWeekly: revLost, missedHighRevLoads: "12% of distant loads declined",
      tradeoff: "Zero reposition risk but $3,100/driver/week in foregone revenue",
      weeklyDriftProfile: [1,2,3,4,5].map(d => ({
        day: ["Mon","Tue","Wed","Thu","Fri"][d-1],
        drift: driftAtDay(d, "strong"),
        emptyMiles: 0,
      })),
    },
  };
}

function scn11(inp: SimulationInputs): ScenarioResult {
  const LOADS = 370; const COMPOUND = 380 + 230;
  const triggered  = COMPOUND > 500;
  const base       = Math.round((LOADS / 3) * 1238);
  const prevented  = inp.planningHorizon === "5days" ? 0.78 : 0.45;
  const vetra      = Math.round(base * (1 - prevented));
  const sav        = base - vetra;
  return {
    scenarioId: "SCN-11", name: "Mid-Week Drift Cascade",
    problemType: "P2", loadsAffected: LOADS,
    baselineCost: base, vetraCost: vetra,
    savings: sav, savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "MEDIUM",
    delta: {
      savings: sav, compoundDriftMiles: COMPOUND,
      driftThresholdBreached: triggered, emptyMilesFriday: 590,
      emptyCostPerDriver: 1238,
      insight: `${inp.planningHorizon === "5days" ? "5-day horizon catches Day 3 compound drift early — saves 78%" : "48h horizon misses compounding — only 45% recovery"}`,
    },
  };
}

function scn12(_inp: SimulationInputs): ScenarioResult {
  return {
    scenarioId: "SCN-12", name: "Regional Cluster — Moderate Pull Benchmark",
    problemType: "P2", loadsAffected: 520,
    baselineCost: 0, vetraCost: 0, savings: 0, savingsPct: 0,
    confidence: "HIGH",
    delta: {
      savings: 0, repositioningCost: 0, returnSuccessRate: "100%",
      revenueVsWeak: "$420/driver/week less than weak pull — best efficiency ratio",
      benchmarkNote: "Natural freight availability keeps drivers within 200mi radius",
      weeklyDriftProfile: [1,2,3,4,5].map(d => ({
        day: ["Mon","Tue","Wed","Thu","Fri"][d-1],
        drift: Math.min(180, driftAtDay(d, "moderate")), emptyMiles: 0,
      })),
    },
  };
}

function scn13(inp: SimulationInputs): ScenarioResult {
  const LOADS = 330; const BACKHAUL = 0.72;
  const conflictProb  = 1 - Math.pow(BACKHAUL, 3);
  const base          = Math.round((LOADS / 3) * conflictProb * 890);
  const staggerConf   = conflictProb * 0.38;
  const vetra         = Math.round((LOADS / 3) * staggerConf * 890);
  const sav           = base - vetra;
  return {
    scenarioId: "SCN-13", name: "Multi-Driver Domicile Conflict",
    problemType: "P2", loadsAffected: LOADS,
    baselineCost: base, vetraCost: vetra,
    savings: sav, savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "MEDIUM",
    delta: {
      savings: sav,
      conflictProbability: `${(conflictProb * 100).toFixed(1)}%`,
      staggeringInsight: "Vetra staggers same-DC drivers Mon/Wed/Fri, reducing conflict from 62.7% to 23.8%",
    },
  };
}

function scn14(inp: SimulationInputs): ScenarioResult {
  const LOADS = 410;
  const detect5d  = 0.79; const detect48h = 0.31;
  const needCorr  = LOADS * 0.35;
  const base      = Math.round(needCorr * 340 * G.DEADHEAD_CPM * (1 - detect48h));
  const detect    = inp.planningHorizon === "5days" ? detect5d : detect48h;
  const vetra     = Math.round(needCorr * 340 * G.DEADHEAD_CPM * (1 - detect));
  const sav       = base - vetra;
  return {
    scenarioId: "SCN-14", name: "5-Day vs 2-Day Planning Horizon",
    problemType: "P2", loadsAffected: LOADS,
    baselineCost: base, vetraCost: vetra,
    savings: sav, savingsPct: base > 0 ? +((sav / base) * 100).toFixed(1) : 0,
    confidence: "HIGH",
    delta: {
      savings: sav,
      earlyDetectionRate: `${(detect * 100).toFixed(0)}%`,
      insight: inp.planningHorizon === "5days"
        ? "5-day horizon: catches drift Day 2, corrects before compounding — 79% detection"
        : "48h horizon: misses Day 3+ compound drift — forced expensive Day 4 correction",
    },
  };
}

function scn15(inp: SimulationInputs): ScenarioResult {
  const LOADS = 460; const PEAK_DELAY = 0.8;
  const rollingPeakRate = 0.68; const staticPeakRate = 0.27;
  const policyRate = inp.startPolicy === "static" ? staticPeakRate
    : inp.startPolicy === "hybrid" ? (rollingPeakRate + staticPeakRate) / 2
    : rollingPeakRate;
  const base  = Math.round(LOADS * rollingPeakRate * PEAK_DELAY * G.IDLE_COST_HR);
  const vetra = Math.round(LOADS * policyRate    * PEAK_DELAY * G.IDLE_COST_HR);
  const sav   = base - vetra;
  return {
    scenarioId: "SCN-15", name: "Rolling Clock — Peak Hour Alignment Failure",
    problemType: "P3", loadsAffected: LOADS,
    baselineCost: base, vetraCost: Math.round(vetra),
    savings: Math.round(sav), savingsPct: base > 0 ? +((sav / base) * 100).toFixed(1) : 0,
    confidence: "HIGH",
    delta: {
      savings: Math.round(sav), rollingPeakHitRate: `${(rollingPeakRate * 100).toFixed(0)}%`,
      staticPeakHitRate: `${(staticPeakRate * 100).toFixed(0)}%`,
      peakAvoidance: "Static 06:00 avoids peak in 73% of cases vs 32% for rolling",
    },
  };
}

function scn16(inp: SimulationInputs): ScenarioResult {
  const LOADS = 390; const DRIVERS = 50;
  const lostHrs = (7.5 + 11) - (6.0 + 11); // 1.5h rolling exhaust advantage
  const utilCost = inp.startPolicy === "rolling" ? 0
    : Math.round(DRIVERS * lostHrs * G.REVENUE_PER_HOUR);
  return {
    scenarioId: "SCN-16", name: "Static Start — HOS Waste Early Week",
    problemType: "P3", loadsAffected: LOADS,
    baselineCost: 3400, vetraCost: utilCost,
    savings: 3400 - utilCost, savingsPct: +((( 3400 - utilCost) / 3400) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: 3400 - utilCost, lostHoursPerDriver: lostHrs,
      utilizationCostWeekly: utilCost,
      staticExhaustAt: "17:00", rollingExhaustAt: "18:30",
      insight: "Static 06:00 exhausts HOS 90min earlier than rolling — $176/hr opportunity cost",
    },
  };
}

function scn17(_inp: SimulationInputs): ScenarioResult {
  const align  = 0.45 * 0.94 + 0.55 * 0.82;
  const util   = 0.45 * 0.79 + 0.55 * 0.89;
  return {
    scenarioId: "SCN-17", name: "Hybrid Policy — Regional Segmentation",
    problemType: "P3", loadsAffected: 500,
    baselineCost: 0, vetraCost: 0, savings: 0, savingsPct: 0,
    confidence: "HIGH",
    delta: {
      savings: 0, windowAlignment: `${(align * 100).toFixed(0)}%`,
      utilization: `${(util * 100).toFixed(0)}%`,
      verdict: "Best combined score: 82% alignment + 83% utilization",
      regionalPolicy: "Static 06:00 for <200mi lanes", longhaulPolicy: "Rolling for >350mi lanes",
    },
  };
}

function scn18(_inp: SimulationInputs): ScenarioResult {
  const LOADS = 420;
  const receiverSavings = Math.round(LOADS * (42 / 60) * 110);
  const netBenefit      = receiverSavings - 2800;
  return {
    scenarioId: "SCN-18", name: "Static Start — Predictability Premium",
    problemType: "P3", loadsAffected: LOADS,
    baselineCost: 2800, vetraCost: Math.max(0, -netBenefit),
    savings: netBenefit, savingsPct: +((netBenefit / 2800) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: netBenefit, receiverWaitSavingsWeekly: receiverSavings,
      utilizationLossWeekly: 2800, netWeeklyBenefit: netBenefit,
      serviceReliabilityGainPP: 11,
      avgReceiverWaitReduction: "42 min per delivery",
      verdict: netBenefit > 0 ? "FAVORABLE for high-SLA lanes" : "MARGINAL — evaluate per lane",
    },
  };
}

function scn19(inp: SimulationInputs): ScenarioResult {
  const LOADS = 350; const REASSIGNED = 23;
  const base    = REASSIGNED * 340;
  const elimRate = inp.startPolicy === "static" ? 0.81
    : inp.startPolicy === "hybrid" ? 0.55 : 0;
  const vetra   = Math.round(base * (1 - elimRate));
  const sav     = base - vetra;
  return {
    scenarioId: "SCN-19", name: "Rolling Clock Drift — Late Week HOS Crunch",
    problemType: "P3", loadsAffected: LOADS,
    baselineCost: base, vetraCost: vetra,
    savings: sav, savingsPct: +((sav / base) * 100).toFixed(1),
    confidence: "HIGH",
    delta: {
      savings: sav, hosRemainingFriday: "30h",
      loadsReassigned: REASSIGNED,
      staticEliminationRate: `${(elimRate * 100).toFixed(0)}%`,
      insight: "Static policy distributes HOS evenly — prevents late-week crunch in 81% of cases",
    },
  };
}

function scn20(inp: SimulationInputs): ScenarioResult {
  const LOADS = 380; const INTERACTION = 1.23; const SYNERGY = 0.15;
  const p1 = scn01(inp); const p2 = scn09(inp); const p3 = scn15(inp);
  const base  = Math.round((p1.baselineCost * 0.38 + p2.baselineCost * 0.34 + p3.baselineCost * 0.28)
    * (LOADS / 480) * 3 * INTERACTION);
  const indivSav = p1.savings + p2.savings + p3.savings;
  const synergySav = Math.round(indivSav * SYNERGY);
  const vetra = Math.max(0, base - indivSav - synergySav);
  const sav   = base - vetra;
  return {
    scenarioId: "SCN-20", name: "Combined — All Three Problems Active",
    problemType: "COMBINED", loadsAffected: LOADS,
    baselineCost: base, vetraCost: vetra,
    savings: sav, savingsPct: base > 0 ? +((sav / base) * 100).toFixed(1) : 0,
    confidence: "MEDIUM",
    delta: {
      savings: sav, p1Contribution: p1.savings, p2Contribution: p2.savings,
      p3Contribution: p3.savings, synergySavings: synergySav,
      interactionPenalty: "23% cost amplification when all 3 problems active simultaneously",
      synergyInsight: "Combined solve saves 15% more than silos — one reroute fixes P1 + P2 together",
    },
  };
}

// ─── MASTER RUNNER ────────────────────────────────────────────────────────────

const RUNNERS = [
  scn01, scn02, scn03, scn04, scn05, scn06, scn07, scn08,
  scn09, scn10, scn11, scn12, scn13, scn14,
  scn15, scn16, scn17, scn18, scn19, scn20,
];

export function runScenario(id: string, inputs: SimulationInputs): ScenarioResult | null {
  const idx = parseInt(id.replace("SCN-", "")) - 1;
  if (idx < 0 || idx >= RUNNERS.length) return null;
  return RUNNERS[idx](inputs);
}

export function runAllScenarios(inputs: SimulationInputs): ScenarioResult[] {
  return RUNNERS.map(fn => fn(inputs));
}

export function runByProblemType(
  type: "P1" | "P2" | "P3" | "COMBINED",
  inputs: SimulationInputs
): ScenarioResult[] {
  return runAllScenarios(inputs).filter(s => s.problemType === type);
}
