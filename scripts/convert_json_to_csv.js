// Convert mock_data JSON files to CSV for Supabase import
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.join(__dirname, "..", "mock_data");
const OUT_DIR = path.join(BASE_DIR, "csv");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    const arr = `{${value.map(v => String(v).replace(/"/g, '""')).join(",")}}`;
    return `"${arr}"`;
  }
  if (typeof value === "object") return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows, filePath) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

function withTimestamps(rows, timestamp) {
  return rows.map((r) => ({
    ...r,
    created_at: r.created_at ?? timestamp,
    updated_at: r.updated_at ?? timestamp,
  }));
}

function main() {
  ensureDir(OUT_DIR);

  const trucks = JSON.parse(fs.readFileSync(path.join(BASE_DIR, "trucks.json"), "utf8"));
  const drivers = JSON.parse(fs.readFileSync(path.join(BASE_DIR, "drivers.json"), "utf8"));
  const scenarios = JSON.parse(fs.readFileSync(path.join(BASE_DIR, "scenarios.json"), "utf8"));

  const now = new Date().toISOString().replace("T", " ").replace("Z", "");

  const loads = [];
  for (let i = 1; i <= 10; i++) {
    const batchPath = path.join(BASE_DIR, `loads_batch_${i}.json`);
    const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
    loads.push(
      ...batch.map((l) => {
        const out = { ...l };
        out.assigned_truck_id = l.assigned_truck ?? null;
        out.assigned_driver_id = l.assigned_driver ?? null;
        delete out.assigned_truck;
        delete out.assigned_driver;
        return out;
      })
    );
  }

  toCsv(withTimestamps(trucks, now), path.join(OUT_DIR, "walmart_trucks.csv"));
  toCsv(withTimestamps(drivers, now), path.join(OUT_DIR, "walmart_drivers.csv"));
  toCsv(scenarios, path.join(OUT_DIR, "walmart_scenarios.csv"));
  toCsv(withTimestamps(loads, now), path.join(OUT_DIR, "walmart_loads.csv"));

  // Alternate loads CSV without assigned_driver_id if table lacks it
  const loadsNoDriver = loads.map((l) => {
    const out = { ...l };
    delete out.assigned_driver_id;
    return out;
  });
  toCsv(withTimestamps(loadsNoDriver, now), path.join(OUT_DIR, "walmart_loads_no_driver.csv"));

  // Variants without created_at/updated_at (for tables without those columns)
  const stripTimestamps = (rows) =>
    rows.map((r) => {
      const out = { ...r };
      delete out.created_at;
      delete out.updated_at;
      return out;
    });

  const stripEndorsements = (rows) =>
    rows.map((r) => {
      const out = { ...r };
      delete out.endorsements;
      return out;
    });

  toCsv(stripTimestamps(trucks), path.join(OUT_DIR, "walmart_trucks_no_ts.csv"));
  toCsv(stripTimestamps(drivers), path.join(OUT_DIR, "walmart_drivers_no_ts.csv"));
  toCsv(stripTimestamps(loads), path.join(OUT_DIR, "walmart_loads_no_ts.csv"));
  toCsv(stripTimestamps(loadsNoDriver), path.join(OUT_DIR, "walmart_loads_no_driver_no_ts.csv"));
  toCsv(stripEndorsements(stripTimestamps(drivers)), path.join(OUT_DIR, "walmart_drivers_no_ts_no_endorsements.csv"));
  toCsv(stripEndorsements(withTimestamps(drivers, now)), path.join(OUT_DIR, "walmart_drivers_no_endorsements.csv"));

  // Variant without pairing_candidate_id (to avoid self-FK import issues)
  const loadsNoPairing = loadsNoDriver.map((l) => {
    const out = { ...l };
    delete out.pairing_candidate_id;
    delete out.pairing_gap_hours;
    delete out.pairing_distance_miles;
    return out;
  });
  toCsv(stripTimestamps(loadsNoPairing), path.join(OUT_DIR, "walmart_loads_no_driver_no_pairing_no_ts.csv"));

  console.log("CSV files written to", OUT_DIR);
}

main();
