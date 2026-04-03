"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  X,
  Loader2,
  HardDrive,
  Pencil,
} from "lucide-react";
import type { FileContentType } from "@/lib/types";

// ─── Constants ──────────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = ".txt,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.ogg,.mp4,.webm";

const ALLOWED_MIME_TYPES: string[] = [
  "text/plain",
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4",
  "video/mp4", "video/webm", "video/ogg",
];

const SIZE_LIMITS: Record<FileContentType, number> = {
  text:  2  * 1024 * 1024,
  image: 5  * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

const SIZE_LIMIT_LABELS: Record<FileContentType, string> = {
  text:  "2MB",
  image: "5MB",
  audio: "20MB",
  video: "100MB",
};

const MEDIA_TYPE_COLORS: Record<FileContentType, string> = {
  text:  "bg-zinc-500/20 text-zinc-400",
  image: "bg-blue-500/20 text-blue-400",
  audio: "bg-purple-500/20 text-purple-400",
  video: "bg-emerald-500/20 text-emerald-400",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function getMediaType(mimeType: string): FileContentType {
  if (mimeType.startsWith("text/"))  return "text";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "text";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface FileUploadPanelProps {
  onUploadSuccess: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function FileUploadPanel({ onUploadSuccess }: FileUploadPanelProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<"file" | "text">("file");

  // --- Tab 1: Upload from Computer ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customFilename, setCustomFilename] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Tab 2: Write Text (existing) ---
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploadingText, setUploadingText] = useState(false);

  // Clean up object URLs on unmount or when file changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ─── File Selection Logic ─────────────────────────────────────────────────
  const handleFileSelected = useCallback((file: File) => {
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type) && file.type !== "") {
      toast.error(`File type not allowed: ${file.type}`);
      return;
    }

    const mediaType = getMediaType(file.type || "text/plain");
    const maxSize = SIZE_LIMITS[mediaType];

    // Validate size
    if (file.size > maxSize) {
      setSizeError(
        `File too large. Max size for ${mediaType} is ${SIZE_LIMIT_LABELS[mediaType]}, got ${formatFileSize(file.size)}.`
      );
      setSelectedFile(null);
      setPreviewUrl(null);
      setTextPreview(null);
      return;
    }

    setSizeError(null);
    setSelectedFile(file);
    setCustomFilename(file.name);

    // Revoke old URL
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    // Generate preview
    if (mediaType === "text") {
      setPreviewUrl(null);
      // Read first 5 lines
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split("\n").slice(0, 5).join("\n");
        setTextPreview(lines + (text.split("\n").length > 5 ? "\n..." : ""));
      };
      reader.readAsText(file);
    } else {
      setTextPreview(null);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, [previewUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }, [handleFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setCustomFilename("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTextPreview(null);
    setSizeError(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Binary Upload (Tab 1) ────────────────────────────────────────────────
  const handleBinaryUpload = () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    // Use custom filename if edited, otherwise original
    const finalFile = customFilename !== selectedFile.name
      ? new File([selectedFile], customFilename, { type: selectedFile.type })
      : selectedFile;
    formData.append("file", finalFile);

    // Use XMLHttpRequest for upload progress events (fetch doesn't support this)
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(`${customFilename} uploaded and cache invalidated`);
        clearSelectedFile();
        onUploadSuccess();
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          toast.error(err.error || `Upload failed (${xhr.status})`);
        } catch {
          toast.error(`Upload failed with status ${xhr.status}`);
        }
      }
    });

    xhr.addEventListener("error", () => {
      setIsUploading(false);
      toast.error("Upload failed — network error");
    });

    xhr.addEventListener("abort", () => {
      setIsUploading(false);
      toast.error("Upload aborted");
    });

    xhr.open("POST", "/api/cdn/upload");
    xhr.send(formData);
  };

  // ─── Text Upload (Tab 2 — existing behavior) ─────────────────────────────
  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFilename || !uploadContent) return;

    setUploadingText(true);
    try {
      const res = await fetch("/api/cdn/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: uploadFilename, content: uploadContent }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      toast.success("File uploaded. Cache purge triggered automatically.");
      setUploadFilename("");
      setUploadContent("");
      onUploadSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload file";
      toast.error(message);
    } finally {
      setUploadingText(false);
    }
  };

  // ─── Derived Values ───────────────────────────────────────────────────────
  const mediaType: FileContentType | null = selectedFile
    ? getMediaType(selectedFile.type || "text/plain")
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex rounded-lg border border-border/50 overflow-hidden">
        <button
          onClick={() => setActiveTab("file")}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2
            ${activeTab === "file"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
        >
          <HardDrive className="h-4 w-4" />
          Upload from Computer
        </button>
        <button
          onClick={() => setActiveTab("text")}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2
            ${activeTab === "text"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
        >
          <Pencil className="h-4 w-4" />
          Write Text Content
        </button>
      </div>

      {/* ─── TAB 1: Upload from Computer ─────────────────────────────────── */}
      {activeTab === "file" && (
        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleInputChange}
            className="hidden"
          />

          {/* Drag & Drop Zone (show when no file selected) */}
          {!selectedFile && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={handleBrowseClick}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-all duration-200
                ${isDragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border/60 hover:border-primary/50 hover:bg-muted/10"
                }
              `}
            >
              <UploadCloud className={`h-10 w-10 mx-auto mb-3 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm font-medium">
                Drag & drop your file here, or{" "}
                <span className="text-primary underline underline-offset-2">click to browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Accepted: .txt .jpg .jpeg .png .gif .webp .mp3 .wav .ogg .mp4 .webm
              </p>
            </div>
          )}

          {/* Size Error */}
          {sizeError && (
            <div className="text-sm text-destructive font-medium border border-destructive/50 bg-destructive/10 p-3 rounded-lg flex items-start gap-2">
              <X className="h-4 w-4 mt-0.5 shrink-0" />
              {sizeError}
            </div>
          )}

          {/* File Preview Panel */}
          {selectedFile && mediaType && (
            <div className="border border-border/50 rounded-lg overflow-hidden bg-muted/5">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-3">
                  {mediaType === "image" && <ImageIcon className="h-5 w-5 text-blue-400" />}
                  {mediaType === "audio" && <Music className="h-5 w-5 text-purple-400" />}
                  {mediaType === "video" && <Video className="h-5 w-5 text-emerald-400" />}
                  {mediaType === "text" && <FileText className="h-5 w-5 text-zinc-400" />}
                  <span className="text-sm font-medium">Selected File</span>
                  <Badge className={MEDIA_TYPE_COLORS[mediaType]}>
                    {mediaType.toUpperCase()}
                  </Badge>
                </div>
                <button
                  onClick={clearSelectedFile}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted/30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* File Info + Preview */}
              <div className="p-4 space-y-4">
                {/* Editable filename */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Filename (editable)</label>
                  <Input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                {/* File metadata */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Size: <span className="font-medium text-foreground">{formatFileSize(selectedFile.size)}</span></span>
                  <span>Type: <span className="font-mono text-foreground">{selectedFile.type || "text/plain"}</span></span>
                  <span>Max: <span className="font-medium text-foreground">{SIZE_LIMIT_LABELS[mediaType]}</span></span>
                </div>

                {/* Content Preview */}
                {mediaType === "image" && previewUrl && (
                  <div className="flex justify-center bg-zinc-950/50 rounded-lg p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-[200px] max-w-full rounded object-contain"
                    />
                  </div>
                )}

                {mediaType === "audio" && previewUrl && (
                  <div className="bg-zinc-950/50 rounded-lg p-4">
                    <audio controls src={previewUrl} className="w-full" style={{ filter: "invert(1) hue-rotate(180deg)" }}>
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {mediaType === "video" && previewUrl && (
                  <div className="bg-zinc-950/50 rounded-lg p-3 flex justify-center">
                    <video
                      controls
                      src={previewUrl}
                      className="max-h-[200px] max-w-full rounded"
                    >
                      Your browser does not support the video element.
                    </video>
                  </div>
                )}

                {mediaType === "text" && textPreview && (
                  <div className="bg-zinc-950 rounded-lg overflow-hidden">
                    <pre className="p-3 text-xs font-mono text-zinc-300 whitespace-pre-wrap max-h-[130px] overflow-auto custom-scrollbar">
                      {textPreview}
                    </pre>
                  </div>
                )}

                {/* Progress Bar */}
                {isUploading && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">{uploadProgress}% uploaded</p>
                  </div>
                )}

                {/* Upload Button */}
                <Button
                  onClick={handleBinaryUpload}
                  className="w-full"
                  disabled={isUploading || !selectedFile || !customFilename}
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="mr-2 h-4 w-4" />
                  )}
                  Upload & Publish
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: Write Text Content (existing behavior, unchanged) ───── */}
      {activeTab === "text" && (
        <form onSubmit={handleTextUpload} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={uploadingText || !uploadFilename || !uploadContent}>
            {uploadingText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Upload & Publish
          </Button>
        </form>
      )}
    </div>
  );
}
