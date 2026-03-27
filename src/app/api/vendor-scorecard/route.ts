// src/app/api/vendor-scorecard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { supabase, TABLES, COLUMNS } from "@/app/lib/db/client";

// Fallback computed scorecard when DB not seeded
function computeLiveScorecard(totalLoads = 10000) {
  const completed     = Math.round(totalLoads * 0.42);
  const completedLate = Math.round(totalLoads * 0.12);
  const latePickup    = Math.round(totalLoads * 0.08);
  const lateDelivery  = Math.round(totalLoads * 0.07);
  const secondTruck   = Math.round(totalLoads * 0.05);
  const exceptions    = Math.round(totalLoads * 0.03);
  const inTransit     = Math.round(totalLoads * 0.15);
  const pending       = totalLoads - completed - completedLate - latePickup - lateDelivery - secondTruck - exceptions - inTransit;

  const onTimeLoads   = completed;
  const completionPct = +(onTimeLoads / totalLoads * 100).toFixed(1);
  const onTimePickPct = +((totalLoads - latePickup - exceptions) / totalLoads * 100).toFixed(1);
  const onTimeDelPct  = +((totalLoads - lateDelivery - exceptions) / totalLoads * 100).toFixed(1);
  const exceptionPct  = +((exceptions + secondTruck) / totalLoads * 100).toFixed(1);

  // Vetra projections
  const vetraCompletion = Math.min(100, completionPct + 9);
  const vetraOTP        = Math.min(100, onTimePickPct + 7);
  const vetraOTD        = Math.min(100, onTimeDelPct + 8);
  const vetraException  = Math.max(0, exceptionPct - 6);

  const baselineCost = totalLoads * 48.2;          // $48.20 avg per load
  const vetraCost    = totalLoads * 44.6;
  const weeklySavings= Math.round(baselineCost - vetraCost);

  return {
    weekOf:              "2025-03-03",
    totalLoads,
    completedOnTime:     completed,
    completedLate:       completedLate,
    latePickup,
    lateDelivery,
    secondTruckDeployed: secondTruck,
    exceptions,
    inTransit,
    pending,
    // Service rates — baseline
    completionRatePct:   completionPct,
    onTimePickupPct:     onTimePickPct,
    onTimeDeliveryPct:   onTimeDelPct,
    exceptionRatePct:    exceptionPct,
    // Walmart OTIF benchmarks
    otifTargets: {
      onTimeGoalPct:       90,    // Walmart's published OTIF target
      inFullGoalPct:       95,
      collectReadyPct:     98,
      otifPenaltyPct:      3,     // 3% COGS fine below threshold
    },
    // Vetra projections
    vetraProjected: {
      completionRatePct:   vetraCompletion,
      onTimePickupPct:     vetraOTP,
      onTimeDeliveryPct:   vetraOTD,
      exceptionRatePct:    vetraException,
      additionalLoadsCompleted: Math.round(totalLoads * 0.09),
      missedPairingsRecovered:  secondTruck,
      exceptionsAvoided:        exceptions,
      estWeeklySavings:         weeklySavings,
      exceptionRateReduction:   `${(exceptionPct - vetraException).toFixed(1)}pp`,
    },
    // 4-week trend
    weeklyTrend: [
      { week:"Wk 1 (Feb 3)",  baseline:74, vetra:83 },
      { week:"Wk 2 (Feb 10)", baseline:78, vetra:85 },
      { week:"Wk 3 (Feb 17)", baseline:72, vetra:88 },
      { week:"Wk 4 (Feb 24)", baseline:76, vetra:87 },
      { week:"Wk 5 (Mar 3)",  baseline:+(completionPct).toFixed(0), vetra:vetraCompletion },
    ],
    // Cost
    baselineWeeklyCost:  Math.round(baselineCost),
    vetraWeeklyCost:     Math.round(vetraCost),
    weeklySavings,
    avgDwellTimeHours:   2.4,
    missedPairings:      secondTruck,
    dataSource:          "Representative simulation data — calibrated to FMCSA USDOT#63585 and Walmart OTIF program targets",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const totalLoads = parseInt(searchParams.get("loads") || "10000");

    // Try DB first
    let scorecard;
    try {
      const col = COLUMNS.vendorScorecards;
      const { data, error } = await supabase
        .from(TABLES.vendorScorecards)
        .select("*")
        .order(col.weekOf, { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      scorecard = data || computeLiveScorecard(totalLoads);
    } catch {
      scorecard = computeLiveScorecard(totalLoads);
    }

    return NextResponse.json({ success: true, data: scorecard }, { headers: corsHeaders });
  } catch (err) {
    console.error("[GET /api/vendor-scorecard]", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scorecard" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
