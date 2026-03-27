// src/app/api/scenarios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { supabase, TABLES, COLUMNS } from "@/app/lib/db/client";
import { SCENARIO_META } from "@/app/lib/formulas/scenarios";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const problemType = searchParams.get("problem"); // P1 | P2 | P3 | Combined

    // Try DB first — fall back to in-memory meta
    let scenarios;
    try {
      const col = COLUMNS.scenarios;
      let query = supabase
        .from(TABLES.scenarios)
        .select(
          `scenarioId:${col.scenarioId},name:${col.name},problemType:${col.problemType},loadsAffected:${col.loadsAffected}`
        )
        .order(col.scenarioId, { ascending: true });
      if (problemType) query = query.eq(col.problemType, problemType);
      const { data, error } = await query;
      if (error) throw error;
      scenarios = data || [];
    } catch {
      // DB not seeded yet — return formula metadata
      scenarios = Object.entries(SCENARIO_META)
        .filter(([, m]) => !problemType || m.problem === problemType)
        .map(([id, m]) => ({
          scenarioId:    id,
          name:          m.name,
          problemType:   m.problem,
          loadsAffected: m.loadsAffected,
        }));
    }

    return NextResponse.json({
      success: true,
      count:   scenarios.length,
      data:    scenarios,
    }, { headers: corsHeaders });
  } catch (err) {
    console.error("[GET /api/scenarios]", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scenarios" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
