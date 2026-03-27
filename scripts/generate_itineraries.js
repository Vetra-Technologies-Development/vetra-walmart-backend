#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Assign loads to drivers/trucks and generate 24h / 48h itineraries
const DIR = path.join(__dirname, '..', 'mock_data');
const trucks = JSON.parse(fs.readFileSync(path.join(DIR,'gen_trucks.json')));
const drivers = JSON.parse(fs.readFileSync(path.join(DIR,'gen_drivers.json')));
const loads = JSON.parse(fs.readFileSync(path.join(DIR,'gen_loads.json')));

function parseIso(s){ return new Date(s).getTime(); }
function fmtIso(ts){ return new Date(ts).toISOString(); }

// Build map of available drivers grouped by home DC and equipment
const driversByDc = new Map();
for(const d of drivers){
  if(!driversByDc.has(d.home_dc)) driversByDc.set(d.home_dc, []);
  driversByDc.get(d.home_dc).push(d);
}

// For simplicity, assign loads to nearest available driver at same DC when possible
const itineraries = new Map(); // driver_id -> { driver, truck, items[] }

// default window options
const WINDOWS = { '24h': 24*3600*1000, '48h': 48*3600*1000 };

function assign(windowKey='24h'){
  const windowMs = WINDOWS[windowKey];
  // sort loads by pickup time
  const sorted = loads.slice().sort((a,b)=> parseIso(a.pickupWindowOpen)-parseIso(b.pickupWindowOpen));

  for(const load of sorted){
    const pickTs = parseIso(load.pickupWindowOpen);
    // try drivers in origin DC
    const pool = driversByDc.get(load.originCity.split(',')[0].includes(' ')? load.originCity : load.originCity) || driversByDc.get(load.originCity) || [];
    // fallback to any driver
    const candidate = pool.length? pool[Math.floor(Math.random()*pool.length)] : drivers[Math.floor(Math.random()*drivers.length)];

    // ensure driver has itinerary object
    if(!itineraries.has(candidate.driver_id)){
      itineraries.set(candidate.driver_id, { driver: candidate, truckId: candidate.assigned_truck, items: [], windowKey });
    }

    const itin = itineraries.get(candidate.driver_id);

    // check driver schedule capacity within window: we'll ensure no overlapping pickups by time
    const last = itin.items.length? itin.items[itin.items.length-1] : null;
    if(last){
      const lastDeliveryFinish = parseIso(last.deliveryWindowClose);
      // if this pickup is before last delivery finish, skip (simple conflict check)
      if(pickTs < lastDeliveryFinish) continue;
    }

    // only assign if pickup is within the chosen window from now
    const now = Date.now();
    if(pickTs > now + windowMs) continue;

    // assign
    load.assignedDriverId = candidate.driver_id;
    load.assignedTruckId = candidate.assigned_truck;
    load.status = 'Assigned';

    itin.items.push(load);
  }

}

// create two sets of itineraries: 24h and 48h
assign('24h');
const itineraries24 = Array.from(itineraries.values()).map(i=>({ driver: i.driver.driver_id, truck: i.truckId, items: i.items }));

// reset assignments and rebuild for 48h
for(const l of loads){ l.assignedDriverId = null; l.assignedTruckId = null; l.status='Pending Pickup'; }
itineraries.clear();
assign('48h');
const itineraries48 = Array.from(itineraries.values()).map(i=>({ driver: i.driver.driver_id, truck: i.truckId, items: i.items }));

fs.writeFileSync(path.join(DIR,'itineraries_24h.json'), JSON.stringify(itineraries24, null, 2));
fs.writeFileSync(path.join(DIR,'itineraries_48h.json'), JSON.stringify(itineraries48, null, 2));
fs.writeFileSync(path.join(DIR,'gen_loads_assigned.json'), JSON.stringify(loads, null, 2));

// CSV exports
function toCSV(arr) {
  if (!arr.length) return '';
  const keys = Object.keys(arr[0]);
  const lines = [keys.join(',')];
  for (const o of arr) {
    lines.push(keys.map(k => {
      const v = o[k] === null || o[k] === undefined ? '' : String(o[k]).replace(/"/g,'""');
      return `"${v}"`;
    }).join(','));
  }
  return lines.join('\n');
}

// Flatten itineraries: one row per assignment
const flat24 = [];
for (const it of itineraries24) {
  for (const item of it.items) {
    flat24.push({ driver: it.driver, truck: it.truck, load_id: item.load_id, pickup: item.pickupWindowOpen, delivery: item.deliveryWindowOpen, status: item.status });
  }
}

const flat48 = [];
for (const it of itineraries48) {
  for (const item of it.items) {
    flat48.push({ driver: it.driver, truck: it.truck, load_id: item.load_id, pickup: item.pickupWindowOpen, delivery: item.deliveryWindowOpen, status: item.status });
  }
}

fs.writeFileSync(path.join(DIR,'itineraries_24h.csv'), toCSV(flat24));
fs.writeFileSync(path.join(DIR,'itineraries_48h.csv'), toCSV(flat48));
fs.writeFileSync(path.join(DIR,'gen_loads_assigned.csv'), toCSV(loads.map(l => ({ load_id: l.load_id, originCity: l.originCity, destinationCity: l.destinationCity, pickupWindowOpen: l.pickupWindowOpen, deliveryWindowOpen: l.deliveryWindowOpen, assignedDriverId: l.assignedDriverId, assignedTruckId: l.assignedTruckId, status: l.status }))));

console.log('Itineraries written:', path.join(DIR,'itineraries_24h.json'), path.join(DIR,'itineraries_24h.csv'));
