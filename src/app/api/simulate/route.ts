// src/app/api/simulate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { z } from "zod";
import { supabase, TABLES, COLUMNS } from "@/app/lib/db/client";
import { runScenario, runAllScenarios, SimulationInputs } from "@/app/lib/formulas/scenarios";

// ─── INPUT VALIDATION ────────────────────────────────────────────────────────
const SimulateSchema = z.object({
  scenarioId: z.string().optional(),          // omit = run all 20
  inputs: z.object({
    waitToleranceHours:  z.number().min(0).max(6).default(2),
    pickupFlex:          z.number().min(0).max(4).default(1),
    deliveryFlex:        z.number().min(0).max(4).default(1),
    domicilePull:        z.enum(["weak","moderate","strong","custom"]).default("moderate"),
    startPolicy:         z.enum(["rolling","static","hybrid"]).default("rolling"),
    riskMode:            z.enum(["aggressive","balanced","conservative"]).default("balanced"),
    planningHorizon:     z.enum(["24h","48h","5days"]).default("48h"),
    trafficMultiplier:   z.number().min(1.0).max(2.0).default(1.0),
  }),
  includeItinerary: z.boolean().optional().default(false),
  itineraryLimit: z.number().int().min(1).max(1000).optional().default(200),
  itineraryLimitPerScenario: z.number().int().min(1).max(500).optional().default(50),
  applyAssignments: z.boolean().optional().default(false),
  assignmentLimitPerScenario: z.number().int().min(1).max(1000).optional().default(200),
  saveRun: z.boolean().default(false),        // persist to DB
  runName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SimulateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const {
      scenarioId,
      inputs,
      saveRun,
      runName,
      includeItinerary,
      itineraryLimit,
      itineraryLimitPerScenario,
      applyAssignments,
      assignmentLimitPerScenario,
    } = parsed.data;
    const simInputs = inputs as SimulationInputs;

    // ─── RUN SIMULATION ──────────────────────────────────────────────────────
    const startTime = Date.now();
    let results;

    if (scenarioId) {
      // Single scenario
      const delta = runScenario(scenarioId, simInputs);
      results = [{ scenarioId, ...delta }];
    } else {
      // All 20 scenarios
      results = runAllScenarios(simInputs);
    }

    const executionMs = Date.now() - startTime;

    // ─── AGGREGATE SUMMARY ───────────────────────────────────────────────────
    const summary = {
      totalSavings:     results.reduce((a, r) => a + (r.savings || 0), 0),
      totalTrucksSaved: results.reduce((a, r) => a + (r.trucksSaved || 0), 0),
      totalWaitAdded:   results.reduce((a, r) => a + (r.waitAddedHours || 0), 0),
      p1Savings:        results.filter(r => r.problemType === "P1").reduce((a,r) => a + (r.savings||0), 0),
      p2Savings:        results.filter(r => r.problemType === "P2").reduce((a,r) => a + (r.savings||0), 0),
      p3Savings:        results.filter(r => r.problemType === "P3").reduce((a,r) => a + (r.savings||0), 0),
      scenariosRun:     results.length,
      executionMs,
    };

    // ─── ITINERARY DATA (optional, scenario-only) ─────────────────────────────
    let itinerary = undefined;
    let itineraryCount = undefined;
    let itineraryByScenario = undefined;
    let assignmentSummary = undefined;
    if (includeItinerary && scenarioId) {
      try {
        const col = COLUMNS.loads;
        const selectLoads = [
          `loadId:${col.loadId}`,
          `scenarioId:${col.scenarioId}`,
          `dayOfWeek:${col.dayOfWeek}`,
          `originCity:${col.originCity}`,
          `destinationCity:${col.destinationCity}`,
          `corridor:${col.corridor}`,
          `distanceMiles:${col.distanceMiles}`,
          `equipmentRequired:${col.equipmentRequired}`,
          `weightLbs:${col.weightLbs}`,
          `commodity:${col.commodity}`,
          `pickupWindowOpen:${col.pickupWindowOpen}`,
          `pickupWindowClose:${col.pickupWindowClose}`,
          `deliveryWindowOpen:${col.deliveryWindowOpen}`,
          `deliveryWindowClose:${col.deliveryWindowClose}`,
          `transitTimeHours:${col.transitTimeHours}`,
          `priority:${col.priority}`,
          `ratePerMile:${col.ratePerMile}`,
          `totalRevenue:${col.totalRevenue}`,
          `assignedTruckId:${col.assignedTruckId}`,
          `assignedDriverId:${col.assignedDriverId}`,
          `status:${col.status}`,
          `pairingCandidateId:${col.pairingCandidateId}`,
          `pairingGapHours:${col.pairingGapHours}`,
          `pairingDistanceMiles:${col.pairingDistanceMiles}`,
          `domicileDistanceMiles:${col.domicileDistanceMiles}`,
          `hosRequiredHours:${col.hosRequiredHours}`,
          `secondTruckCost:${col.secondTruckCost}`,
          `waitCostPerHour:${col.waitCostPerHour}`,
        ].join(",");

        const { data, error, count } = await supabase
          .from(TABLES.loads)
          .select(selectLoads, { count: "exact" })
          .eq(col.scenarioId, scenarioId)
          .order(col.loadId, { ascending: true })
          .limit(itineraryLimit);
        if (error) throw error;
        itinerary = data || [];
        itineraryCount = count || itinerary.length;
      } catch (itErr) {
        console.warn("[simulate] itinerary fetch failed (non-fatal):", itErr);
      }
    } else if (includeItinerary && !scenarioId) {
      try {
        const col = COLUMNS.loads;
        const selectLoads = [
          `loadId:${col.loadId}`,
          `scenarioId:${col.scenarioId}`,
          `dayOfWeek:${col.dayOfWeek}`,
          `originCity:${col.originCity}`,
          `destinationCity:${col.destinationCity}`,
          `corridor:${col.corridor}`,
          `distanceMiles:${col.distanceMiles}`,
          `equipmentRequired:${col.equipmentRequired}`,
          `weightLbs:${col.weightLbs}`,
          `commodity:${col.commodity}`,
          `pickupWindowOpen:${col.pickupWindowOpen}`,
          `pickupWindowClose:${col.pickupWindowClose}`,
          `deliveryWindowOpen:${col.deliveryWindowOpen}`,
          `deliveryWindowClose:${col.deliveryWindowClose}`,
          `transitTimeHours:${col.transitTimeHours}`,
          `priority:${col.priority}`,
          `ratePerMile:${col.ratePerMile}`,
          `totalRevenue:${col.totalRevenue}`,
          `assignedTruckId:${col.assignedTruckId}`,
          `assignedDriverId:${col.assignedDriverId}`,
          `status:${col.status}`,
          `pairingCandidateId:${col.pairingCandidateId}`,
          `pairingGapHours:${col.pairingGapHours}`,
          `pairingDistanceMiles:${col.pairingDistanceMiles}`,
          `domicileDistanceMiles:${col.domicileDistanceMiles}`,
          `hosRequiredHours:${col.hosRequiredHours}`,
          `secondTruckCost:${col.secondTruckCost}`,
          `waitCostPerHour:${col.waitCostPerHour}`,
        ].join(",");

        const scenarioIds = results.map((r) => r.scenarioId);
        const entries = await Promise.all(
          scenarioIds.map(async (id) => {
            const { data, error, count } = await supabase
              .from(TABLES.loads)
              .select(selectLoads, { count: "exact" })
              .eq(col.scenarioId, id)
              .order(col.loadId, { ascending: true })
              .limit(itineraryLimitPerScenario);
            if (error) throw error;
            return [
              id,
              {
                total: count || (data || []).length,
                items: data || [],
              },
            ];
          })
        );

        itineraryByScenario = Object.fromEntries(entries);
      } catch (itErr) {
        console.warn("[simulate] itinerary fetch failed (non-fatal):", itErr);
      }
    }

    // ─── ASSIGN DRIVERS TO LOADS (optional) ───────────────────────────────────
    if (applyAssignments) {
      try {
        const loadCol = COLUMNS.loads;
        const driverCol = COLUMNS.drivers;
        const truckCol = COLUMNS.trucks;

        const { data: driverRows, error: driverError } = await supabase
          .from(TABLES.drivers)
          .select(
            `driverId:${driverCol.driverId},assignedTruckId:${driverCol.assignedTruckId}`
          );
        if (driverError) throw driverError;

        const { data: truckRows, error: truckError } = await supabase
          .from(TABLES.trucks)
          .select(`truckId:${truckCol.truckId},equipmentType:${truckCol.equipmentType}`);
        if (truckError) throw truckError;

        const truckEquipment = new Map(
          (truckRows || []).map((t: any) => [t.truckId, t.equipmentType])
        );

        const driversByEquipment = new Map<string, { driverId: string; truckId: string }[]>();
        for (const d of driverRows || []) {
          const equip = truckEquipment.get(d.assignedTruckId);
          if (!equip) continue;
          if (!driversByEquipment.has(equip)) driversByEquipment.set(equip, []);
          driversByEquipment.get(equip)!.push({
            driverId: d.driverId,
            truckId: d.assignedTruckId,
          });
        }

        const roundRobinIndex = new Map<string, number>();
        const scenarioIds = scenarioId ? [scenarioId] : results.map((r) => r.scenarioId);
        const perScenario = {};
        let totalUpdated = 0;

        for (const id of scenarioIds) {
          const { data: loadRows, error: loadError } = await supabase
            .from(TABLES.loads)
            .select(
              `loadId:${loadCol.loadId},equipmentRequired:${loadCol.equipmentRequired}`
            )
            .eq(loadCol.scenarioId, id)
            .order(loadCol.loadId, { ascending: true })
            .limit(assignmentLimitPerScenario);
          if (loadError) throw loadError;

          const updates = [];
          for (const l of loadRows || []) {
            const pool = driversByEquipment.get(l.equipmentRequired) || [];
            if (!pool.length) continue;
            const idx = roundRobinIndex.get(l.equipmentRequired) || 0;
            const driver = pool[idx % pool.length];
            roundRobinIndex.set(l.equipmentRequired, idx + 1);
            updates.push({
              [loadCol.loadId]: l.loadId,
              [loadCol.assignedDriverId]: driver.driverId,
              [loadCol.assignedTruckId]: driver.truckId,
            });
          }

          let updated = 0;
          const chunkSize = 200;
          for (let i = 0; i < updates.length; i += chunkSize) {
            const chunk = updates.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase
              .from(TABLES.loads)
              .upsert(chunk, { onConflict: loadCol.loadId });
            if (upsertError) throw upsertError;
            updated += chunk.length;
          }

          perScenario[id] = { updated, sampled: (loadRows || []).length };
          totalUpdated += updated;
        }

        assignmentSummary = {
          scenariosAssigned: scenarioIds.length,
          totalUpdated,
          perScenario,
          assignmentLimitPerScenario,
        };
      } catch (assignErr) {
        console.warn("[simulate] assignment failed (non-fatal):", assignErr);
      }
    }

    // ─── PERSIST TO DB (optional) ─────────────────────────────────────────────
    if (saveRun && scenarioId) {
      try {
        const r = results[0];
        const col = COLUMNS.simulationRuns;
        const { error } = await supabase.from(TABLES.simulationRuns).insert({
          [col.scenarioId]: scenarioId,
          [col.runName]: runName || `Run ${new Date().toISOString()}`,
          [col.inputs]: inputs as any,
          [col.results]: r as any,
          [col.baselineCost]: r.baselineCost || 0,
          [col.vetraCost]: r.vetraCost    || 0,
          [col.savings]: r.savings      || 0,
          [col.trucksSaved]: r.trucksSaved  || 0,
          [col.waitAddedHours]: r.waitAddedHours || 0,
          [col.scheduleRisk]: r.scheduleRiskDelta || 0,
          [col.pairingRate]: r.pairingRate ? parseFloat(r.pairingRate) : null,
          [col.driftMiles]: r.endOfWeekDrift || null,
          [col.utilizationPct]: r.utilization ? parseFloat(r.utilization) : null,
        });
        if (error) throw error;
      } catch (dbErr) {
        console.warn("[simulate] DB save failed (non-fatal):", dbErr);
      }
    }

    return NextResponse.json({
      success:     true,
      summary,
      results,
      itinerary,
      itineraryCount,
      itineraryByScenario,
      assignmentSummary,
      inputs:      simInputs,
      generatedAt: new Date().toISOString(),
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[POST /api/simulate]", err);
    return NextResponse.json(
      { success: false, error: "Simulation failed" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
