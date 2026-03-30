import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EdgeNodeHealth } from "@/lib/types";
import { REGION_INFO, MAX_CONNECTIONS_DISPLAY } from "@/lib/constants";
import { HealthIndicator } from "./health-indicator";
import { Activity, HardDrive } from "lucide-react";

export function EdgeNodeCard({ health, timestamp }: { health: EdgeNodeHealth; timestamp: string }) {
  const regionInfo = REGION_INFO[health.region] || { emoji: "🌐", label: health.region };
  const isHealthy = health.status === "up";
  
  // Calculate load percentage
  const loadPercentage = Math.min((health.activeConnections / MAX_CONNECTIONS_DISPLAY) * 100, 100);
  const isHighLoad = health.activeConnections >= MAX_CONNECTIONS_DISPLAY * 0.8;

  return (
    <Card className="flex flex-col relative overflow-hidden">
      {/* Top border color indicator based on health */}
      <div className={`h-1 w-full absolute top-0 left-0 ${isHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg flex items-center gap-2">
            <span>Node {health.nodeId}</span>
            <span className="text-xl" title={regionInfo.label}>{regionInfo.emoji}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {health.busy && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                BUSY
              </Badge>
            )}
            <HealthIndicator healthy={isHealthy} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground capitalize">{regionInfo.label} Region</div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1">
        {/* Connections bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Activity className="w-4 h-4" /> Connections
            </span>
            <span className={`font-mono ${isHighLoad ? 'text-amber-500' : ''}`}>
              {health.activeConnections} / {MAX_CONNECTIONS_DISPLAY}
            </span>
          </div>
          <Progress 
            value={loadPercentage} 
            className={`h-2 ${isHighLoad ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`}
          />
        </div>

        {/* Cache size */}
        <div className="flex justify-between items-center text-sm pt-2 border-t border-border/50">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrive className="w-4 h-4" /> Cached Files
          </span>
          <span className="font-mono font-medium">{health.cacheSize}</span>
        </div>

        <div className="text-[10px] text-muted-foreground text-right pt-1">
          Checked: {timestamp}
        </div>
      </CardContent>
    </Card>
  );
}
