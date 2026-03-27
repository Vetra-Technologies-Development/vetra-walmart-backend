// src/app/api/drivers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/app/api/_cors";
import { supabase, TABLES, COLUMNS } from "@/app/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page        = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit       = Math.min(500, parseInt(searchParams.get("limit") || "100"));
    const skip        = (page - 1) * limit;
    const homeDc      = searchParams.get("homeDc")      || undefined;
    const policy      = searchParams.get("startPolicy") || undefined;
    const schedule    = searchParams.get("schedule")    || undefined;
    const hosCycle    = searchParams.get("hosCycle")    || undefined;

    const col = COLUMNS.drivers;
    const selectDrivers = [
      `driverId:${col.driverId}`,
      `assignedTruckId:${col.assignedTruckId}`,
      `homeDc:${col.homeDc}`,
      `startTimePolicy:${col.startTimePolicy}`,
      `scheduleType:${col.scheduleType}`,
      `hosCycle:${col.hosCycle}`,
      `name:${col.name}`,
    ].join(",");

    let query = supabase
      .from(TABLES.drivers)
      .select(selectDrivers, { count: "exact" })
      .order(col.driverId, { ascending: true })
      .range(skip, skip + limit - 1);

    if (homeDc) query = query.eq(col.homeDc, homeDc);
    if (policy) query = query.eq(col.startTimePolicy, policy);
    if (schedule) query = query.eq(col.scheduleType, schedule);
    if (hosCycle) query = query.eq(col.hosCycle, hosCycle);

    const { data: driverRows, error, count } = await query;
    if (error) throw error;

    const truckIds = (driverRows || [])
      .map((d: any) => d.assignedTruckId)
      .filter(Boolean);

    let truckMap = new Map<string, any>();
    if (truckIds.length) {
    const colTrucks = COLUMNS.trucks;
    const { data: truckRows, error: truckError } = await supabase
        .from(TABLES.trucks)
        .select(
          `truckId:${colTrucks.truckId},equipmentType:${colTrucks.equipmentType},statusMonday:${colTrucks.statusMonday}`
        )
        .in(colTrucks.truckId, truckIds);
      if (truckError) throw truckError;
      truckMap = new Map((truckRows || []).map((t: any) => [t.truckId, t]));
    }

    const drivers = (driverRows || []).map((d: any) => ({
      ...d,
      truck: d.assignedTruckId ? truckMap.get(d.assignedTruckId) || null : null,
    }));

    // Driver summary stats
    const { data: allDrivers, error: summaryError } = await supabase
      .from(TABLES.drivers)
      .select(
        `startTimePolicy:${col.startTimePolicy},scheduleType:${col.scheduleType},hosCycle:${col.hosCycle},homeDc:${col.homeDc}`
      );
    if (summaryError) throw summaryError;

    const summaryRows = (allDrivers as Array<{
      startTimePolicy?: string;
      scheduleType?: string;
      hosCycle?: string;
      homeDc?: string;
    }>) || [];
    const summary = {
      total:        summaryRows.length,
      rolling:      summaryRows.filter(d => d.startTimePolicy === "Rolling").length,
      static0600:   summaryRows.filter(d => d.startTimePolicy === "Static-0600").length,
      static0800:   summaryRows.filter(d => d.startTimePolicy === "Static-0800").length,
      fiveDay:      summaryRows.filter(d => d.scheduleType === "5-day").length,
      fourDay:      summaryRows.filter(d => d.scheduleType === "4-day").length,
      regional:     summaryRows.filter(d => d.scheduleType === "Regional").length,
      cycle70hr:    summaryRows.filter(d => d.hosCycle === "70hr/8day").length,
      cycle60hr:    summaryRows.filter(d => d.hosCycle === "60hr/7day").length,
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
      data: drivers,
    }, { headers: corsHeaders });
  } catch (err) {
    console.error("[GET /api/drivers]", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch drivers" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
