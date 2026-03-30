"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { RefreshCw, UploadCloud, Trash2, Search, Info, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { apiFetch } from "@/lib/utils";
import { 
  EdgeNodeHealth, 
  EdgeNodeStats, 
  TrafficManagerHealth, 
  RouteResponse, 
  CDNFileResponse, 
  PurgeResponse 
} from "@/lib/types";
import { REGION_INFO } from "@/lib/constants";

import { EdgeNodeCard } from "@/components/edge-node-card";
import { PurgeHistory } from "@/components/purge-history";
import { FileViewer } from "@/components/file-viewer";
import { CacheBadge } from "@/components/cache-badge";
import { LatencyBadge } from "@/components/latency-badge";

export default function DashboardPage() {
  // --------- State: Section A (Health) & C (Stats) ---------
  const [healthData, setHealthData] = useState<TrafficManagerHealth | null>(null);
  const [statsData, setStatsData] = useState<EdgeNodeStats[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [loadingHealth, setLoadingHealth] = useState(false);

  // --------- State: Section B (File Fetch) ---------
  const [fetchLocation, setFetchLocation] = useState("americas");
  const [fetchFilename, setFetchFilename] = useState("");
  const [fetchingFile, setFetchingFile] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteResponse | null>(null);
  const [fileData, setFileData] = useState<CDNFileResponse | null>(null);
  const [fetchError, setFetchError] = useState("");

  // --------- State: Section D (Upload Origin) ---------
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);

  // --------- State: Section E (Purge) & F (History) ---------
  const [purgeFilename, setPurgeFilename] = useState("");
  const [purgingSingle, setPurgingSingle] = useState(false);
  const [purgingAll, setPurgingAll] = useState(false);
  const [purgeHistory, setPurgeHistory] = useState<PurgeResponse[]>([]);
  const [lastPurgeResult, setLastPurgeResult] = useState<PurgeResponse | null>(null);

  // --------- Initial Load ---------
  useEffect(() => {
    refreshHealthAndStats();
    refreshPurgeHistory();
  }, []);

  async function refreshHealthAndStats() {
    setLoadingHealth(true);
    try {
      const [hRes, sRes] = await Promise.all([
        apiFetch<TrafficManagerHealth>("/api/cdn/health"),
        apiFetch<EdgeNodeStats[]>("/api/cdn/stats")
      ]);
      setHealthData(hRes.data);
      setStatsData(sRes.data);
    } catch (err: any) {
      toast.error("Failed to load edge health: " + (err.message || "Unknown error"));
    } finally {
      setLoadingHealth(false);
    }
  }

  async function refreshPurgeHistory() {
    try {
      const res = await apiFetch<PurgeResponse[]>("/api/cdn/purge");
      setPurgeHistory(res.data);
    } catch (err) {
      // History fetch failure should not break the whole page
      console.error("Failed to load purge history", err);
    }
  }

  // --------- Handlers ---------
  function toggleNodeExpand(nodeId: string) {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }

  async function handleFileFetch(e: React.FormEvent) {
    e.preventDefault();
    if (!fetchFilename) return;

    setFetchingFile(true);
    setFetchError("");
    setRouteInfo(null);
    setFileData(null);

    try {
      const routeRes = await apiFetch<RouteResponse>("/api/cdn/route", {
        headers: { "X-Client-Location": fetchLocation },
      });
      const url = routeRes.data.edgeUrl;
      setRouteInfo(routeRes.data);

      const fileRes = await apiFetch<CDNFileResponse>(
        `/api/cdn/file?filename=${encodeURIComponent(fetchFilename)}&edgeUrl=${encodeURIComponent(url)}`
      );
      setFileData(fileRes.data);
    } catch (err: any) {
      setFetchError(err.message || "An error occurred while fetching the file.");
    } finally {
      setFetchingFile(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFilename || !uploadContent) return;

    setUploading(true);
    try {
      await apiFetch("/api/cdn/upload", {
        method: "POST",
        body: JSON.stringify({ filename: uploadFilename, content: uploadContent }),
      });
      toast.success("File uploaded. Cache purge triggered automatically.");
      setUploadFilename("");
      setUploadContent("");
      // Refresh history slightly later as purge is async on backend
      setTimeout(refreshPurgeHistory, 1500);
      setTimeout(refreshHealthAndStats, 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  async function handlePurge(targetFile: string) {
    const isAll = targetFile === "ALL";
    if (isAll) setPurgingAll(true);
    else setPurgingSingle(true);

    try {
      const res = await apiFetch<PurgeResponse>("/api/cdn/purge", {
        method: "POST",
        body: JSON.stringify({ filename: targetFile }),
      });
      setLastPurgeResult(res.data);
      if (isAll) {
        toast.success("All caches purged successfully");
      } else {
        toast.success(`File ${targetFile} purged successfully`);
        setPurgeFilename("");
      }
      refreshPurgeHistory();
      refreshHealthAndStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to purge cache");
    } finally {
      if (isAll) setPurgingAll(false);
      else setPurgingSingle(false);
    }
  }

  async function confirmPurgeAll() {
    if (confirm("Are you sure you want to completely wipe all cache across all edge nodes? This will cause a latency spike.")) {
      handlePurge("ALL");
    }
  }

  // Combine health & stats data to construct EdgeNodeHealth records
  const combinedNodes: EdgeNodeHealth[] = ["A", "B", "C"].map((nodeId) => {
    // Defaults if backend is offline or un-synced
    let status = "down";
    let region = REGION_INFO[nodeId === "A" ? "americas" : nodeId === "B" ? "europe" : "asia"]?.label || "unknown";
    let busy = false;
    let checkedAt = new Date().toISOString();

    const tmEdge = healthData?.edges.find(e => e.nodeId === nodeId);
    if (tmEdge) {
      status = tmEdge.healthy ? "up" : "down";
      region = tmEdge.region;
      busy = tmEdge.busy;
      checkedAt = tmEdge.lastChecked;
    }

    const nodeStats = statsData.find(s => s.nodeId === nodeId);

    return {
      status,
      nodeId,
      region,
      busy,
      activeConnections: nodeStats?.activeConnections || 0,
      cacheSize: nodeStats?.totalCached || 0,
    };
  });

  return (
    <div className="space-y-10 pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-muted-foreground mt-1">Manage edge nodes, inject content, and trigger invalidations.</p>
        </div>
        <Button onClick={refreshHealthAndStats} disabled={loadingHealth} variant="outline" className="shadow-sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingHealth ? "animate-spin" : ""}`} />
          Refresh Fleet Status
        </Button>
      </div>

      {/* SECTION A: Node Health */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Fleet Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {combinedNodes.map(node => (
            <EdgeNodeCard 
              key={node.nodeId} 
              health={node} 
              timestamp={
                healthData?.edges.find(e => e.nodeId === node.nodeId)?.lastChecked 
                  ? new Date(healthData.edges.find(e => e.nodeId === node.nodeId)!.lastChecked).toLocaleTimeString()
                  : "N/A"
              } 
            />
          ))}
        </div>
      </section>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT COLUMN: Section B (Fetch) & C (Stats) */}
        <div className="space-y-8">
          
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Diagnostic Fetch</h2>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <form onSubmit={handleFileFetch} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Filename</label>
                      <Input
                        type="text"
                        placeholder="e.g. hello.txt"
                        value={fetchFilename}
                        onChange={(e) => setFetchFilename(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Client Region</label>
                      <select 
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={fetchLocation}
                        onChange={(e) => setFetchLocation(e.target.value)}
                      >
                        <option value="americas">Americas 🌎</option>
                        <option value="europe">Europe 🌍</option>
                        <option value="asia">Asia 🌏</option>
                      </select>
                    </div>
                  </div>
                  {fetchError && <div className="text-sm text-destructive font-medium border border-destructive/50 bg-destructive/10 p-2.5 rounded">{fetchError}</div>}
                  <Button type="submit" className="w-full" disabled={fetchingFile || !fetchFilename}>
                    {fetchingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Test Routing & Fetch
                  </Button>
                </form>

                {routeInfo && fileData && (
                  <div className="mt-4 border border-border/50 rounded-lg bg-muted/10 p-4 space-y-4">
                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                      <span className="font-semibold text-sm">Response Details</span>
                      <CacheBadge status={fileData.xCache} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">Served By:</span>
                      <span className="font-medium text-right">{fileData.servedBy} ({routeInfo.region})</span>
                      
                      <span className="text-muted-foreground">Latency (RTT):</span>
                      <span className="font-medium text-right"><LatencyBadge ms={fileData.latencyMs} /></span>
                      
                      <span className="text-muted-foreground">Routing Edge:</span>
                      <span className="font-mono text-xs text-right truncate" title={routeInfo.edgeUrl}>{routeInfo.edgeUrl}</span>
                      
                      <span className="text-muted-foreground">Routing Policy:</span>
                      <span className="font-medium text-right text-amber-500/90">{routeInfo.reason}</span>
                    </div>

                    <div className="pt-2">
                      {routeInfo.reason.includes("fallback") || routeInfo.reason.includes("load-shedding") ? (
                        <div className="flex gap-2 text-amber-500 bg-amber-500/10 p-2 rounded text-xs leading-relaxed mt-2">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <span><b>Load Shedding Triggered:</b> Traffic was redirected to a fallback node because preferred node was busy.</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-2 text-xs border border-border/50 h-32 overflow-hidden rounded relative">
                      <div className="absolute inset-x-0 top-0 bg-zinc-900 border-b border-zinc-800 text-zinc-500 px-2 py-1 flex justify-between">
                        <span>{fileData.filename}</span>
                        <span>{fileData.size}b</span>
                      </div>
                      <pre className="p-2 pt-8 w-full h-full overflow-y-auto whitespace-pre-wrap font-mono text-zinc-300 bg-zinc-950">
                        {fileData.content}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Cache Internals</h2>
            <div className="space-y-4">
              {statsData.map(stat => (
                <Card key={stat.nodeId} className="overflow-hidden">
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleNodeExpand(stat.nodeId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">Node {stat.nodeId}</span>
                      <Badge variant="secondary">{stat.totalCached} total</Badge>
                    </div>
                    {expandedNodes[stat.nodeId] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                  
                  {expandedNodes[stat.nodeId] && (
                    <div className="p-4 pt-0 border-t border-border/50 bg-muted/10">
                      {stat.entries && stat.entries.length > 0 ? (
                        <ul className="space-y-1 mt-2 font-mono text-sm">
                          {stat.entries.map((filename) => (
                            <li key={filename} className="text-muted-foreground flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:bg-emerald-500/50 before:rounded-full before:mr-2">
                              {filename}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-muted-foreground text-sm italic mt-2">Cache is empty.</div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Section D (Upload) & E (Purge) */}
        <div className="space-y-8">
          
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Origin Content Management</h2>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Publish File</CardTitle>
                <CardDescription>Upload content to the Origin Server. Triggers automatic cache invalidation.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filename</label>
                    <Input
                      type="text"
                      placeholder="e.g. banner.json"
                      value={uploadFilename}
                      onChange={(e) => setUploadFilename(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content Payload</label>
                    <Textarea
                      placeholder="Enter raw text, JSON, or markdown..."
                      rows={5}
                      value={uploadContent}
                      onChange={(e) => setUploadContent(e.target.value)}
                      required
                      className="font-mono text-sm custom-scrollbar"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={uploading || !uploadFilename || !uploadContent}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                    Upload & Publish
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Manual Invalidation</h2>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base text-center">Standard Purge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pb-4">
                  <Input
                    type="text"
                    placeholder="Filename"
                    value={purgeFilename}
                    onChange={(e) => setPurgeFilename(e.target.value)}
                  />
                  <Button 
                    variant="secondary" 
                    className="w-full" 
                    onClick={() => handlePurge(purgeFilename)} 
                    disabled={purgingSingle || !purgeFilename}
                  >
                    {purgingSingle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4 text-amber-500" />}
                    Purge File
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-destructive/20 bg-destructive/5">
                <CardHeader className="py-4">
                  <CardTitle className="text-base text-center text-destructive">Danger Zone</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pb-4 flex flex-col justify-end h-[calc(100%-60px)]">
                  <p className="text-xs text-center text-muted-foreground px-2">
                    Completely resets all Edge Node memory caches. Causes cold-path delay for next requests.
                  </p>
                  <Button 
                    variant="destructive" 
                    className="w-full mt-auto" 
                    onClick={confirmPurgeAll} 
                    disabled={purgingAll}
                  >
                    {purgingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Wipe Caches
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Last Purge Result Overlay */}
            {lastPurgeResult && (
              <div className="mt-4 border border-border/50 rounded-lg p-3 bg-muted/20 animate-in slide-in-from-top-2">
                <span className="text-sm font-semibold mb-2 block">Purge Executed: <span className="font-mono font-normal">"{lastPurgeResult.filename}"</span></span>
                <div className="grid grid-cols-3 gap-2">
                  {lastPurgeResult.results.map(r => (
                    <div key={r.nodeId} className="flex flex-col items-center bg-background border border-border/50 p-2 rounded">
                      <span className="text-xs text-muted-foreground font-medium mb-1">Node {r.nodeId}</span>
                      {r.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <span className="text-xs text-red-500">{r.statusCode} Error</span>}
                      <span className="text-[10px] mt-1 font-mono text-muted-foreground">{r.ms}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>
      </div>

      <Separator />

      {/* SECTION F: Purge History */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold tracking-tight">System Purge Logs</h2>
          <Button variant="ghost" size="sm" onClick={refreshPurgeHistory}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
        <PurgeHistory history={purgeHistory} />
      </section>

    </div>
  );
}
