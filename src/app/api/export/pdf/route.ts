// src/app/api/export/pdf/route.ts
// Note: jsPDF runs server-side — returns base64 PDF for download
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { runAllScenarios, SimulationInputs } from "@/app/lib/formulas/scenarios";

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const { inputs, title = "Vetra x Walmart Simulation Report" } = body;
    const results = runAllScenarios(inputs as SimulationInputs);
    const timestamp = new Date().toLocaleString();

    // Build HTML report (rendered to PDF client-side or via headless)
    const totalSavings  = results.reduce((a, r) => a + (r.savings || 0), 0);
    const totalTrucks   = results.reduce((a, r) => a + (r.trucksSaved || 0), 0);
    const p1Savings     = results.filter(r => r.problemType === "P1").reduce((a,r) => a+(r.savings||0), 0);
    const p2Savings     = results.filter(r => r.problemType === "P2").reduce((a,r) => a+(r.savings||0), 0);
    const p3Savings     = results.filter(r => r.problemType === "P3").reduce((a,r) => a+(r.savings||0), 0);

    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; background:#fff; color:#0A1628; padding:40px; }
    .header { border-bottom:3px solid #1B6FEB; padding-bottom:20px; margin-bottom:30px; }
    .header h1 { font-size:22px; color:#0A1628; }
    .header .sub { color:#5A6A85; font-size:12px; margin-top:6px; }
    .kpi-row { display:flex; gap:20px; margin-bottom:30px; }
    .kpi { background:#F7F9FC; border:1px solid #E8EDF5; border-radius:8px; padding:16px 20px; flex:1; }
    .kpi .label { font-size:10px; color:#5A6A85; text-transform:uppercase; letter-spacing:0.08em; }
    .kpi .value { font-size:24px; font-weight:700; color:#1B6FEB; margin-top:4px; }
    .section { margin-bottom:28px; }
    .section h2 { font-size:13px; color:#00C2E0; text-transform:uppercase; letter-spacing:0.1em;
                  border-left:3px solid #00C2E0; padding-left:10px; margin-bottom:16px; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th { background:#F7F9FC; color:#5A6A85; font-weight:400; padding:8px 10px;
         text-align:left; border-bottom:1px solid #E8EDF5; letter-spacing:0.04em; }
    td { padding:8px 10px; border-bottom:1px solid #E8EDF5; color:#0A1628; }
    tr:nth-child(even) { background:#F7F9FC44; }
    .green { color:#00D48A; } .red { color:#FF4D6A; } .amber { color:#F5A623; }
    .footer { margin-top:40px; border-top:1px solid #E8EDF5; padding-top:16px;
              font-size:10px; color:#9BAAC2; }
    .badge { display:inline-block; padding:2px 8px; border-radius:3px; font-size:10px; font-weight:600; }
    .badge-p1 { background:#1B6FEB22; color:#1B6FEB; }
    .badge-p2 { background:#00C2E022; color:#00C2E0; }
    .badge-p3 { background:#00D48A22; color:#00D48A; }
    .badge-combined { background:#F5A62322; color:#F5A623; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="sub">Generated: ${timestamp} · Representative simulation data for demonstration purposes</div>
    <div class="sub" style="margin-top:4px">Config: Wait ${inputs.waitToleranceHours}h · Pull: ${inputs.domicilePull} · Start: ${inputs.startPolicy} · Risk: ${inputs.riskMode}</div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="label">Total Projected Savings</div>
      <div class="value">$${totalSavings.toLocaleString()}</div>
    </div>
    <div class="kpi">
      <div class="label">Trucks Saved (Fleet)</div>
      <div class="value">${totalTrucks}</div>
    </div>
    <div class="kpi">
      <div class="label">P1 — Missed Pairing Savings</div>
      <div class="value">$${p1Savings.toLocaleString()}</div>
    </div>
    <div class="kpi">
      <div class="label">P2 — Bungee Savings</div>
      <div class="value">$${p2Savings.toLocaleString()}</div>
    </div>
    <div class="kpi">
      <div class="label">P3 — Start Time Savings</div>
      <div class="value">$${p3Savings.toLocaleString()}</div>
    </div>
  </div>

  <div class="section">
    <h2>All 20 Scenarios — Results</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Type</th>
          <th>Loads</th>
          <th>Baseline Cost</th>
          <th>Vetra Cost</th>
          <th>Savings</th>
          <th>Trucks Saved</th>
          <th>Key Insight</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => `
          <tr>
            <td>${r.scenarioId}</td>
            <td>${r.name}</td>
            <td><span class="badge badge-${r.problemType.toLowerCase()}">${r.problemType}</span></td>
            <td>${r.loadsAffected?.toLocaleString() || 0}</td>
            <td>$${(r.baselineCost || 0).toLocaleString()}</td>
            <td>$${(r.vetraCost   || 0).toLocaleString()}</td>
            <td class="${(r.savings||0) > 0 ? 'green' : 'red'}">$${(r.savings || 0).toLocaleString()}</td>
            <td>${r.trucksSaved || 0}</td>
            <td style="max-width:200px;font-size:10px;color:#5A6A85">${r.insight || ''}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Vetra Technologies x Walmart · Confidential — Representative Simulation Data ·
    Fleet parameters calibrated to FMCSA USDOT#63585 public records and Walmart OTIF program targets.
    This report is generated for demonstration purposes only.
  </div>
</body>
</html>`;

    return new NextResponse(htmlReport, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="vetra-simulation-report-${new Date().toISOString().split("T")[0]}.html"`,
        ...corsHeaders,
      },
    });

  } catch (err) {
    console.error("[POST /api/export/pdf]", err);
    return NextResponse.json(
      { success: false, error: "Export failed" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
