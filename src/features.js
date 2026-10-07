// Football-only team dossiers, derived purely from this season's final scores.

const DAY = 86400000;

function blank(abbr) {
  return { abbr, w: 0, l: 0, t: 0, hw: 0, hl: 0, rw: 0, rl: 0, pf: 0, pa: 0, gp: 0, results: [], lastPlayed: null };
}

// priorWeeks: [{ week, games }] of normalized games; only finals count.
export function buildDossiers(priorWeeks, slateGames) {
  const teams = {};
  const get = (abbr) => (teams[abbr] ??= blank(abbr));

  for (const { week, games } of [...priorWeeks].sort((a, b) => a.week - b.week)) {
    for (const g of games) {
      if (g.status !== 'final') continue;
      for (const isHome of [false, true]) {
        const t = get(isHome ? g.home : g.away);
        const mine = isHome ? g.homeScore : g.awayScore;
        const theirs = isHome ? g.awayScore : g.homeScore;
        const res = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
        t.gp++;
        t.pf += mine;
        t.pa += theirs;
        if (res === 'W') { t.w++; if (!g.neutral) isHome ? t.hw++ : t.rw++; }
        if (res === 'L') { t.l++; if (!g.neutral) isHome ? t.hl++ : t.rl++; }
        if (res === 'T') t.t++;
        const where = g.neutral ? 'vs' : isHome ? 'vs' : '@';
        t.results.push({ week, res, text: `W${week} ${res} ${mine}-${theirs} ${where} ${isHome ? g.away : g.home}${g.neutral ? ' (neutral)' : ''}` });
        t.lastPlayed = g.kickoff;
      }
    }
  }

  const out = {};
  for (const g of slateGames) {
    for (const abbr of [g.away, g.home]) {
      const t = get(abbr);
      const per = (n) => (t.gp ? Math.round((n / t.gp) * 10) / 10 : null);
      let streak = null;
      if (t.results.length) {
        const last = t.results[t.results.length - 1].res;
        let n = 0;
        for (let i = t.results.length - 1; i >= 0 && t.results[i].res === last; i--) n++;
        streak = `${last}${n}`;
      }
      out[abbr] = {
        abbr,
        record: `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}`,
        homeRecord: `${t.hw}-${t.hl}`,
        roadRecord: `${t.rw}-${t.rl}`,
        pointsFor: per(t.pf),
        pointsAgainst: per(t.pa),
        streak,
        restDays: t.lastPlayed ? Math.round((Date.parse(g.kickoff) - Date.parse(t.lastPlayed)) / DAY) : null,
        results: t.results.map((r) => r.text),
      };
    }
  }
  return out;
}
