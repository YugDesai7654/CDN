export function HealthIndicator({ healthy, pulse = true }: { healthy: boolean; pulse?: boolean }) {
  if (healthy) {
    return (
      <span className="relative flex h-3 w-3">
        {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </span>
    );
  }
  return (
    <span className="relative flex h-3 w-3">
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
    </span>
  );
}
