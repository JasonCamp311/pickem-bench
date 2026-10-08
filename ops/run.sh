#!/usr/bin/env bash
# Unattended run for the systemd timers: ops/run.sh pick | grade
#
# Pulls, runs the job, commits and pushes only when data/ really changed, and
# sends a notification if any step failed. Safe to run twice: locked picks and
# finished games are skipped.
set -u
cd "$(dirname "$(readlink -f "$0")")/.."
job="${1:?usage: ops/run.sh pick|grade}"

if [ -f .env ]; then set -a; . ./.env; set +a; fi
notify() {
  [ -n "${PICKEM_NTFY:-}" ] || return 0
  curl -fsS -m 20 -H "Title: Pick'em Bench" -d "$1" "$PICKEM_NTFY" >/dev/null || true
}

# One run at a time: a slow pick must not collide with the daily grade.
exec 9>.git/pickem.lock
flock -w 3600 9 || { notify "$job: another run held the lock for an hour"; exit 1; }

log=$(mktemp)
trap 'rm -f "$log"' EXIT
rc=0
step() {
  echo "+ $*" | tee -a "$log"
  "$@" 2>&1 | tee -a "$log"
  local status=${PIPESTATUS[0]}
  [ "$status" -eq 0 ] || rc=$status
}

step git pull --rebase --quiet
case "$job" in
  pick)
    step node src/cli.js pick
    step node src/cli.js check
    step node src/cli.js lines
    ;;
  grade)
    step node src/cli.js lines
    step node src/cli.js grade
    ;;
  *)
    echo "unknown job: $job"
    exit 2
    ;;
esac

git add data
if git diff --cached --quiet; then
  # Nothing new on disk; the site file only got a fresh timestamp.
  git checkout -- docs/data.json
else
  git add docs/data.json
  git commit -q -m "Automated $job run, $(date +%F)"
  step git push --quiet
fi

if [ "$rc" -ne 0 ]; then
  notify "The $job run on $(hostname) had a problem: $(grep -iE 'FAILED|error|fatal|rejected|skipped' "$log" | tail -3)"
fi
exit "$rc"
