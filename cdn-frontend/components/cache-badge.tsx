import { Badge } from "@/components/ui/badge";

export function CacheBadge({ status }: { status: "HIT" | "MISS" }) {
  if (status === "HIT") {
    return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">HIT</Badge>;
  }
  return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20">MISS</Badge>;
}
