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
    <Card className="max-w-md w-full p-8 text-center rounded-card border border-border-subtle shadow-card bg-surface-card">
      <div className="mb-6">
        <div className="w-16 h-16 bg-text-primary rounded-card flex items-center justify-center mx-auto mb-6">
          {icon}
        </div>
        <h2 className="text-section mb-2">{title}</h2>
        {lines.length > 0 && (
          <p className="text-text-secondary text-body leading-relaxed">
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
          className="w-full bg-text-primary hover:bg-text-primary/90 rounded-control h-12 text-button shadow-card"
          size="lg"
        >
          {cta.label}
        </Button>
      )}
    </Card>
  )
}
