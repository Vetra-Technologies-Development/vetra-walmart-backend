# Vetra x Walmart — Next.js Backend

## Stack
- **Framework**: Next.js 14 (App Router, API Routes)
- **Database**: PostgreSQL via Prisma ORM
- **Language**: TypeScript
- **Validation**: Zod
- **Export**: csv-stringify + HTML report

---

## Project Structure

```
vetra-backend/
├── prisma/
│   └── schema.prisma          # DB schema — Truck, Driver, Load, Scenario, SimulationRun, VendorScorecard
├── scripts/
│   └── seed.ts                # Generates 500 trucks, 500 drivers, 10,000 loads, 20 scenarios
├── src/app/
│   ├── api/
│   │   ├── scenarios/         # GET /api/scenarios
│   │   ├── simulate/          # POST /api/simulate
│   │   ├── loads/             # GET /api/loads  (paginated, filtered)
│   │   ├── trucks/            # GET /api/trucks
│   │   ├── drivers/           # GET /api/drivers
│   │   ├── vendor-scorecard/  # GET /api/vendor-scorecard
│   │   └── export/
│   │       ├── csv/           # POST /api/export/csv
│   │       └── pdf/           # POST /api/export/pdf
│   └── lib/
│       ├── db/client.ts       # Prisma singleton
│       └── formulas/
│           └── scenarios.ts   # All 20 scenario formula engines
├── .env.example
└── package.json
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env.local
# Edit .env.local — set your DATABASE_URL
```

### 3. Start PostgreSQL (local dev)
```bash
# Option A — Docker (recommended)
docker run --name vetra-pg \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=vetra_walmart \
  -p 5432:5432 \
  -d postgres:16

# Option B — local PostgreSQL
createdb vetra_walmart
```

### 4. Run migrations
```bash
npm run db:generate   # generate Prisma client
npm run db:push       # push schema to DB (dev — no migration file)
# or for production:
npm run db:migrate    # creates migration files
```

### 5. Seed the database
```bash
npm run db:seed
# Generates: 20 scenarios, 500 trucks, 500 drivers, 10,000 loads, 1 vendor scorecard
# Takes ~60–90 seconds
```

### 6. Start development server
```bash
npm run dev
# Server runs at http://localhost:3000
```

---

## API Reference

### GET /api/scenarios
Returns all 20 scenario definitions.

**Query params:**
- `problem` — filter by `P1` | `P2` | `P3` | `Combined`

**Response:**
```json
{
  "success": true,
  "count": 20,
  "data": [{ "scenarioId": "SCN-01", "name": "...", "problemType": "P1", ... }]
}
```

---

### POST /api/simulate
Runs scenario formula engine, returns KPIs.

**Body:**
```json
{
  "scenarioId": "SCN-01",        // optional — omit to run all 20
  "inputs": {
    "waitToleranceHours":  2,    // 0–6
    "pickupFlex":          1,    // 0–4
    "deliveryFlex":        1,    // 0–4
    "domicilePull":        "moderate",   // weak | moderate | strong | custom
    "startPolicy":         "rolling",    // rolling | static | hybrid
    "riskMode":            "balanced",   // aggressive | balanced | conservative
    "planningHorizon":     "48h",        // 24h | 48h | 5days
    "trafficMultiplier":   1.0           // 1.0 | 1.2 | 1.5
  },
  "saveRun":  false,   // persist result to DB
  "runName":  "Test 1"
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalSavings": 840000,
    "totalTrucksSaved": 1240,
    "scenariosRun": 20,
    "executionMs": 4
  },
  "results": [{ "scenarioId": "SCN-01", "savings": 116976, "trucksSaved": 341, ... }]
}
```

---

### GET /api/loads
Paginated load data with filters.

**Query params:**
- `page` (default: 1)
- `limit` (default: 50, max: 500)
- `scenarioId` — e.g. `SCN-01`
- `status` — e.g. `Missed Pairing`
- `equipment` — e.g. `Reefer 53ft`
- `origin` — partial match, e.g. `Dallas`
- `dayOfWeek` — e.g. `Monday`
- `driverId` — e.g. `DRV-0001`
- `hasPairing` — `true` | `false`
- `sort` — field name (default: `loadId`)
- `order` — `asc` | `desc`

---

### GET /api/trucks
**Query params:** `homeDc`, `equipment`, `status`, `page`, `limit`

---

### GET /api/drivers
**Query params:** `homeDc`, `startPolicy`, `schedule`, `hosCycle`, `page`, `limit`

---

### GET /api/vendor-scorecard
Returns Walmart-facing vendor performance scorecard.

**Query params:** `loads` (default: 10000)

---

### POST /api/export/csv
**Body:** `{ "inputs": {...}, "type": "scenarios" }`
Returns: `text/csv` file download

---

### POST /api/export/pdf
**Body:** `{ "inputs": {...}, "title": "Report Title" }`
Returns: `text/html` report (print to PDF in browser)

---

## Deployment

### Azure App Service
```bash
# Build
npm run build

# Set environment variables in Azure Portal → Configuration
# DATABASE_URL = your Azure PostgreSQL connection string

# Deploy
az webapp up --name vetra-walmart-api --resource-group vetra-rg --runtime "NODE:20-lts"
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t vetra-walmart .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  vetra-walmart
```

---

## Quick Test (no DB required)

The `/api/simulate` and `/api/vendor-scorecard` endpoints work with zero DB setup —
they fall back to in-memory formula computation automatically.

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "waitToleranceHours": 2,
      "domicilePull": "moderate",
      "startPolicy": "hybrid",
      "riskMode": "balanced",
      "planningHorizon": "5days",
      "trafficMultiplier": 1.0,
      "pickupFlex": 1,
      "deliveryFlex": 1
    }
  }'
```
