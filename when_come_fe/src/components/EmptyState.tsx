import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string | string[]
  cta?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon, title, description, cta }: EmptyStateProps) {
  const lines = Array.isArray(description) ? description : description ? [description] : []

  return (
    <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-black/5 shadow-sm">
      <div className="mb-6">
        <div className="w-16 h-16 bg-[#111827] rounded-2xl flex items-center justify-center mx-auto mb-6">
          {icon}
        </div>
        <h2 className="text-xl font-semibold mb-2 text-[#111827]">{title}</h2>
        {lines.length > 0 && (
          <p className="text-[#6B7280] text-[15px] leading-relaxed">
            {lines.map((line, idx) => (
              <span key={idx}>
                {line}
                {idx < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )}
      </div>
      {cta && (
        <Button
          onClick={cta.onClick}
          className="w-full bg-[#111827] hover:bg-[#1F2937] rounded-xl h-12 text-[15px] font-medium shadow-sm"
          size="lg"
        >
          {cta.label}
        </Button>
      )}
    </Card>
  )
}
