interface StopNameProps {
  name: string
  alias?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { name: 'text-[13px]', alias: 'text-[11px]' },
  md: { name: 'text-[15px]', alias: 'text-[12px]' },
  lg: { name: 'text-[18px]', alias: 'text-[14px]' },
}

export default function StopName({ name, alias, size = 'md', className }: StopNameProps) {
  const cls = sizeMap[size]

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className ?? ''}`}>
      <span className={`font-semibold text-[#111827] ${cls.name}`}>{name}</span>
      {alias && (
        <span className={`text-[#9CA3AF] font-normal ${cls.alias}`}>{alias}</span>
      )}
    </span>
  )
}
