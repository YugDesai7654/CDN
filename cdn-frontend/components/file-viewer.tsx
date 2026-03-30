import { CDNFileResponse } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

export function FileViewer({ file }: { file: CDNFileResponse | null }) {
  if (!file) {
    return (
      <Card className="bg-zinc-950/50 border-zinc-800 border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-12 text-zinc-500">
          <p>No file selected</p>
          <p className="text-xs mt-1">Fetch a file to view its content and CDN internals.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-950 border-zinc-800 shadow-inner overflow-hidden">
      <CardContent className="p-0 flex flex-col max-h-[500px]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
          <div className="text-xs font-mono text-zinc-300">
            {file.filename}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {file.contentType} &bull; {file.size} bytes
          </div>
        </div>
        <div className="overflow-auto p-4 custom-scrollbar">
          <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {file.content}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
