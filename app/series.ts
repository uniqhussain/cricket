export type Series = {
  id: string
  name: string
  team_a: string
  team_b: string
  started_at: string
  ended_at: string | null
  wins_a: number
  wins_b: number
  ties: number
  live_matches: number
  stopped_matches: number
}

export type MatchListEntry = { id: string; name: string; status: string; series_id?: string | null }

export type SeriesSetup = {
  members: [string[], string[]]
  batFirst?: 0 | 1
  groundId?: string
  nicknames?: [string, string]
  overs?: number
  lastMan?: boolean
}

export function seriesResult(series: Series) {
  if (!series.ended_at) return null
  const { wins_a, wins_b, ties, team_a, team_b } = series
  if (wins_a + wins_b + ties === 0) return 'No winner · No completed matches'
  if (wins_a === wins_b) return 'Series tied'
  const winner = wins_a > wins_b ? team_a : team_b
  return winner + ' wins the series ' + Math.max(wins_a, wins_b) + '–' + Math.min(wins_a, wins_b)
}
