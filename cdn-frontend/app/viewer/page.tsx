"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REGION_INFO } from "@/lib/constants";
import { apiFetch } from "@/lib/utils";
import { RouteResponse } from "@/lib/types";
import { CacheBadge } from "@/components/cache-badge";
import { LatencyBadge } from "@/components/latency-badge";
import { FileBrowser } from "@/components/file-browser";
import { SmartMediaRenderer } from "@/components/smart-media-renderer";
import { Loader2, Search, Info, CheckCircle2 } from "lucide-react";

// ─── CDN Response Metadata ──────────────────────────────────────────────────
// Extracted from response headers after fetching binary from /api/cdn/file
interface CDNMetadata {
  xCache: "HIT" | "MISS";
  servedBy: string;
  region: string;
  cacheAge: string;
  latencyMs: number;
}

export default function ViewerPage() {
  const [location, setLocation] = useState("americas");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);

  const [routeInfo, setRouteInfo] = useState<RouteResponse | null>(null);
  const [cdnMeta, setCdnMeta] = useState<CDNMetadata | null>(null);
  const [error, setError] = useState("");

  // Binary content state
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string>("text/plain");
  const [fileSize, setFileSize] = useState<number>(0);
  const [displayFilename, setDisplayFilename] = useState<string>("");

  // Track previous blob URL for cleanup
  const prevBlobUrlRef = useRef<string | null>(null);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, []);

  // ─── Fetch File Through CDN Pipeline ──────────────────────────────────────
  const handleFetch = useCallback(async (e?: React.FormEvent, overrideFilename?: string) => {
    if (e) e.preventDefault();
    const target = overrideFilename || filename;
    if (!target) return;

    setLoading(true);
    setError("");
    setRouteInfo(null);
    setCdnMeta(null);

    // Revoke previous blob URL
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
    setBlobUrl(null);

    try {
      // 1. Call Traffic Manager /route to get the best edge URL
      const routeRes = await apiFetch<RouteResponse>("/api/cdn/route", {
        headers: { "X-Client-Location": location },
      });
      const edgeUrl = routeRes.data.edgeUrl;
      setRouteInfo(routeRes.data);

      // 2. Fetch the file as binary from the edge (via Next.js proxy)
      const fileRes = await fetch(
        `/api/cdn/file?filename=${encodeURIComponent(target)}&edgeUrl=${encodeURIComponent(edgeUrl)}`,
        { cache: "no-store" }
      );

      if (!fileRes.ok) {
        const errText = await fileRes.text();
        let errMsg = `Edge returned ${fileRes.status} for ${target}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errMsg;
        } catch {
          // use default message
        }
        throw new Error(errMsg);
      }

      // 3. Read binary as blob and create object URL
      const blob = await fileRes.blob();
      const url = URL.createObjectURL(blob);
      prevBlobUrlRef.current = url;
      setBlobUrl(url);

      // 4. Extract CDN metadata from response headers
      const resContentType = fileRes.headers.get("content-type") || "application/octet-stream";
      const xCache = (fileRes.headers.get("x-cache") || "MISS") as "HIT" | "MISS";
      const xServedBy = fileRes.headers.get("x-served-by") || "unknown";
      const xRegion = fileRes.headers.get("x-region") || "unknown";
      const xCacheAge = fileRes.headers.get("x-cache-age") || "0";
      const xLatencyMs = parseInt(fileRes.headers.get("x-latency-ms") || "0", 10);

      setContentType(resContentType);
      setFileSize(blob.size);
      setDisplayFilename(target);

      setCdnMeta({
        xCache,
        servedBy: xServedBy,
        region: xRegion,
        cacheAge: xCacheAge,
        latencyMs: xLatencyMs,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred while fetching the file.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filename, location]);

  // ─── File Browser Selection Handler ───────────────────────────────────────
  function handleFileSelect(selectedFilename: string) {
    setFilename(selectedFilename);
    // Trigger fetch immediately
    handleFetch(undefined, selectedFilename);
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

      {/* FILE BROWSER — Grid of all files on Origin */}
      <FileBrowser onFileSelect={handleFileSelect} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-3 text-center sm:text-left">
              <CardTitle className="text-lg">File Request</CardTitle>
              <CardDescription>Fetch a file from the CDN</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => handleFetch(e)} className="space-y-4">
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

          {/* CDN Internals Panel */}
          {routeInfo && cdnMeta && (
            <Card className="overflow-hidden border-border/80 shadow-md">
              <CardHeader className="pb-3 bg-muted/20 border-b border-border/50">
                <CardTitle className="text-lg flex items-center justify-between">
                  CDN Internals
                  <CacheBadge status={cdnMeta.xCache} />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Served By Node</div>
                  <div className="font-medium flex items-center gap-1.5">
                    {cdnMeta.servedBy} — {REGION_INFO[routeInfo.region]?.label || routeInfo.region}
                    <span className="text-lg leading-none">{REGION_INFO[routeInfo.region]?.emoji}</span>
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Round-Trip Latency</div>
                  <div className="font-medium mt-1"><LatencyBadge ms={cdnMeta.latencyMs} /></div>
                </div>

                {cdnMeta.xCache === "HIT" && (
                  <div className="space-y-1 text-sm">
                    <div className="text-muted-foreground">Cache Age</div>
                    <div className="font-medium">{cdnMeta.cacheAge}s</div>
                  </div>
                )}

                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Content-Type</div>
                  <div className="font-mono text-xs p-1.5 bg-muted rounded border border-border/50">
                    {contentType}
                  </div>
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
                  {cdnMeta.xCache === "MISS" ? (
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

        {/* SMART MEDIA RENDERER — replaces old text-only FileViewer */}
        <div className="lg:col-span-2">
          <SmartMediaRenderer
            blobUrl={blobUrl}
            contentType={contentType}
            filename={displayFilename}
            fileSize={fileSize}
            isLoading={loading}
          />
        </div>
      </div>
    </div>
  );
}
