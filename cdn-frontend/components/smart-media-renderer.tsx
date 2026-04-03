"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Music, Video, Download } from "lucide-react";

// ─── Props ──────────────────────────────────────────────────────────────────
interface SmartMediaRendererProps {
  /** Blob URL created from the fetched binary response */
  blobUrl: string | null;
  /** MIME content type from the response headers */
  contentType: string;
  /** Filename for display */
  filename: string;
  /** File size in bytes */
  fileSize: number;
  /** Whether the file is currently loading */
  isLoading: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getMediaCategory(contentType: string): "text" | "image" | "audio" | "video" | "unknown" {
  if (contentType.startsWith("text/")) return "text";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  return "unknown";
}

// ─── Loading Skeletons ──────────────────────────────────────────────────────
function ImageSkeleton() {
  return (
    <div className="flex items-center justify-center bg-zinc-900/80 rounded-lg overflow-hidden">
      <div className="w-full aspect-video max-h-[400px] bg-zinc-800/50 animate-pulse rounded-lg" />
    </div>
  );
}

function AudioSkeleton() {
  return (
    <div className="bg-zinc-900/80 rounded-lg p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-zinc-700 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="w-32 h-4 bg-zinc-700 rounded" />
          <div className="w-20 h-3 bg-zinc-800 rounded" />
        </div>
      </div>
      <div className="w-full h-8 bg-zinc-800 rounded" />
    </div>
  );
}

function VideoSkeleton() {
  return (
    <div className="flex items-center justify-center bg-zinc-900/80 rounded-lg overflow-hidden">
      <div className="w-full aspect-video max-h-[500px] bg-zinc-800/50 animate-pulse rounded-lg flex items-center justify-center">
        <Video className="h-12 w-12 text-zinc-700" />
      </div>
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="bg-zinc-950 rounded-lg p-4 space-y-2 animate-pulse">
      <div className="w-3/4 h-3 bg-zinc-800 rounded" />
      <div className="w-full h-3 bg-zinc-800 rounded" />
      <div className="w-5/6 h-3 bg-zinc-800 rounded" />
      <div className="w-2/3 h-3 bg-zinc-800 rounded" />
      <div className="w-4/5 h-3 bg-zinc-800 rounded" />
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export function SmartMediaRenderer({
  blobUrl,
  contentType,
  filename,
  fileSize,
  isLoading,
}: SmartMediaRendererProps) {
  const textContentRef = useRef<string | null>(null);
  const textRef = useRef<string>("");

  // For text files: read the blob as text
  useEffect(() => {
    if (blobUrl && contentType.startsWith("text/")) {
      fetch(blobUrl)
        .then((res) => res.text())
        .then((text) => {
          textRef.current = text;
          textContentRef.current = text;
          // Force re-render
          const event = new CustomEvent("text-loaded");
          window.dispatchEvent(event);
        })
        .catch(() => {
          textRef.current = "Failed to load text content.";
        });
    }
  }, [blobUrl, contentType]);

  // No content and not loading → empty state
  if (!blobUrl && !isLoading) {
    return (
      <Card className="bg-zinc-950/50 border-zinc-800 border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-12 text-zinc-500">
          <p>No file selected</p>
          <p className="text-xs mt-1">Fetch a file to view its content and CDN internals.</p>
        </CardContent>
      </Card>
    );
  }

  // Loading → show appropriate skeleton
  if (isLoading) {
    const category = getMediaCategory(contentType || "text/plain");
    return (
      <Card className="bg-zinc-950 border-zinc-800 shadow-inner overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80">
            <div className="text-xs font-mono text-zinc-500">Loading...</div>
          </div>
          <div className="p-4">
            {category === "image" && <ImageSkeleton />}
            {category === "audio" && <AudioSkeleton />}
            {category === "video" && <VideoSkeleton />}
            {(category === "text" || category === "unknown") && <TextSkeleton />}
          </div>
        </CardContent>
      </Card>
    );
  }

  const category = getMediaCategory(contentType);

  return (
    <Card className="bg-zinc-950 border-zinc-800 shadow-inner overflow-hidden">
      <CardContent className="p-0 flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
          <div className="text-xs font-mono text-zinc-300">
            {filename}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {contentType} &bull; {formatFileSize(fileSize)}
          </div>
        </div>

        {/* Content area */}
        <div className="p-4">
          {/* ─── TEXT ─────────────────────────────────────────────────────── */}
          {category === "text" && (
            <TextRenderer blobUrl={blobUrl!} />
          )}

          {/* ─── IMAGE ────────────────────────────────────────────────────── */}
          {category === "image" && (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-zinc-900/50 rounded-lg p-3 w-full flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={blobUrl!}
                  alt={filename}
                  className="max-w-full max-h-[450px] rounded-lg object-contain"
                />
              </div>
              <div className="text-xs text-zinc-500 text-center">
                {filename} &bull; {formatFileSize(fileSize)}
              </div>
            </div>
          )}

          {/* ─── AUDIO ────────────────────────────────────────────────────── */}
          {category === "audio" && (
            <div className="bg-zinc-900/60 rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                  <Music className="h-7 w-7 text-purple-400" />
                </div>
                <div>
                  <div className="font-medium text-sm text-zinc-200">{filename}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{formatFileSize(fileSize)}</div>
                </div>
              </div>

              {/* Decorative waveform bars */}
              <div className="flex items-end gap-[3px] h-10 px-1 opacity-30">
                {Array.from({ length: 50 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-purple-400 rounded-sm min-w-[2px]"
                    style={{
                      height: `${20 + Math.sin(i * 0.5) * 40 + Math.random() * 30}%`,
                    }}
                  />
                ))}
              </div>

              {/* HTML5 audio player */}
              <audio
                controls
                src={blobUrl!}
                className="w-full"
                style={{ filter: "invert(1) hue-rotate(180deg)" }}
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* ─── VIDEO ────────────────────────────────────────────────────── */}
          {category === "video" && (
            <div className="space-y-3">
              <div className="bg-zinc-900/50 rounded-lg overflow-hidden">
                <video
                  controls
                  src={blobUrl!}
                  className="w-full max-h-[500px] rounded-lg"
                >
                  Your browser does not support the video element.
                </video>
              </div>
              <div className="text-xs text-zinc-500 text-center">
                {filename} &bull; {formatFileSize(fileSize)}
              </div>
            </div>
          )}

          {/* ─── UNKNOWN ──────────────────────────────────────────────────── */}
          {category === "unknown" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Download className="h-10 w-10 text-zinc-500" />
              <a
                href={blobUrl!}
                download={filename}
                className="text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
              >
                Download {filename}
              </a>
              <span className="text-xs text-zinc-500">{formatFileSize(fileSize)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Text Renderer Sub-component ────────────────────────────────────────────
// Separated because it needs its own state for async text loading from blob
function TextRenderer({ blobUrl }: { blobUrl: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(blobUrl)
      .then((res) => res.text())
      .then((content) => {
        if (!cancelled) setText(content);
      })
      .catch(() => {
        if (!cancelled) setText("Failed to load text content.");
      });
    return () => {
      cancelled = true;
    };
  }, [blobUrl]);

  if (text === null) {
    return <TextSkeleton />;
  }

  return (
    <div className="overflow-auto max-h-[500px] custom-scrollbar">
      <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed p-1">
        {text}
      </pre>
    </div>
  );
}
