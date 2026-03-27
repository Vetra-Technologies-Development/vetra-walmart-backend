// src/app/api/export/csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { runAllScenarios, SimulationInputs } from "@/app/lib/formulas/scenarios";
import { stringify } from "csv-stringify/sync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { inputs, type = "scenarios" } = body;

    let csvContent = "";
    const timestamp = new Date().toISOString().split("T")[0];

    if (type === "scenarios") {
      const results = runAllScenarios(inputs as SimulationInputs);
      const rows = results.map(r => ({
        "Scenario ID":      r.scenarioId,
        "Name":             r.name,
        "Problem Type":     r.problemType,
        "Loads Affected":   r.loadsAffected,
        "Baseline Cost ($)":r.baselineCost?.toLocaleString() || "0",
        "Vetra Cost ($)":   r.vetraCost?.toLocaleString()    || "0",
        "Savings ($)":      r.savings?.toLocaleString()       || "0",
        "Trucks Saved":     r.trucksSaved || 0,
        "Wait Added (h)":   r.waitAddedHours || 0,
        "Schedule Risk (pp)":r.scheduleRiskDelta || 0,
        "Pairing Rate":     r.pairingRate || "N/A",
        "Key Insight":      r.insight || "",
      }));
      csvContent = stringify(rows, { header: true });

    } else if (type === "loads") {
      // Paginated load export from DB — handled separately
      csvContent = "Load export requires DB connection. Use GET /api/loads with pagination.";
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv",
        "Content-Disposition": `attachment; filename="vetra-simulation-${type}-${timestamp}.csv"`,
        ...corsHeaders,
      },
    });

  } catch (err) {
    console.error("[POST /api/export/csv]", err);
    return NextResponse.json(
      { success: false, error: "CSV export failed" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
