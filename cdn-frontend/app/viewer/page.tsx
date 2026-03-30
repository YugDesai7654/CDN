"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REGION_INFO } from "@/lib/constants";
import { apiFetch } from "@/lib/utils";
import { RouteResponse, CDNFileResponse } from "@/lib/types";
import { CacheBadge } from "@/components/cache-badge";
import { LatencyBadge } from "@/components/latency-badge";
import { FileViewer } from "@/components/file-viewer";
import { Loader2, Search, Info, CheckCircle2 } from "lucide-react";

export default function ViewerPage() {
  const [location, setLocation] = useState("americas");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [routeInfo, setRouteInfo] = useState<RouteResponse | null>(null);
  const [fileData, setFileData] = useState<CDNFileResponse | null>(null);
  const [error, setError] = useState("");

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    if (!filename) return;

    setLoading(true);
    setError("");
    setRouteInfo(null);
    setFileData(null);

    try {
      // 1. Call Traffic Manager /route
      const routeRes = await apiFetch<RouteResponse>("/api/cdn/route", {
        headers: { "X-Client-Location": location },
      });
      const edgeUrl = routeRes.data.edgeUrl;
      setRouteInfo(routeRes.data);

      // 2. Fetch the file from the selected edge URL
      const fileRes = await apiFetch<CDNFileResponse>(
        `/api/cdn/file?filename=${encodeURIComponent(filename)}&edgeUrl=${encodeURIComponent(edgeUrl)}`
      );
      setFileData(fileRes.data);
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching the file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Viewer</h1>
          <p className="text-muted-foreground mt-1 text-sm">Observe Edge routing and cache performance from different global regions.</p>
        </div>
        <div className="flex flex-col gap-1.5 w-full md:w-64">
          <label className="text-sm font-medium">Simulate Client Location</label>
          <select 
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option className="bg-background" value="americas">Americas 🌎</option>
            <option className="bg-background" value="europe">Europe 🌍</option>
            <option className="bg-background" value="asia">Asia 🌏</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-3 text-center sm:text-left">
              <CardTitle className="text-lg">File Request</CardTitle>
              <CardDescription>Fetch a file from the CDN</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFetch} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Enter filename (e.g. hello.txt)"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    required
                  />
                </div>
                {error && <div className="text-sm text-destructive font-medium border border-destructive/50 bg-destructive/10 p-2.5 rounded">{error}</div>}
                <Button type="submit" className="w-full" disabled={loading || !filename}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Fetch File
                </Button>
              </form>
            </CardContent>
          </Card>

          {routeInfo && fileData && (
            <Card className="overflow-hidden border-border/80 shadow-md">
              <CardHeader className="pb-3 bg-muted/20 border-b border-border/50">
                <CardTitle className="text-lg flex items-center justify-between">
                  CDN Internals
                  <CacheBadge status={fileData.xCache} />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Served By Node</div>
                  <div className="font-medium flex items-center gap-1.5">
                    {fileData.servedBy} — {REGION_INFO[routeInfo.region]?.label || routeInfo.region}
                    <span className="text-lg leading-none">{REGION_INFO[routeInfo.region]?.emoji}</span>
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Round-Trip Latency</div>
                  <div className="font-medium mt-1"><LatencyBadge ms={fileData.latencyMs} /></div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Traffic Manager Selected</div>
                  <div className="font-mono text-xs p-1.5 bg-muted rounded truncate border border-border/50" title={routeInfo.edgeUrl}>
                    {routeInfo.edgeUrl}
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Routing Reason</div>
                  <div className="text-xs font-medium text-amber-500/90">{routeInfo.reason}</div>
                </div>

                <div className="pt-3 mt-1 border-t border-border/50 text-sm">
                  {fileData.xCache === "MISS" ? (
                    <div className="flex gap-2 text-amber-500 bg-amber-500/10 p-2.5 rounded text-xs leading-relaxed">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>First request — file pulled from Origin (2s delay is normal). Now cached.</span>
                    </div>
                  ) : (
                    <div className="flex gap-2 text-emerald-500 bg-emerald-500/10 p-2.5 rounded text-xs leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Served instantly from edge cache!</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          {(!routeInfo || !fileData) && (
            <div className="h-full min-h-[400px]">
              <FileViewer file={null} />
            </div>
          )}
          {routeInfo && fileData && (
            <FileViewer file={fileData} />
          )}
        </div>
      </div>
    </div>
  );
}
