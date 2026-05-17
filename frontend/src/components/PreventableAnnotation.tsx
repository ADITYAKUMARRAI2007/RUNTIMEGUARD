import { AlertTriangle } from 'lucide-react'

interface Props { prNumber: number | null; daysAgo: number | null }

export default function PreventableAnnotation({ prNumber, daysAgo }: Props) {
  return (
    <div className="flex items-center gap-2 bg-accent3/10 border-l-4 border-accent3 px-4 py-2 rounded-r">
      <AlertTriangle size={14} className="text-accent3 flex-shrink-0" />
      <span className="text-[12px] text-accent3 font-medium">
        Was preventable — PR #{prNumber} warned about this deprecation {daysAgo} days ago
      </span>
    </div>
  )
}
