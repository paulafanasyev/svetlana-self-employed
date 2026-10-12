#!/usr/bin/env bash
# Обновить оба сайта до свежего кода: svetlana-update
set -euo pipefail
HERE=/opt/svetlana/app/deploy/vps
[ -f /etc/svetlana/branches ] && . /etc/svetlana/branches
MIR_BRANCH="${MIR_BRANCH:-master}"; YZ_BRANCH="${YZ_BRANCH:-main}"
gh_auth() { printf 'AUTHORIZATION: basic %s' "$(printf 'x-access-token:%s' "$(cat /etc/svetlana/github-token)" | base64 -w0)"; }
pull() { git -C "$1" -c "http.https://github.com/.extraheader=$(gh_auth)" fetch --depth 1 origin "$2" && git -C "$1" checkout -q -B "$2" FETCH_HEAD && chown -R svetlana:svetlana "$1"; }
/usr/local/bin/svetlana-backup || echo "!! копия базы не сделана, продолжаю"
pull /opt/svetlana/app "$MIR_BRANCH"
pull /opt/svetlana/ya-zaryadka "$YZ_BRANCH"
bash $HERE/build.sh
systemctl restart svetlana
sleep 3
curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null && echo "Обновлено, сервер отвечает." || { echo "!! Сервер не отвечает: journalctl -u svetlana -n 80"; exit 1; }
