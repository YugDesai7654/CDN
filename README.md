# Distributed Edge-Cache & Traffic Management System (Simplified CDN)

A university Distributed Computing lab project that simulates how companies like **Netflix** and **Akamai** deliver content globally using edge caching, geographic routing, and cache invalidation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CDN Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Client ──► Traffic Manager (GSLB) ──► Best Edge Node          │
│                   :4001                    :3001-3003            │
│                                               │                 │
│                                    ┌──────────┤                 │
│                                    │  Cache   │                 │
│                                    │  HIT? ───► Serve fast      │
│                                    │  MISS ───► Origin :3000    │
│                                    └──────────┘                 │
│                                                                 │
│   Origin ──► Purge Service :4000 ──► Fan-out DELETE to edges    │
│   (on file update)                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Components

| Component | Port | Role |
|---|---|---|
| **Origin Server** | 3000 | Single source of truth — stores and serves files |
| **Edge Node A** | 3001 | Caching proxy — Americas region |
| **Edge Node B** | 3002 | Caching proxy — Europe region |
| **Edge Node C** | 3003 | Caching proxy — Asia region |
| **Purge Service** | 4000 | Cache consistency — fan-out invalidation |
| **Traffic Manager** | 4001 | GSLB — routes clients to optimal edge |

## Technology Stack

- **Runtime**: Node.js 20+ with TypeScript (strict mode)
- **Framework**: Express.js
- **Cache**: In-memory `Map<string, CacheEntry>`
- **Communication**: REST HTTP/JSON
- **Containerization**: Docker + Docker Compose

## Quick Start

### Docker (recommended)

```bash
# Build and start all 6 services
docker-compose up --build

# In a separate terminal, run the client simulator
cd client-simulator
npm install && npm run dev
```

### Local Development

```bash
# Terminal 1 — Origin Server
cd origin-server && npm install && PORT=3000 PURGE_SERVICE_URL=http://localhost:4000 npm run dev

# Terminal 2 — Edge Node A
cd edge-node && npm install && PORT=3001 NODE_ID=A REGION=americas ORIGIN_URL=http://localhost:3000 MAX_CONNECTIONS=10 npm run dev

# Terminal 3 — Edge Node B
cd edge-node && PORT=3002 NODE_ID=B REGION=europe ORIGIN_URL=http://localhost:3000 MAX_CONNECTIONS=10 npm run dev

# Terminal 4 — Edge Node C
cd edge-node && PORT=3003 NODE_ID=C REGION=asia ORIGIN_URL=http://localhost:3000 MAX_CONNECTIONS=10 npm run dev

# Terminal 5 — Purge Service
cd purge-service && npm install && PORT=4000 EDGE_A_URL=http://localhost:3001 EDGE_B_URL=http://localhost:3002 EDGE_C_URL=http://localhost:3003 npm run dev

# Terminal 6 — Traffic Manager
cd traffic-manager && npm install && PORT=4001 EDGE_A_URL=http://localhost:3001 EDGE_B_URL=http://localhost:3002 EDGE_C_URL=http://localhost:3003 npm run dev

# Terminal 7 — Run simulation
cd client-simulator && npm install && npm run dev
```

## API Reference

### Origin Server (:3000)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/files/:filename` | Serve a file (2s artificial delay) |
| POST | `/files/:filename` | Create/update file + trigger purge |
| GET | `/health` | Health check |

### Edge Node (:3001-3003)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/files/:filename` | Serve file (HIT from cache / MISS from Origin) |
| DELETE | `/cache/:filename` | Purge single cached file |
| DELETE | `/cache` | Full cache wipe |
| GET | `/cache/stats` | Cache statistics |
| GET | `/health` | Health check (includes `busy` flag) |

### Traffic Manager (:4001)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/route` | Get best edge URL (set `X-Client-Location` header) |
| GET | `/health` | All edge node statuses |

### Purge Service (:4000)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/purge/:filename` | Purge file from all edges |
| POST | `/purge` | Full wipe all edges |
| GET | `/purge/history` | Last 50 purge operations |
| GET | `/health` | Health check |

## Key CDN Concepts Demonstrated

1. **Cold Path vs Warm Path** — Origin has 2s delay (cold); Edge cache serves in ~100ms (warm)
2. **Cache Hit / Miss** — `X-Cache: HIT|MISS` headers show cache behavior
3. **Push Invalidation** — Origin triggers purge on file update; edges evict stale content
4. **Partial Failure Tolerance** — `Promise.allSettled()` in purge fan-out
5. **Load Shedding** — Traffic Manager redirects away from busy nodes instead of queuing
6. **Geographic Routing** — Priority table maps client location → nearest edge PoP

## AWS Deployment

See `deploy/ec2-bootstrap.sh` for per-instance setup on Ubuntu 22.04 EC2.

## Project Structure

```
cdn-project/
├── origin-server/          # Source of truth (port 3000)
├── edge-node/              # Caching proxy × 3 instances (3001-3003)
├── traffic-manager/        # GSLB router (port 4001)
├── purge-service/          # Cache invalidation (port 4000)
├── client-simulator/       # End-to-end test script
├── deploy/                 # EC2 bootstrap script
├── docker-compose.yml      # Orchestrates all containers
└── README.md
```
