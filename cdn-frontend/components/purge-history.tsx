import { PurgeResponse } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export function PurgeHistory({ history }: { history: PurgeResponse[] }) {
  if (!history || history.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-card border-border/50">No purge history available.</div>;
  }

  return (
    <div className="rounded-md border border-border/50 overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border/50">
          <tr>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[180px]">Timestamp</th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Target File</th>
            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Node A</th>
            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Node B</th>
            <th className="h-10 px-4 text-center font-medium text-muted-foreground">Node C</th>
            <th className="h-10 px-4 text-right font-medium text-muted-foreground">Total Time</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
              <td className="p-4 text-muted-foreground whitespace-nowrap">
                {formatTimestamp(entry.timestamp).split(', ')[1] || entry.timestamp}
              </td>
              <td className="p-4 font-mono font-medium text-foreground">{entry.filename}</td>
              {["A", "B", "C"].map((nodeId) => {
                const res = entry.results.find((r) => r.nodeId === nodeId);
                return (
                  <td key={nodeId} className="p-4 text-center">
                    {res ? (
                      res.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                      ) : (
                        <div className="flex flex-col items-center">
                          <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                          <span className="text-[10px] text-red-500 mt-1">{res.statusCode || 'ERR'}</span>
                        </div>
                      )
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                );
              })}
              <td className="p-4 text-right font-mono text-muted-foreground">
                <div className="flex items-center justify-end gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {entry.totalMs}ms
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
