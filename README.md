# 🌍 Distributed Edge-Cache & Traffic Management System (CDN)

**Subject:** Distributed Computing Lab Project  
**Inspiration:** How Netflix and Akamai deliver content globally  
**Tech Stack:** Node.js · TypeScript · Express.js · Next.js 14 · Docker · Docker Compose · AWS EC2  

---

## 📋 1. Project Overview

**What this project simulates:**
This project simulates a globally distributed Content Delivery Network (CDN), mimicking the core architecture of industry giants like Akamai, Cloudflare, and Netflix Open Connect. It features a central authoritative Origin Server and multiple geographically distributed Edge Nodes acting as caching proxies.

**Why CDNs exist:**
The fundamental problem CDNs solve is the speed of light and network congestion. If a user in Asia requests a video from a server in New York, the data must travel across oceanic fiber cables, resulting in high latency, buffering, and poor user experience. CDNs solve this by placing "points of presence" (PoPs) — Edge Nodes — geographically closer to users, caching content locally.

**What problem this project solves:**
This system solves the latency problem by caching multimodal content (text, images, audio, video) at edge nodes. It also solves the problem of high server load by distributing traffic, implementing load shedding during peak times, and ensuring system availability even when individual nodes fail.

**When a user requests a file:**
When a user requests a file, the Next.js frontend asks the Traffic Manager (GSLB) for the best Edge Node based on the user's geographic location. The user is then routed to that Edge Node. If the Edge Node has the file (**Cache HIT**), it serves it instantly (~100ms). If it doesn't (**Cache MISS**), it pulls it from the Origin Server over a simulated high-latency backbone (~2000ms), stores it in memory, and serves it to the user. Subsequent requests are then served instantly from the edge.

---

## 🏗 2. System Architecture

### Component Architecture & Data Flow

```text
                                   +---------------------+
                                   |                     |
                                   |    Client Browser   |
                                   |                     |
                                   +---------+-----------+
                                             |
                                             v
                                   +---------------------+
                                   | Next.js Frontend    |
                                   |     (Port 3004)     |
                                   +--+----+------+---+--+
                                      |    |      |   |
                       +--------------+    |      |   +-------------------+
                       |                   |      |                       |
                       v                   |      v                       v
            +--------------------+         |   +--------------------+ +--------------------+
            | Traffic Manager    |         |   | Purge Service      | | Origin Server      |
            |   GSLB (Port 4001) |         |   |     (Port 4000)    | |     (Port 3000)    |
            +---------+----------+         |   +---------+----------+ +---------+----------+
                      |                    |             |                      ^
                      | Returns best       |             | Fanout DELETE        |
                      | Edge URL           |             | to ALL edges         |
                      v                    |             v                      |
            +--------------------+         |   +--------------------+          |
            | Edge Node A (3001) |         |   | Edge Node A (3001) |          |
            | Edge Node B (3002) +---------+   | Edge Node B (3002) |          |
            | Edge Node C (3003) |             | Edge Node C (3003) |          |
            +---------+----------+             +--------------------+          |
                      |                                                        |
                      |  Cache MISS → Fetch from Origin (2000ms)              |
                      +--------------------------------------------------------+
                         Origin streams file back → Edge caches it
```

**Data Flow Summary:**
1. **Client Browser** → **Next.js Frontend** (port 3004)
2. **Next.js** → **Traffic Manager** (port 4001) — asks for best edge
3. **Next.js** → **Edge Node A/B/C** (ports 3001/3002/3003) — fetches file
4. **Next.js** → **Purge Service** (port 4000) — admin cache operations
5. **Next.js** → **Origin Server** (port 3000) — file listing, uploads
6. **Edge Nodes** → **Origin Server** — cache miss pull
7. **Origin Server** → **Purge Service** — auto-invalidation trigger after file update
8. **Purge Service** → **Edge Nodes** — fanout DELETE to all edges

### Docker Network Diagram (`cdn-network`)

```text
+------------------------------------------------------------------------------------------------------+
|                                       Docker Network: cdn-network                                    |
|                                       driver: bridge                                                 |
|                                                                                                      |
|  +---------------------+  +---------------------+  +---------------------+  +---------------------+ |
|  |   origin-server     |  |    edge-node-a      |  |    edge-node-b      |  |    edge-node-c      | |
|  | Container: 3000     |  | Container: 3001     |  | Container: 3002     |  | Container: 3003     | |
|  | Host:      3000     |  | Host:      3001     |  | Host:      3002     |  | Host:      3003     | |
|  | DNS: origin-server  |  | DNS: edge-node-a    |  | DNS: edge-node-b    |  | DNS: edge-node-c    | |
|  +---------------------+  +---------------------+  +---------------------+  +---------------------+ |
|                                                                                                      |
|  +---------------------+  +---------------------+  +---------------------+                          |
|  |   purge-service     |  |  traffic-manager    |  |   cdn-frontend      |                          |
|  | Container: 4000     |  | Container: 4001     |  | Container: 3004     |                          |
|  | Host:      4000     |  | Host:      4001     |  | Host:      3004     |                          |
|  | DNS: purge-service  |  | DNS: traffic-manager|  | DNS: cdn-frontend   |                          |
|  +---------------------+  +---------------------+  +---------------------+                          |
+------------------------------------------------------------------------------------------------------+
```

---

## ⚙️ 3. Component Deep-Dive

### 3.1 Origin Server (port 3000)

- **Role:** The single source of truth for the CDN. It holds the authoritative copy of every file in its local `/app/data/` filesystem directory. Pre-seeds sample text files on first boot.
- **Port:** `3000`
- **API Endpoints:**

  | Method | Path | Description |
  |--------|------|-------------|
  | `GET` | `/files` | Lists all files with metadata (filename, contentType, mediaType, size, lastModified) |
  | `GET` | `/files/:filename` | Streams a binary file with a forced **2000ms** delay (cold path) |
  | `POST` | `/files/upload` | Accepts `multipart/form-data` via multer, saves to disk, auto-triggers purge |
  | `POST` | `/files/:filename` | Creates/updates a **text** file with `{ content: "..." }` body, auto-triggers purge |
  | `GET` | `/health` | Returns `{ status: "ok", component: "origin-server" }` |

- **Required ENV VARS:** `PORT`, `PURGE_SERVICE_URL`
- **Key Internal Logic:**
  - **2000ms artificial delay** on `GET /files/:filename` via `setTimeout` — simulates backbone latency of the "cold path" so the CDN's value is immediately visible when comparing edge vs origin fetch times.
  - **multer** with `diskStorage` for binary uploads — writes directly to disk, avoiding heap memory exhaustion for large video files.
  - **`fs.createReadStream()`** for streaming responses — memory-efficient delivery of large files.
  - **Fire-and-forget purge** — after every file create/update, the Origin sends an async POST to the Purge Service. It does NOT await the result, so the client response is never blocked by edge purge latency.
  - **MIME allowlist** — strict validation rejects executables, scripts, and unsupported types.
  - **Per-category size limits** — text ≤ 2MB, image ≤ 5MB, audio ≤ 20MB, video ≤ 100MB.
- **If it goes down:** Edge Nodes continue serving cached content (Cache HITs succeed). New uploads fail. Cache MISSes return 502 errors. The CDN degrades gracefully.

### 3.2 Edge Node A / B / C (ports 3001 / 3002 / 3003)

- **Role:** Caching proxies at global Points of Presence (PoPs). Same codebase, differentiated entirely by ENV VARS (`NODE_ID`, `REGION`, `PORT`).
- **Ports:** `3001` (Americas/A), `3002` (Europe/B), `3003` (Asia/C)
- **API Endpoints:**

  | Method | Path | Description |
  |--------|------|-------------|
  | `GET` | `/files/:filename` | Serves from cache (HIT) or fetches from Origin (MISS), returns raw binary |
  | `DELETE` | `/cache/:filename` | Removes a single file from this node's in-memory cache |
  | `DELETE` | `/cache` | Full cache wipe — clears all entries |
  | `GET` | `/cache/stats` | Returns cache inventory, entries with metadata, and active connections |
  | `GET` | `/health` | Returns liveness, `busy` flag, `activeConnections`, `cacheSize` |

- **Required ENV VARS:** `PORT`, `NODE_ID`, `REGION`, `ORIGIN_URL`, `MAX_CONNECTIONS`
- **Key Internal Logic:**
  - **In-memory `Map<string, CacheEntry>`** — the cache store. Each `CacheEntry` holds a `Buffer` (not a string) enabling caching of ALL content types (text + binary). Each node has its own independent Map — fetching from Edge A does NOT warm Edge B's cache.
  - **Cache HIT path** — increments `hits` counter, adds a 100ms delay (simulates local PoP delivery), sets headers `X-Cache: HIT`, `X-Cache-Age`, `X-Served-By`, `X-Region`, sends raw buffer via `res.end(cached.data)`.
  - **Cache MISS path** — fetches from Origin via `node-fetch`, reads response as `ArrayBuffer`, converts to `Buffer`, stores in Map, streams to client with `X-Cache: MISS`.
  - **`activeConnections` tracking** — Express middleware increments on request, decrements on `res.on('finish')`. When `activeConnections > MAX_CONNECTIONS`, the `/health` endpoint reports `busy: true`.
  - **100ms warm path delay** — simulates realistic local data-center disk/memory I/O at the PoP, not zero latency.
- **If one goes down:** Traffic Manager detects via health polling within 15 seconds. Subsequent routing requests skip the dead node and use the fallback chain.

### 3.3 Traffic Manager / GSLB (port 4001)

- **Role:** Global Server Load Balancer (GSLB). Simulates GeoDNS/Anycast routing by directing clients to the optimal Edge Node based on location, health, and load.
- **Port:** `4001`
- **API Endpoints:**

  | Method | Path | Description |
  |--------|------|-------------|
  | `GET` | `/route` | Returns the best edge URL based on `X-Client-Location` header |
  | `GET` | `/health` | Returns TM status and last-known status of all edge nodes |

- **Required ENV VARS:** `PORT`, `EDGE_A_URL`, `EDGE_B_URL`, `EDGE_C_URL`
- **Key Internal Logic:**
  - **`X-Client-Location` header routing** — the frontend sends `americas`, `europe`, or `asia`.
  - **Priority table:**
    ```
    americas → [A, B, C]    (prefer Americas edge, fallback to Europe, then Asia)
    europe  → [B, A, C]    (prefer Europe edge, fallback to Americas, then Asia)
    asia    → [C, B, A]    (prefer Asia edge, fallback to Europe, then Americas)
    ```
  - **Load shedding logic** — for each node in priority order, the TM checks `healthy && !busy`. If the primary is busy, it skips to the next. If ALL nodes are busy, the TM routes to the primary anyway but sets `X-Load-Shed: true` response header.
  - **15-second background health polling** via `setInterval(pollEdgeHealth, 15_000)` — pings `GET /health` on every edge with a 5s abort timeout. One initial poll runs before accepting traffic.
  - **Round-robin for unknown locations** — if `X-Client-Location` is missing or unrecognized, distributes evenly across healthy nodes using a rotating index.
  - In production CDNs, this is implemented via **Anycast DNS** where the DNS system itself returns the IP of the nearest PoP. Here we simulate it with an HTTP API.
- **If it goes down:** Total routing failure. Clients can still directly hit edge nodes if they know the URL, but the frontend relies on the TM for discovery.

### 3.4 Purge Service (port 4000)

- **Role:** Cache Consistency Controller. Solves the stale cache problem using a broadcast/fanout invalidation pattern.
- **Port:** `4000`
- **API Endpoints:**

  | Method | Path | Description |
  |--------|------|-------------|
  | `POST` | `/purge/:filename` | Purges a specific file from all 3 edge caches via parallel DELETE fanout |
  | `POST` | `/purge` | Full cache wipe across all edges |
  | `GET` | `/purge/history` | Returns last 50 purge operations (FIFO) |
  | `GET` | `/health` | Returns `{ status: "ok", component: "purge-service", edgesConfigured: 3 }` |

- **Required ENV VARS:** `PORT`, `EDGE_A_URL`, `EDGE_B_URL`, `EDGE_C_URL`
- **Key Internal Logic:**
  - **The stale cache problem** — when the Origin updates a file, all 3 edges still have the old version in their Map. Without purging, users see outdated content.
  - **Broadcast/fanout pattern** — the `fanOutPurge()` function sends `DELETE /cache/:filename` to ALL edges simultaneously using `Promise.allSettled()`.
  - **Why `allSettled` not `all`** — `Promise.all()` rejects immediately if ANY promise rejects. If Edge B is temporarily down, using `Promise.all()` would fail the entire purge — meaning Edge A and C also wouldn't get purged. `Promise.allSettled()` guarantees ALL promises run to completion regardless of individual failures. This is **partial failure tolerance**.
  - **Per-node latency measurement** — each fanout records `Date.now()` before and after, reporting individual round-trip ms per node.
  - **Purge history** — stored in an in-memory array, capped at 50 entries. Oldest entries are shifted out (FIFO). Useful for debugging and the admin dashboard.
- **If it goes down:** File updates on the Origin will succeed, but edge caches won't be invalidated. Users will continue seeing stale content until the Purge Service comes back and a manual purge is triggered, or containers restart.

### 3.5 Next.js Frontend (port 3004)

- **Role:** The unified control panel and client simulator. Built with Next.js 14 App Router.
- **Port:** `3004`
- **Key Internal Logic:**
  - **App Router architecture** — uses `app/` directory with `page.tsx` files for `/login`, `/dashboard`, `/viewer`.
  - **Two user roles** — admin and user, with different route access.
  - **Cookie-based auth** — on login, sets a `HttpOnly` cookie named `cdn-role` with value `admin` or `user`. Credentials are hardcoded (`admin/admin123`, `user/user123`) in `lib/constants.ts`.
  - **Next.js Middleware route protection** — `middleware.ts` intercepts requests to `/dashboard/**` (admin only), `/viewer/**` (admin or user), and `/login` (redirects if already logged in).
  - **Proxy API routes pattern** — the frontend NEVER lets the browser call backend services directly. All traffic goes through `/api/cdn/*` Next.js API routes which proxy to the backend on the server side. This keeps backend URLs hidden from the client and enables server-side header injection.
  - **Direct raw stream proxying for binary uploads** — for `POST /files/upload`, the Next.js API route pipes the raw incoming request stream directly to the Origin Server using `fetch()` with the incoming body stream. Standard `FormData` reconstruction in the API route fails because Next.js consumes the stream during parsing; raw stream forwarding with explicit `Content-Length` and `Content-Type` header pass-through bypasses this limitation.

---

## 👥 4. The Two User Roles

### 4.1 End User (viewer)

| Feature | Description |
|---------|-------------|
| **Route** | `/viewer` |
| **Location Selector** | Dropdown to simulate `americas`, `europe`, `asia` — directly sets `X-Client-Location` header |
| **File Browser** | Grid of all files on Origin (fetches via `GET /api/cdn/origin-files`). Click to fetch through CDN pipeline |
| **Smart Media Renderer** | Determines rendering based on `Content-Type`: `text/*` → `<pre>`, `image/*` → `<img>`, `audio/*` → `<audio>`, `video/*` → `<video>` |
| **Blob URL pattern** | Binary responses are converted to Blob → `URL.createObjectURL(blob)` → set as `src`. This avoids base64 encoding which would 33% inflate the payload size and block the main thread for large files |
| **CDN Internals Panel** | Shows cache status (HIT/MISS badge), round-trip latency, served-by node, region, cache age, routing reason |
| **Cache HIT indicator** | Green badge with "Served instantly from edge cache!" message |
| **Cache MISS indicator** | Amber badge with "First request — file pulled from Origin (2s delay is normal). Now cached." |

### 4.2 Admin (operator)

Everything the user can do, PLUS:

| Feature | Description |
|---------|-------------|
| **Route** | `/dashboard` |
| **Node Health Cards** | 3 cards showing each edge's status (up/down indicator), busy flag, active connections with visual progress bar, cache size |
| **Upload from Computer tab** | Drag-drop zone, file preview (image/audio/video/text), editable filename, size validation, progress bar using XHR (not `fetch()` — because `fetch()` does not support upload progress events via `xhr.upload.addEventListener('progress')`) |
| **Write Text Content tab** | Simple filename + textarea form for creating text files on Origin |
| **Cache Stats per node** | Expandable accordion per node showing cached filenames, media type badge, hit count, file size |
| **Manual Purge** | Input field + "Purge File" button for single-file invalidation |
| **Full Purge (Danger Zone)** | "Wipe Caches" button with `confirm()` dialog. Triggers full cache wipe across all edges |
| **Purge History table** | Chronological log of all purge operations with per-node success/fail and latency |
| **Upload auto-invalidation** | Uploading a file automatically triggers cache purge on all edges — visible in purge history shortly after upload |

---

## 📡 5. Key Distributed Systems Concepts Demonstrated

### 5.1 Caching & Cache Coherence

**What it is:** Caching stores copies of data closer to where it's needed so subsequent requests are faster.

**How this project demonstrates it:**
- **Cold path** = Origin fetch with 2000ms delay (simulates cross-continent backbone latency)
- **Warm path** = Edge cache fetch with 100ms delay (simulates local PoP delivery)
- **Per-node independent cache** — Edge A, B, and C each have their own `Map`. If a user in Americas fetches `hello.txt` (cached on Edge A), a user in Asia requesting the same file will still get a MISS on Edge C. Each node caches independently, exactly like real CDNs (Akamai, CloudFront).

**Where in code:** `edge-node/src/index.ts` — `const cache: Map<string, CacheEntry> = new Map()`

### 5.2 Cache Invalidation (The Hardest Problem)

**What it is:** "There are only two hard things in Computer Science: cache invalidation and naming things." — Phil Karlton. When the source of truth changes, all cached copies become stale.

**How this project demonstrates it:**
- **The stale data problem** — Admin updates `hello.txt` on Origin, but Edge A/B/C still serve the old version from their Maps.
- **Broadcast/fanout pattern** — Purge Service sends parallel DELETE requests to all edges.
- **`Promise.allSettled()` over `Promise.all()`** — if Edge B is down, `Promise.all()` would reject the entire operation, leaving Edge A and C un-purged. `allSettled` purges all reachable nodes regardless.
- **Partial failure tolerance** — the response includes per-node success/fail so operators know exactly which nodes were purged.

**Where in code:** `purge-service/src/index.ts` — `fanOutPurge()` function

### 5.3 Load Shedding

**What it is:** When a server is overloaded, it's better to redirect traffic elsewhere (degraded but available) than to queue requests until everything collapses (cascade failure).

**How this project demonstrates it:**
- Each edge tracks `activeConnections` via middleware (increment on request, decrement on response finish).
- When `activeConnections > MAX_CONNECTIONS` (default 10), the node reports `busy: true` on its `/health` endpoint.
- The Traffic Manager's priority loop skips busy nodes: `n.healthy && !n.busy`.
- If the preferred regional node is busy, the TM falls back to the next in the priority chain.
- **Difference from load balancing:** Load balancing distributes evenly. Load shedding actively rejects/redirects away from an overloaded node.

**Where in code:** `traffic-manager/src/index.ts` — the `for (const nodeId of priorityOrder)` loop, `edge-node/src/index.ts` — connection tracking middleware

### 5.4 Geographic Routing / GSLB

**What it is:** Directing users to the nearest server based on their physical location to minimize network latency.

**How this project demonstrates it:**
- The `X-Client-Location` header simulates geographic location (in production, CDNs use Anycast DNS where BGP routing automatically directs the user's DNS query to the nearest PoP).
- Priority tables map regions to ordered edge preferences.
- The frontend location dropdown lets evaluators see the routing decision change in real-time.

**Where in code:** `traffic-manager/src/index.ts` — `const priorityTable: Record<string, string[]>`

### 5.5 Latency Simulation

**Why the artificial delays are important:** Without them, all requests would complete in <10ms since everything runs on localhost. The delays make the CDN's value proposition demonstrable:
- **Cold path:** 2000ms (Origin) — simulates cross-continent backbone fetch
- **Warm path:** 100ms (Edge) — simulates local PoP delivery
- **The frontend's latency badge** shows the actual measured round-trip time, making the 20x improvement from MISS to HIT immediately visible to evaluators.

**Where in code:** `origin-server/src/index.ts` line 242 — `setTimeout(resolve, 2000)`, `edge-node/src/index.ts` line 159 — `setTimeout(resolve, 100)`

### 5.6 Fault Tolerance

**Scenario 1 — Edge Node goes down:**
The Traffic Manager's 15-second health poll marks the node as `healthy: false`. Subsequent `/route` calls skip it and return a fallback node. Users experience slightly higher latency (routed to a farther node) but zero downtime.

**Scenario 2 — Purge Service can't reach one edge:**
`Promise.allSettled()` ensures the other two edges are still purged. The response includes per-node results so operators can see which node failed and retry.

**Scenario 3 — Origin is slow or down:**
Content already cached on edge nodes continues to be served at full speed. Only cache misses are affected. This is the fundamental resilience promise of a CDN.

### 5.7 Functional Decomposition

**What it is:** Splitting a system into independent components, each with a single responsibility.

**Why this is NOT a monolith:** Each component is:
- A separate Express.js application with its own `package.json`
- Built into its own Docker image via its own `Dockerfile`
- Runs in its own container with its own process
- Communicates only via HTTP REST over the Docker network

**Inter-component dependency:** No component is an island:
- Edge Nodes depend on Origin (cache miss fetch)
- Traffic Manager depends on Edge Nodes (health polling)
- Purge Service depends on Edge Nodes (fanout target)
- Origin depends on Purge Service (auto-invalidation trigger)
- Frontend depends on all of them (proxy routes)

---

## 📦 6. Supported File Types

| Type  | Extensions            | Max Size | MIME Types                                          | Frontend Renderer |
|-------|-----------------------|----------|-----------------------------------------------------|-------------------|
| Text  | `.txt`                | 2 MB     | `text/plain`                                        | `<pre>`           |
| Image | `.jpg` `.png` `.gif` `.webp` | 5 MB | `image/jpeg` `image/png` `image/gif` `image/webp` | `<img>`           |
| Audio | `.mp3` `.wav` `.ogg`  | 20 MB    | `audio/mpeg` `audio/wav` `audio/ogg`               | `<audio>`         |
| Video | `.mp4` `.webm` `.ogg` | 100 MB   | `video/mp4` `video/webm` `video/ogg`               | `<video>`         |

**How content type detection works:**
1. On the Origin, `getContentType(filename)` maps the file extension to a MIME string (e.g., `.mp4` → `video/mp4`).
2. The Origin sets the `Content-Type` response header when streaming the file.
3. The Edge Node reads this header on a cache miss and stores it alongside the Buffer in its Map.
4. On subsequent cache hits, the Edge re-applies the stored `Content-Type` header.
5. The Next.js proxy passes this header through to the browser.
6. The `SmartMediaRenderer` component reads the content type and renders the appropriate HTML5 element.

---

## 📂 7. Project File Structure

```text
cdn-project/
├── docker-compose.yml                  # Orchestrates all 7 containers on cdn-network bridge
├── .gitignore                          # Excludes node_modules, dist/, etc.
├── README.md                           # This file
├── aws.md                              # AWS deployment notes
│
├── deploy/
│   └── ec2-bootstrap.sh                # Bash script: provisions Ubuntu EC2 with Node 20, PM2, git clone, build
│
├── origin-server/                      # Component 1: Single source of truth
│   ├── .dockerignore
│   ├── .gitignore
│   ├── Dockerfile                      # Multi-stage build: builder (tsc) → runner (node dist/index.js)
│   ├── package.json                    # express, multer, node-fetch
│   ├── tsconfig.json
│   ├── data/                           # Persistent volume: actual files stored here
│   └── src/
│       ├── index.ts                    # Express server, 2000ms cold delay, multer upload, auto-purge trigger
│       └── types.ts                    # FileRecord, FileMetadata, UploadResponse, HealthResponse
│
├── edge-node/                          # Component 2/3/4: Caching proxy (same code, 3 instances via ENV)
│   ├── .dockerignore
│   ├── .gitignore
│   ├── Dockerfile                      # Multi-stage build: builder (tsc) → runner
│   ├── package.json                    # express, node-fetch
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                    # Map<string,CacheEntry> cache, HIT/MISS logic, activeConnections
│       └── types.ts                    # CacheEntry (Buffer-based), CacheStats, EdgeHealth
│
├── traffic-manager/                    # Component 5: GSLB routing engine
│   ├── .dockerignore
│   ├── .gitignore
│   ├── Dockerfile
│   ├── package.json                    # express, node-fetch
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                    # Priority tables, 15s health poll, load shedding, round-robin
│       └── types.ts                    # EdgeNodeConfig, EdgeNodeStatus, RouteResponse
│
├── purge-service/                      # Component 6: Cache consistency controller
│   ├── .dockerignore
│   ├── .gitignore
│   ├── Dockerfile
│   ├── package.json                    # express, node-fetch
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                    # fanOutPurge(), Promise.allSettled(), FIFO history
│       └── types.ts                    # PurgeResult, PurgeResponse, EdgeTarget
│
├── cdn-frontend/                       # Component 7: Next.js 14 UI + API proxy
│   ├── .dockerignore
│   ├── .gitignore
│   ├── .env.local                      # Local dev: localhost URLs
│   ├── .env.production                 # Production: EC2 IP placeholders
│   ├── Dockerfile                      # Multi-stage: builder (next build) → runner (next start)
│   ├── package.json                    # next 14, react 18, shadcn, tailwind, sonner, lucide-react
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── next.config.mjs
│   ├── components.json                 # shadcn/ui component configuration
│   ├── middleware.ts                   # Route protection: /dashboard→admin, /viewer→admin|user
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with dark theme
│   │   ├── globals.css                 # Tailwind base + custom scrollbar styles
│   │   ├── page.tsx                    # Root redirect
│   │   ├── login/
│   │   │   └── page.tsx                # Login form with username/password
│   │   ├── dashboard/
│   │   │   ├── layout.tsx              # Dashboard shell with navbar
│   │   │   └── page.tsx                # Admin: health cards, upload, stats, purge, history
│   │   ├── viewer/
│   │   │   ├── layout.tsx              # Viewer shell with navbar
│   │   │   └── page.tsx                # User: location picker, file browser, media renderer
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts      # POST: validates credentials, sets cdn-role cookie
│   │       │   └── logout/route.ts     # POST: clears cdn-role cookie
│   │       └── cdn/
│   │           ├── file/route.ts       # GET: proxies binary file fetch from edge node
│   │           ├── files/route.ts      # GET: proxies file list from origin
│   │           ├── health/route.ts     # GET: proxies TM health endpoint
│   │           ├── origin-files/route.ts # GET: proxies file list directly from origin
│   │           ├── purge/route.ts      # GET/POST: proxies purge history + trigger
│   │           ├── route/route.ts      # GET: proxies TM /route with X-Client-Location
│   │           ├── stats/route.ts      # GET: aggregates cache stats from all 3 edges
│   │           └── upload/route.ts     # POST: proxies binary upload OR text create to origin
│   ├── components/
│   │   ├── ui/                         # shadcn/ui primitives (button, card, input, badge, etc.)
│   │   ├── navbar.tsx                  # Top navigation bar with role display + logout
│   │   ├── edge-node-card.tsx          # Health card with status dot, busy indicator, connection bar
│   │   ├── file-browser.tsx            # Grid of Origin files with click-to-fetch
│   │   ├── file-upload-panel.tsx       # Drag-drop upload with XHR progress + text write tab
│   │   ├── file-viewer.tsx             # Legacy text-only file viewer
│   │   ├── smart-media-renderer.tsx    # Blob URL renderer: img/audio/video/pre by Content-Type
│   │   ├── cache-badge.tsx             # HIT (green) / MISS (amber) visual badge
│   │   ├── latency-badge.tsx           # Color-coded latency display (green<200ms, amber, red>1500ms)
│   │   ├── health-indicator.tsx        # Animated dot (green=up, red=down)
│   │   └── purge-history.tsx           # Scrollable table of purge operations
│   └── lib/
│       ├── constants.ts                # Credentials, cookie names, getBackendUrl(), region info
│       ├── types.ts                    # All frontend TypeScript interfaces
│       └── utils.ts                    # cn(), apiFetch<T>(), latencyColor(), formatTimestamp()
│
└── client-simulator/                   # Optional: programmatic load testing tool
    ├── .gitignore
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── ...                         # Script for simulating concurrent client requests
```

---

## 🚀 8. How to Run Locally (Step by Step)

### 8.1 Prerequisites
- ✅ **Docker Desktop** installed and running
- ✅ **Git** for cloning the repository
- ❌ Node.js is **NOT** required on the host machine — everything runs inside Docker containers

### 8.2 First Time Setup

```bash
# 1. Clone the repository
git clone https://github.com/youruser/cdn-project.git
cd cdn-project

# 2. Create the origin data directory (if not present)
mkdir -p origin-server/data

# 3. Note: shadcn/ui is already initialized in cdn-frontend — no setup needed

# 4. Build and start all 7 containers
docker-compose up --build
```

Wait for all containers to report healthy (about 30–60 seconds). Then open `http://localhost:3004`.

### 8.3 Port Reference Table

| Component          | Container Port | Host Port | URL                      |
|--------------------|----------------|-----------|--------------------------|
| Origin Server      | 3000           | 3000      | `http://localhost:3000`  |
| Edge Node A        | 3001           | 3001      | `http://localhost:3001`  |
| Edge Node B        | 3002           | 3002      | `http://localhost:3002`  |
| Edge Node C        | 3003           | 3003      | `http://localhost:3003`  |
| Purge Service      | 4000           | 4000      | `http://localhost:4000`  |
| Traffic Manager    | 4001           | 4001      | `http://localhost:4001`  |
| Frontend           | 3004           | 3004      | `http://localhost:3004`  |

### 8.4 Useful Docker Commands

```bash
# Start / Stop
docker-compose up --build           # Build images and start all containers (foreground)
docker-compose up -d                # Start all containers in background (detached)
docker-compose down                 # Stop and remove all containers
docker-compose down -v              # Stop, remove containers, AND delete volumes (wipes origin data/)

# Monitoring
docker-compose logs -f              # Live tail logs from ALL containers
docker-compose logs -f origin-server    # Live tail logs from a specific service
docker-compose ps                   # Show running container status

# Maintenance
docker-compose restart edge-node-c  # Restart a single service (simulates edge crash)
```

### 8.5 Login Credentials

| Role  | Username | Password   | Redirects to  |
|-------|----------|------------|---------------|
| Admin | `admin`  | `admin123` | `/dashboard`  |
| User  | `user`   | `user123`  | `/viewer`     |

---

## 🔑 9. API Reference (Complete)

### Origin Server (`http://localhost:3000`)

---

**`GET /files`**  
**Description:** Returns a JSON array listing all files stored on the Origin with metadata.  
**Headers:** None  
**Request body:** None  
**Response:**
```json
{
  "files": [
    { "filename": "hello.txt", "contentType": "text/plain", "mediaType": "text", "size": 112, "lastModified": "2026-04-08T12:00:00.000Z" }
  ]
}
```
**Example curl:**
```bash
curl http://localhost:3000/files
```

---

**`GET /files/:filename`**  
**Description:** Streams the binary content of a file. Includes a forced 2000ms delay to simulate backbone latency.  
**Headers:** None  
**Request body:** None  
**Response:** Raw binary stream with headers `Content-Type`, `Content-Length`, `X-Filename`, `X-Last-Modified`.  
**Example curl:**
```bash
curl http://localhost:3000/files/hello.txt
curl -o video.mp4 http://localhost:3000/files/video.mp4
```

---

**`POST /files/upload`**  
**Description:** Accepts a binary file upload via multipart/form-data. Writes to disk, validates MIME type and size, auto-triggers cache purge.  
**Headers:** `Content-Type: multipart/form-data`  
**Request body:** Form field `file` containing the binary file.  
**Response:**
```json
{ "filename": "photo.jpg", "contentType": "image/jpeg", "size": 245000, "uploadedAt": "2026-04-08T12:00:00.000Z" }
```
**Example curl:**
```bash
curl -F "file=@./photo.jpg" http://localhost:3000/files/upload
```

---

**`POST /files/:filename`**  
**Description:** Creates or updates a text file with the provided content string. Auto-triggers cache purge.  
**Headers:** `Content-Type: application/json`  
**Request body:**
```json
{ "content": "Hello, this is the updated content." }
```
**Response:**
```json
{ "filename": "hello.txt", "content": "Hello...", "contentType": "text/plain", "size": 35, "lastModified": "...", "servedAt": "..." }
```
**Example curl:**
```bash
curl -X POST http://localhost:3000/files/hello.txt \
  -H "Content-Type: application/json" \
  -d '{"content": "Updated content from curl"}'
```

---

**`GET /health`**  
**Description:** Health check endpoint used by Docker HEALTHCHECK.  
**Response:** `{ "status": "ok", "component": "origin-server" }`  
**Example curl:**
```bash
curl http://localhost:3000/health
```

---

### Edge Node A/B/C (`http://localhost:3001` / `3002` / `3003`)

---

**`GET /files/:filename`**  
**Description:** Primary caching endpoint. Returns the file from in-memory cache (HIT, ~100ms) or fetches from Origin (MISS, ~2000ms), caches it, then returns.  
**Headers:** None  
**Response:** Raw binary stream. Response headers include:
- `X-Cache: HIT` or `X-Cache: MISS`
- `X-Cache-Age: <seconds>` (on HIT)
- `X-Served-By: A` (node ID)
- `X-Region: americas`
- `Content-Type`, `Content-Length`

**Example curl:**
```bash
curl -v http://localhost:3001/files/hello.txt
curl -v http://localhost:3002/files/hello.txt
curl -v http://localhost:3003/files/hello.txt
```

---

**`DELETE /cache/:filename`**  
**Description:** Removes a single file from this node's in-memory cache.  
**Response:** `{ "purged": true, "filename": "hello.txt", "nodeId": "A" }`  
**Example curl:**
```bash
curl -X DELETE http://localhost:3001/cache/hello.txt
```

---

**`DELETE /cache`**  
**Description:** Full cache wipe — removes all entries from this node's Map.  
**Response:** `{ "purged": true, "entriesRemoved": 5, "nodeId": "A" }`  
**Example curl:**
```bash
curl -X DELETE http://localhost:3001/cache
```

---

**`GET /cache/stats`**  
**Description:** Returns this node's cache inventory with detailed entry metadata.  
**Response:**
```json
{
  "nodeId": "A", "region": "americas", "totalCached": 2, "activeConnections": 0,
  "entries": [
    { "filename": "hello.txt", "contentType": "text/plain", "mediaType": "text", "size": 112, "hits": 3, "cachedAt": "..." }
  ]
}
```
**Example curl:**
```bash
curl http://localhost:3001/cache/stats
```

---

**`GET /health`**  
**Description:** Returns health status including the `busy` flag used by the Traffic Manager for load shedding decisions.  
**Response:**
```json
{ "status": "ok", "nodeId": "A", "region": "americas", "activeConnections": 2, "cacheSize": 3, "busy": false }
```
**Example curl:**
```bash
curl http://localhost:3001/health
```

---

### Traffic Manager / GSLB (`http://localhost:4001`)

---

**`GET /route`**  
**Description:** Returns the URL of the best Edge Node for the given client location.  
**Headers:** `X-Client-Location: americas` (or `europe` or `asia`)  
**Response:**
```json
{ "edgeUrl": "http://edge-node-a:3001", "nodeId": "A", "region": "americas", "reason": "geo-priority for americas" }
```
**Example curl:**
```bash
curl -H "X-Client-Location: americas" http://localhost:4001/route
curl -H "X-Client-Location: europe" http://localhost:4001/route
curl -H "X-Client-Location: asia" http://localhost:4001/route
curl http://localhost:4001/route   # no location → round-robin
```

---

**`GET /health`**  
**Description:** Returns Traffic Manager status and the last-known health of all Edge Nodes.  
**Response:**
```json
{
  "status": "ok", "component": "traffic-manager",
  "edges": [
    { "nodeId": "A", "region": "americas", "url": "http://edge-node-a:3001", "healthy": true, "busy": false, "lastChecked": "..." },
    { "nodeId": "B", "region": "europe", "url": "http://edge-node-b:3002", "healthy": true, "busy": false, "lastChecked": "..." },
    { "nodeId": "C", "region": "asia", "url": "http://edge-node-c:3003", "healthy": true, "busy": false, "lastChecked": "..." }
  ]
}
```
**Example curl:**
```bash
curl http://localhost:4001/health
```

---

### Purge Service (`http://localhost:4000`)

---

**`POST /purge/:filename`**  
**Description:** Fans out DELETE requests to all 3 Edge Nodes for the specified file. Uses `Promise.allSettled()` for partial failure tolerance.  
**Headers:** None  
**Request body:** None  
**Response:**
```json
{
  "filename": "hello.txt",
  "results": [
    { "nodeId": "A", "success": true, "statusCode": 200, "ms": 12 },
    { "nodeId": "B", "success": true, "statusCode": 200, "ms": 15 },
    { "nodeId": "C", "success": true, "statusCode": 200, "ms": 11 }
  ],
  "totalMs": 16,
  "timestamp": "2026-04-08T12:00:00.000Z"
}
```
**Example curl:**
```bash
curl -X POST http://localhost:4000/purge/hello.txt
```

---

**`POST /purge`**  
**Description:** Full cache wipe — fans out DELETE to `/cache` on all 3 Edge Nodes.  
**Response:**
```json
{
  "filename": "ALL",
  "results": [
    { "nodeId": "A", "success": true, "statusCode": 200, "ms": 10 },
    { "nodeId": "B", "success": true, "statusCode": 200, "ms": 12 },
    { "nodeId": "C", "success": true, "statusCode": 200, "ms": 9 }
  ],
  "totalMs": 13,
  "timestamp": "..."
}
```
**Example curl:**
```bash
curl -X POST http://localhost:4000/purge
```

---

**`GET /purge/history`**  
**Description:** Returns the last 50 purge operations in chronological order (FIFO).  
**Response:** Array of PurgeResponse objects.  
**Example curl:**
```bash
curl http://localhost:4000/purge/history
```

---

**`GET /health`**  
**Description:** Health check endpoint.  
**Response:** `{ "status": "ok", "component": "purge-service", "edgesConfigured": 3 }`  
**Example curl:**
```bash
curl http://localhost:4000/health
```

---

## 🛠 10. Environment Variables Reference

| Component | Variable | Example Value | Description | Required? |
|-----------|----------|---------------|-------------|-----------|
| Origin Server | `PORT` | `3000` | Listening port | ✅ Yes |
| Origin Server | `PURGE_SERVICE_URL` | `http://purge-service:4000` | URL for auto-invalidation webhook | ✅ Yes |
| Edge Node (×3) | `PORT` | `3001` / `3002` / `3003` | Listening port | ✅ Yes |
| Edge Node (×3) | `NODE_ID` | `A` / `B` / `C` | Unique node identifier | ✅ Yes |
| Edge Node (×3) | `REGION` | `americas` / `europe` / `asia` | Geographic region label | ✅ Yes |
| Edge Node (×3) | `ORIGIN_URL` | `http://origin-server:3000` | Origin Server address for cache miss fetches | ✅ Yes |
| Edge Node (×3) | `MAX_CONNECTIONS` | `10` | Threshold before node reports busy | ✅ Yes |
| Traffic Manager | `PORT` | `4001` | Listening port | ✅ Yes |
| Traffic Manager | `EDGE_A_URL` | `http://edge-node-a:3001` | Edge Node A address for health polling | ✅ Yes |
| Traffic Manager | `EDGE_B_URL` | `http://edge-node-b:3002` | Edge Node B address for health polling | ✅ Yes |
| Traffic Manager | `EDGE_C_URL` | `http://edge-node-c:3003` | Edge Node C address for health polling | ✅ Yes |
| Purge Service | `PORT` | `4000` | Listening port | ✅ Yes |
| Purge Service | `EDGE_A_URL` | `http://edge-node-a:3001` | Edge Node A address for fanout DELETE | ✅ Yes |
| Purge Service | `EDGE_B_URL` | `http://edge-node-b:3002` | Edge Node B address for fanout DELETE | ✅ Yes |
| Purge Service | `EDGE_C_URL` | `http://edge-node-c:3003` | Edge Node C address for fanout DELETE | ✅ Yes |
| Frontend | `PORT` | `3004` | Next.js listening port | ✅ Yes |
| Frontend | `ORIGIN_URL` | `http://origin-server:3000` | Origin Server proxy target | ✅ Yes |
| Frontend | `EDGE_A_URL` | `http://edge-node-a:3001` | Edge A proxy target (for stats) | ✅ Yes |
| Frontend | `EDGE_B_URL` | `http://edge-node-b:3002` | Edge B proxy target (for stats) | ✅ Yes |
| Frontend | `EDGE_C_URL` | `http://edge-node-c:3003` | Edge C proxy target (for stats) | ✅ Yes |
| Frontend | `PURGE_SERVICE_URL` | `http://purge-service:4000` | Purge Service proxy target | ✅ Yes |
| Frontend | `TRAFFIC_MANAGER_URL` | `http://traffic-manager:4001` | Traffic Manager proxy target | ✅ Yes |
| Frontend | `AUTH_COOKIE_SECRET` | `local-dev-secret` | Secret for cookie signing | ✅ Yes |

---

## 🏃 11. How the Cache Works (Step by Step Walkthrough)

**Scenario:** User in Asia requests `video.mp4` for the first time, then requests it again, then the Origin content is updated.

| Step | Action | Detail |
|------|--------|--------|
| 1 | Browser → Frontend | User selects location: `asia`, enters `video.mp4`, clicks Fetch |
| 2 | Frontend → Traffic Manager | `GET /route` with header `X-Client-Location: asia` |
| 3 | Traffic Manager checks Edge C | Reviews `edgeStatus` — Edge C is `healthy: true`, `busy: false` |
| 4 | Traffic Manager returns Edge C | Response: `{ edgeUrl: "http://edge-node-c:3003", nodeId: "C", reason: "geo-priority for asia" }` |
| 5 | Frontend → Edge C | `GET /files/video.mp4` (proxied through Next.js API route) |
| 6 | Edge C: **Cache MISS** | `cache.get("video.mp4")` returns `undefined` → fetches from Origin |
| 7 | Origin streams file | 2000ms delay → `fs.createReadStream("data/video.mp4")` → pipes raw bytes to Edge C |
| 8 | Edge C caches & serves | Converts response to `Buffer`, stores in Map, sets `X-Cache: MISS`, streams to browser |
| 9 | Browser renders | Receives blob, calls `URL.createObjectURL(blob)`, renders as `<video src="blob:...">` |
| 10 | User requests again | Same file, same location, clicks Fetch again |
| 11 | Edge C: **Cache HIT** | `cache.get("video.mp4")` returns `CacheEntry` → serves from Map in ~100ms, `X-Cache: HIT` |
| 12 | Admin updates file | Admin uploads new `video.mp4` via Dashboard → Origin saves to disk |
| 13 | Origin triggers purge | Fire-and-forget `POST http://purge-service:4000/purge/video.mp4` |
| 14 | Purge fans out | `DELETE /cache/video.mp4` sent to Edge A, B, AND C in parallel via `Promise.allSettled()` |
| 15 | Consistency restored | All edges deleted the key. Next request to ANY edge → Cache MISS → fresh content from Origin |

---

## 🔀 12. How Load Shedding Works (Step by Step)

**Scenario:** Edge C (Asia) is overwhelmed with 11 concurrent connections.

| Step | What Happens |
|------|--------------|
| 1 | Edge C has `activeConnections = 11`, which exceeds `MAX_CONNECTIONS = 10` |
| 2 | Edge C's `/health` endpoint responds with `busy: true` |
| 3 | Traffic Manager's 15-second health poll picks up the `busy: true` flag and updates in-memory status |
| 4 | A new user in Asia requests a file through the frontend (location: `asia`) |
| 5 | Traffic Manager evaluates priority table: `asia → [C, B, A]` |
| 6 | Checks Node C: `healthy: true` but `busy: true` → **SKIP** (load shedding triggered) |
| 7 | Checks Node B: `healthy: true`, `busy: false` → **SELECTED** |
| 8 | Returns `{ edgeUrl: "http://edge-node-b:3002", nodeId: "B", reason: "geo-priority for asia" }` |
| 9 | Response includes header `X-Load-Shed: true` indicating the routing was a fallback |
| 10 | Frontend shows which node actually served the file and the routing reason |

**Key distinction:** Load shedding is NOT load balancing. Load balancing distributes evenly. Load shedding actively rejects/skips an overloaded node to prevent cascade failure — preferring slightly higher latency (farther node) over degraded performance at the saturated node.

---

## ☁️ 13. AWS EC2 Deployment Architecture

### Instance Requirements

You need **7 EC2 instances** (one per component), or you can consolidate the non-edge components onto fewer instances:

| Component | Recommended Region | Instance Type | Why This Region |
|-----------|--------------------|---------------|-----------------|
| Edge Node A | `us-east-1` (Virginia) | `t3.micro` | Serves Americas clients |
| Edge Node B | `eu-west-1` (Ireland) | `t3.micro` | Serves Europe clients |
| Edge Node C | `ap-south-1` (Mumbai) | `t3.micro` | Serves Asia clients |
| Origin Server | Any (e.g., `us-east-1`) | `t3.micro` | Central storage |
| Traffic Manager | Any (e.g., `us-east-1`) | `t3.micro` | Routing engine |
| Purge Service | Any (e.g., `us-east-1`) | `t3.micro` | Invalidation controller |
| Frontend | Any (e.g., `us-east-1`) | `t3.micro` | User interface |

### Security Group Rules

Each instance needs these inbound rules:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH access |
| Component port | TCP | `0.0.0.0/0` | Service traffic |

Component ports: `3000` (Origin), `3001`/`3002`/`3003` (Edges), `4000` (Purge), `4001` (TM), `3004` (Frontend).

### How `ec2-bootstrap.sh` Works

The script in `deploy/ec2-bootstrap.sh` automates instance setup:

1. Updates system packages (`apt-get update && upgrade`)
2. Installs Node.js 20 via NodeSource
3. Installs Git
4. Installs PM2 globally (process manager with auto-restart)
5. Clones the repository to `/home/ubuntu/cdn-project`
6. Runs `npm install` and `npm run build` for the target component
7. Starts the component with PM2 (`pm2 start dist/index.js`)
8. Configures PM2 to auto-start on reboot via systemd
9. Opens the firewall port with `ufw allow`

**Usage:**
```bash
export REPO_URL=https://github.com/youruser/cdn-project.git
export COMPONENT_DIR=origin-server
export COMPONENT_NAME=origin-server
export PORT=3000
export PURGE_SERVICE_URL=http://<purge-ec2-ip>:4000
chmod +x ec2-bootstrap.sh
sudo -E ./ec2-bootstrap.sh
```

### ENV VAR Changes for Production

Replace `localhost` with actual EC2 public IPs in `cdn-frontend/.env.production`:

```env
ORIGIN_URL=http://<ORIGIN_EC2_IP>:3000
EDGE_A_URL=http://<EDGE_A_EC2_IP>:3001
EDGE_B_URL=http://<EDGE_B_EC2_IP>:3002
EDGE_C_URL=http://<EDGE_C_EC2_IP>:3003
PURGE_SERVICE_URL=http://<PURGE_EC2_IP>:4000
TRAFFIC_MANAGER_URL=http://<TM_EC2_IP>:4001
AUTH_COOKIE_SECRET=<secure-random-string>
```

### Estimated AWS Cost

With the AWS $200 student credit:
- 7× `t3.micro` instances ≈ $0.0104/hr each ≈ $0.073/hr total
- Monthly: ~$52/month
- With $200 credit: **~3.8 months of free runtime**

---

## 🔧 14. Known Limitations & Future Improvements

### Current Limitations

| # | Limitation | Impact | Fix |
|---|-----------|--------|-----|
| 1 | **In-memory cache** | Lost on container restart | Redis for persistent cache |
| 2 | **Hardcoded auth** | No real user database, passwords in source code | Real auth service (JWT + DB) |
| 3 | **No HTTPS** | All traffic is unencrypted HTTP | TLS termination via AWS ALB |
| 4 | **No real geographic DNS** | Location simulated via header, not actual DNS | AWS Route 53 latency-based routing |
| 5 | **No cache TTL** | Items cached forever until manually purged | TTL-based expiry with `max-age` |
| 6 | **Single Origin Server** | SPOF — if Origin fails, no cache misses can be served | Origin replication / S3 backend |

### Phase 2 Improvements (Planned)

1. **Redis** for persistent TTL-aware cache with automatic eviction
2. **AWS S3** for large file storage (replacing local `/data/` directory)
3. **Presigned URLs** for direct browser-to-S3 upload (bypassing Origin memory)
4. **Real authentication service** with JWT tokens, refresh tokens, and a user database

---

## ✅ 15. Distributed Computing Checklist

How this project satisfies every requirement from the Distributed Computing lab specification:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **5+ distinct server-side components** | ✅ We have **6** | Origin Server, Edge Node A, Edge Node B, Edge Node C, Traffic Manager, Purge Service — each is a separate Express.js application |
| **Each runs in its own isolated container** | ✅ | `docker-compose.yml` defines 7 separate services (6 backend + 1 frontend), each built from its own `Dockerfile` and running as an independent process |
| **Each has its own defined responsibility** | ✅ | Origin = storage, Edge = caching proxy, Traffic Manager = routing, Purge = invalidation. No component duplicates another's responsibility |
| **Components communicate over the network (REST HTTP)** | ✅ | All inter-component communication uses HTTP REST over the `cdn-network` Docker bridge. Edge fetches from Origin via `fetch()`, TM polls Edge `/health`, Purge sends `DELETE` to Edges |
| **Functional decomposition (not 5 copies of same code)** | ✅ | While Edge A/B/C share a codebase, they are functionally distinct from Origin, TM, and Purge. Each of the 4 codebases (`origin-server/`, `edge-node/`, `traffic-manager/`, `purge-service/`) has entirely different logic |
| **Inter-component dependency (no island components)** | ✅ | Every component depends on at least one other: Edge→Origin (miss fetch), TM→Edge (health poll), Purge→Edge (fanout DELETE), Origin→Purge (auto-invalidation), Frontend→all (proxy). No component operates in isolation |
| **No fat clients (all 6 components are server-side)** | ✅ | All 6 backend components run server-side Node.js processes. The Next.js frontend acts as a thin API proxy — the browser only renders UI and never directly contacts backend services |
| **No shared database monolith** | ✅ | There is no single shared database. Each Edge Node has its own independent in-memory `Map` cache. The Origin uses its own local filesystem. Components don't share state — they communicate over HTTP |
