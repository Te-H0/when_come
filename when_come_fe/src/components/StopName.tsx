interface StopNameProps {
  name: string
  alias?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { name: 'text-caption', alias: 'text-caption' },
  md: { name: 'text-body', alias: 'text-caption' },
  lg: { name: 'text-section', alias: 'text-label' },
}

export default function StopName({ name, alias, size = 'md', className }: StopNameProps) {
  const cls = sizeMap[size]

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className ?? ''}`}>
      <span className={`font-semibold text-text-primary ${cls.name}`}>{name}</span>
      {alias && (
        <span className={`text-text-tertiary font-normal ${cls.alias}`}>{alias}</span>
      )}
    </span>
  )
}
