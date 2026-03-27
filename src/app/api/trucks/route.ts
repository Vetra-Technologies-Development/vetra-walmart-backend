// src/app/api/trucks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { supabase, TABLES, COLUMNS } from "@/app/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page      = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit     = Math.min(500, parseInt(searchParams.get("limit") || "100"));
    const skip      = (page - 1) * limit;
    const homeDc    = searchParams.get("homeDc")    || undefined;
    const equipment = searchParams.get("equipment") || undefined;
    const status    = searchParams.get("status")    || undefined;

    const col = COLUMNS.trucks;
    const selectTrucks = [
      `truckId:${col.truckId}`,
      `equipmentType:${col.equipmentType}`,
      `statusMonday:${col.statusMonday}`,
      `homeDc:${col.homeDc}`,
    ].join(",");

    let query = supabase
      .from(TABLES.trucks)
      .select(selectTrucks, { count: "exact" })
      .order(col.truckId, { ascending: true })
      .range(skip, skip + limit - 1);

    if (homeDc) query = query.eq(col.homeDc, homeDc);
    if (equipment) query = query.eq(col.equipmentType, equipment);
    if (status) query = query.eq(col.statusMonday, status);

    const { data: truckRows, error, count } = await query;
    if (error) throw error;

    const truckIds = (truckRows || []).map((t: any) => t.truckId).filter(Boolean);
    let driverMap = new Map<string, any>();
    if (truckIds.length) {
    const colDrivers = COLUMNS.drivers;
    const { data: driverRows, error: driverError } = await supabase
        .from(TABLES.drivers)
        .select(
          `driverId:${colDrivers.driverId},name:${colDrivers.name},scheduleType:${colDrivers.scheduleType},assignedTruckId:${colDrivers.assignedTruckId}`
        )
        .in(colDrivers.assignedTruckId, truckIds);
      if (driverError) throw driverError;
      driverMap = new Map(
        (driverRows || []).map((d: any) => [d.assignedTruckId, d])
      );
    }

    const trucks = (truckRows || []).map((t: any) => ({
      ...t,
      driver: driverMap.get(t.truckId) || null,
    }));

    // Fleet summary stats
    const { data: allTrucks, error: summaryError } = await supabase
      .from(TABLES.trucks)
      .select(
        `equipmentType:${col.equipmentType},statusMonday:${col.statusMonday},homeDc:${col.homeDc}`
      );
    if (summaryError) throw summaryError;

    const summaryRows = allTrucks || [];
    const summary = {
      total:         summaryRows.length,
      available:     summaryRows.filter(t => t.statusMonday === "Available").length,
      inMaintenance: summaryRows.filter(t => t.statusMonday === "In Maintenance").length,
      reserved:      summaryRows.filter(t => t.statusMonday === "Reserved").length,
      dryVan:        summaryRows.filter(t => t.equipmentType.includes("Dry Van")).length,
      reefer:        summaryRows.filter(t => t.equipmentType.includes("Reefer")).length,
      flatbed:       summaryRows.filter(t => t.equipmentType.includes("Flatbed")).length,
    };

    return NextResponse.json({
      success: true,
      summary,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      data: trucks,
    }, { headers: corsHeaders });
  } catch (err) {
    console.error("[GET /api/trucks]", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trucks" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
