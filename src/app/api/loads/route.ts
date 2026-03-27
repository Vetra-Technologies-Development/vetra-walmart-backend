// src/app/api/loads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { supabase, TABLES, COLUMNS } from "@/app/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // ─── PAGINATION ──────────────────────────────────────────────────────────
    const page     = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit    = Math.min(500, parseInt(searchParams.get("limit") || "50"));
    const skip     = (page - 1) * limit;

    // ─── FILTERS ─────────────────────────────────────────────────────────────
    const scenarioId    = searchParams.get("scenarioId")    || undefined;
    const status        = searchParams.get("status")        || undefined;
    const equipment     = searchParams.get("equipment")     || undefined;
    const origin        = searchParams.get("origin")        || undefined;
    const dayOfWeek     = searchParams.get("dayOfWeek")     || undefined;
    const driverId      = searchParams.get("driverId")      || undefined;
    const hasPairing    = searchParams.get("hasPairing");   // "true" | "false"

    // ─── SORTING ─────────────────────────────────────────────────────────────
    const sortFieldRaw = searchParams.get("sort") || "loadId";
    const sortDir = searchParams.get("order") === "desc" ? "desc" : "asc";
    const allowedSortFields = new Set([
      "loadId",
      "scenarioId",
      "dayOfWeek",
      "originCity",
      "destinationCity",
      "distanceMiles",
      "equipmentRequired",
      "priority",
      "ratePerMile",
      "totalRevenue",
      "status",
      "pickupWindowOpen",
      "deliveryWindowOpen",
    ]);
    const sortField = allowedSortFields.has(sortFieldRaw) ? sortFieldRaw : "loadId";

    // ─── QUERY ───────────────────────────────────────────────────────────────
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

    let query = supabase
      .from(TABLES.loads)
      .select(selectLoads, { count: "exact" })
      .order(
        (COLUMNS.loads as Record<string, string>)[sortField] || col.loadId,
        { ascending: sortDir !== "desc" }
      )
      .range(skip, skip + limit - 1);

    if (scenarioId) query = query.eq(col.scenarioId, scenarioId);
    if (status) query = query.eq(col.status, status);
    if (equipment) query = query.eq(col.equipmentRequired, equipment);
    if (dayOfWeek) query = query.eq(col.dayOfWeek, dayOfWeek);
    if (driverId) query = query.eq(col.assignedDriverId, driverId);
    if (origin) query = query.ilike(col.originCity, `%${origin}%`);
    if (hasPairing === "true") query = query.not(col.pairingCandidateId, "is", null);
    if (hasPairing === "false") query = query.is(col.pairingCandidateId, null);

    const { data: loads, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      success:    true,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext:    page * limit < (count || 0),
        hasPrev:    page > 1,
      },
      filters: { scenarioId, status, equipment, origin, dayOfWeek, hasPairing },
      data:    loads,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[GET /api/loads]", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch loads" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
