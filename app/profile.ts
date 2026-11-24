export const roles = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'] as const
export const battingHands = ['Right-hand bat', 'Left-hand bat'] as const
export const bowlingStyles = [
  "Doesn't bowl", 'Right-arm fast', 'Right-arm medium', 'Left-arm fast',
  'Right-arm off-break', 'Right-arm leg-break', 'Left-arm orthodox', 'Left-arm wrist-spin',
] as const

export type PlayerDetails = {
  photo?: string
  role?: typeof roles[number]
  jersey?: string
  batting?: typeof battingHands[number]
  bowling?: typeof bowlingStyles[number]
  isCaptain?: boolean
}

export type Profile = { user_id: string; name: string; nickname: string; details: PlayerDetails }

export function validatePlayerDetails(input: unknown): PlayerDetails {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Check your player details.')
  const values = input as Record<string, unknown>
  function choice<T extends string>(key: string, options: readonly T[]) {
    const value = values[key]
    if (value === '' || value === undefined) return undefined
    const option = options.find(item => item === value)
    if (!option) throw new Error('Choose a valid ' + key + '.')
    return option
  }
  const { jersey, isCaptain } = values
  if (jersey !== undefined && (typeof jersey !== 'string' || !/^\d{0,3}$/.test(jersey)))
    throw new Error('Enter a jersey number with up to three digits.')
  if (isCaptain !== undefined && typeof isCaptain !== 'boolean') throw new Error('Check the captain setting.')
  return {
    role: choice('role', roles),
    batting: choice('batting', battingHands),
    bowling: choice('bowling', bowlingStyles),
    jersey: typeof jersey === 'string' ? jersey || undefined : undefined,
    isCaptain,
  }
}
