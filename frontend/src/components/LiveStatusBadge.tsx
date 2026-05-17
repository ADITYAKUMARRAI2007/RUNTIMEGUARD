export default function LiveStatusBadge() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
      <span className="font-mono text-[11px] text-accent tracking-wider">LIVE</span>
    </div>
  )
}
