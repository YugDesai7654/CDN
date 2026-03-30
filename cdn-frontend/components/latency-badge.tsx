import { Badge } from "@/components/ui/badge";
import { latencyColor, latencyBgColor } from "@/lib/utils";
import { Clock } from "lucide-react";

export function LatencyBadge({ ms }: { ms: number }) {
  const colorClass = latencyColor(ms);
  const bgClass = latencyBgColor(ms);

  return (
    <Badge variant="outline" className={`${bgClass} border-transparent font-mono`}>
      <Clock className="w-3 h-3 mr-1" />
      {ms}ms
    </Badge>
  );
}
