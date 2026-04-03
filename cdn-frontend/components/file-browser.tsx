"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, FileText, Image as ImageIcon, Music, Video, Loader2 } from "lucide-react";
import type { FileMetadata, FileContentType } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const TYPE_ICON: Record<FileContentType, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
};

const TYPE_COLORS: Record<FileContentType, string> = {
  text:  "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  image: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  audio: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  video: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const TYPE_ICON_COLORS: Record<FileContentType, string> = {
  text:  "text-zinc-400",
  image: "text-blue-400",
  audio: "text-purple-400",
  video: "text-emerald-400",
};

// ─── Props ──────────────────────────────────────────────────────────────────
interface FileBrowserProps {
  onFileSelect: (filename: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function FileBrowser({ onFileSelect }: FileBrowserProps) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  async function fetchFiles() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cdn/files", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch files (${res.status})`);
      const data = await res.json();
      setFiles(data.files || []);
      setHasLoaded(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load files";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Load on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">File Browser</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchFiles}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Click a file to fetch it through the CDN pipeline.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Loading skeleton */}
        {loading && !hasLoaded && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-muted/30 animate-pulse border border-border/30"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-sm text-destructive font-medium border border-destructive/50 bg-destructive/10 p-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Empty state */}
        {hasLoaded && files.length === 0 && !error && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No files found on Origin Server.
          </div>
        )}

        {/* File grid */}
        {hasLoaded && files.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {files.map((file) => {
              const Icon = TYPE_ICON[file.mediaType] || FileText;
              const iconColor = TYPE_ICON_COLORS[file.mediaType] || "text-zinc-400";
              const badgeColor = TYPE_COLORS[file.mediaType] || TYPE_COLORS.text;

              return (
                <button
                  key={file.filename}
                  onClick={() => onFileSelect(file.filename)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-border/50 bg-muted/5 hover:bg-muted/20 hover:border-primary/40 transition-all duration-200 cursor-pointer text-left"
                >
                  <Icon className={`h-7 w-7 ${iconColor} group-hover:scale-110 transition-transform`} />
                  <span className="text-xs font-mono font-medium text-center truncate w-full" title={file.filename}>
                    {file.filename}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badgeColor}`}>
                      {file.mediaType.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
