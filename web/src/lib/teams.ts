// Each team's two main colors, for the small chip beside its abbreviation.
// Keys are ESPN's abbreviations, which is what the data uses.

const COLORS: Record<string, [string, string]> = {
  ARI: ['#97233f', '#ffb612'],
  ATL: ['#a71930', '#101820'],
  BAL: ['#241773', '#9e7c0c'],
  BUF: ['#00338d', '#c60c30'],
  CAR: ['#0085ca', '#101820'],
  CHI: ['#0b162a', '#c83803'],
  CIN: ['#fb4f14', '#101820'],
  CLE: ['#311d00', '#ff3c00'],
  DAL: ['#003594', '#869397'],
  DEN: ['#fb4f14', '#002244'],
  DET: ['#0076b6', '#b0b7bc'],
  GB: ['#203731', '#ffb612'],
  HOU: ['#03202f', '#a71930'],
  IND: ['#002c5f', '#a2aaad'],
  JAX: ['#006778', '#d7a22a'],
  KC: ['#e31837', '#ffb81c'],
  LAC: ['#0080c6', '#ffc20e'],
  LAR: ['#003594', '#ffd100'],
  LV: ['#101820', '#a5acaf'],
  MIA: ['#008e97', '#fc4c02'],
  MIN: ['#4f2683', '#ffc62f'],
  NE: ['#002244', '#c60c30'],
  NO: ['#d3bc8d', '#101820'],
  NYG: ['#0b2265', '#a71930'],
  NYJ: ['#125740', '#ffffff'],
  PHI: ['#004c54', '#a5acaf'],
  PIT: ['#ffb612', '#101820'],
  SEA: ['#002244', '#69be28'],
  SF: ['#aa0000', '#b3995d'],
  TB: ['#d50a0a', '#34302b'],
  TEN: ['#0c2340', '#4b92db'],
  WSH: ['#5a1414', '#ffb612'],
}
// Other spellings the feed has used.
const ALIAS: Record<string, string> = { WAS: 'WSH', LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC' }

export const teamColors = (abbr: string): [string, string] | null => COLORS[ALIAS[abbr] ?? abbr] ?? null

// The brighter of the two, for tinting a surface on the dark page.
export function teamTint(abbr: string): string | null {
  const c = teamColors(abbr)
  if (!c) return null
  const light = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  }
  return light(c[0]) >= 70 ? c[0] : c[1]
}
