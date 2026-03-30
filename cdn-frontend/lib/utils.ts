import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ApiError } from "@/lib/types";

/** Tailwind class merge helper (from shadcn/ui) */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Type-safe fetch wrapper for internal API routes (/api/*).
 * Always sends JSON, measures latency, and returns a typed result.
 *
 * Usage:
 *   const data = await apiFetch<RouteResponse>("/api/cdn/route", {
 *     headers: { "X-Client-Location": "americas" },
 *   });
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({
      error: `HTTP ${res.status}`,
    }))) as ApiError;
    throw new Error(errorBody.error || `Request failed with status ${res.status}`);
  }

  const data = (await res.json()) as T;
  return { data, latencyMs };
}

/**
 * Returns a Tailwind text color class based on latency buckets:
 *   green  < 200ms   (cache hit territory)
 *   amber  200–1500ms (acceptable)
 *   red    > 1500ms  (cache miss / slow backend)
 */
export function latencyColor(ms: number): string {
  if (ms < 200) return "text-emerald-400";
  if (ms <= 1500) return "text-amber-400";
  return "text-red-400";
}

/**
 * Returns a Tailwind bg color class based on latency buckets.
 */
export function latencyBgColor(ms: number): string {
  if (ms < 200) return "bg-emerald-500/20 text-emerald-400";
  if (ms <= 1500) return "bg-amber-500/20 text-amber-400";
  return "bg-red-500/20 text-red-400";
}

/** Format a date string to locale-friendly format */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}
