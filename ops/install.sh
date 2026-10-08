#!/usr/bin/env bash
# Installs and starts the two user timers. Run once on the machine that owns
# the weekly runs:  ops/install.sh
set -eu
repo="$(dirname "$(readlink -f "$0")")/.."
units="$HOME/.config/systemd/user"
mkdir -p "$units"
cp "$repo"/ops/pickem-*.service "$repo"/ops/pickem-*.timer "$units"/
systemctl --user daemon-reload
systemctl --user enable --now pickem-pick.timer pickem-grade.timer
systemctl --user list-timers 'pickem-*' --no-pager
