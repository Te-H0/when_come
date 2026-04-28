export function wayCodeToUpdn(wayCode: 1 | 2 | null | undefined): 'up' | 'down' | null {
  if (wayCode === 1) return 'up'
  if (wayCode === 2) return 'down'
  return null
}
