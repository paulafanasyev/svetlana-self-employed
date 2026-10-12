#!/usr/bin/env bash
# Установка «Мира Самозанятых» + «Я-Зарядки» + единой Светланы на один VPS (Ubuntu 22.04/24.04).
#
# Запуск (под root, один раз):
#   export GITHUB_TOKEN=github_pat_...   # токен только на чтение репозиториев (см. README.md)
#   export AI_API_KEY=...                 # ключ модели (anymodel или российская модель)
#   export CERT_EMAIL=you@example.ru      # почта для HTTPS-сертификатов
#   bash install.sh
#
# Повторный запуск безопасен: секреты и база не перезаписываются.
set -euo pipefail

: "${GITHUB_TOKEN:?Нужен GITHUB_TOKEN (только чтение репозиториев)}"
: "${CERT_EMAIL:?Нужен CERT_EMAIL для HTTPS-сертификатов}"
MIR_DOMAIN="${MIR_DOMAIN:-xn----8sba1acxdkgqms3b9euc.xn--p1ai}"   # мир-самозанятых.рф
YZ_DOMAIN="${YZ_DOMAIN:-xn----8sbapnu4bzhe.xn--p1ai}"              # я-зарядка.рф
MIR_BRANCH="${MIR_BRANCH:-master}"
YZ_BRANCH="${YZ_BRANCH:-main}"
AI_BASE_URL="${AI_BASE_URL:-https://anymodel.org/v1}"
AI_MODEL="${AI_MODEL:-am/free}"

APP_USER=svetlana
HOME_DIR=/opt/svetlana
MIR_DIR=$HOME_DIR/app
YZ_SRC=$HOME_DIR/ya-zaryadka
YZ_WWW=/var/www/ya-zaryadka
DATA=/var/lib/svetlana
ETC=/etc/svetlana
HERE="$(cd "$(dirname "$0")" && pwd)"

say() { printf '\n==> %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Запустите под root"; exit 1; }

say "Пакеты: nginx, certbot, sqlite3, git, Node.js 22"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git nginx sqlite3 certbot python3-certbot-nginx ufw rsync openssl
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

say "Пользователь и папки"
id -u $APP_USER >/dev/null 2>&1 || useradd --system --create-home --home-dir $HOME_DIR --shell /usr/sbin/nologin $APP_USER
install -d -o $APP_USER -g $APP_USER -m 750 $DATA $DATA/data $DATA/storage $DATA/backups
install -d -m 755 $YZ_WWW
install -d -m 700 $ETC
umask 077
printf '%s' "$GITHUB_TOKEN" > $ETC/github-token
umask 022
printf 'MIR_BRANCH=%s\nYZ_BRANCH=%s\n' "$MIR_BRANCH" "$YZ_BRANCH" > $ETC/branches

# Токен не сохраняется в .git/config: передаём его только на время команды.
gh_auth() { printf 'AUTHORIZATION: basic %s' "$(printf 'x-access-token:%s' "$(cat $ETC/github-token)" | base64 -w0)"; }
fetch_repo() { # repo dir branch
  if [ -d "$2/.git" ]; then
    git -C "$2" -c "http.https://github.com/.extraheader=$(gh_auth)" fetch --depth 1 origin "$3"
    git -C "$2" checkout -q -B "$3" FETCH_HEAD
  else
    git -c "http.https://github.com/.extraheader=$(gh_auth)" clone --depth 1 --branch "$3" "https://github.com/paulafanasyev/$1.git" "$2"
  fi
  chown -R $APP_USER:$APP_USER "$2"
}

say "Код: svetlana-self-employed ($MIR_BRANCH) и ya-zaryadka-ai ($YZ_BRANCH)"
fetch_repo svetlana-self-employed $MIR_DIR "$MIR_BRANCH"
fetch_repo ya-zaryadka-ai $YZ_SRC "$YZ_BRANCH"

say "Секреты сервера (создаются один раз)"
if [ ! -f $ETC/backend.env ]; then
  rnd() { openssl rand -hex "$1"; }
  umask 077
  cat > $ETC/backend.env <<ENV
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=1
DB_PATH=$DATA/data/app.sqlite
STORAGE_DIR=$DATA/storage
JWT_SECRET=$(rnd 48)
WEB_ORIGIN=https://$MIR_DOMAIN
CORS_ORIGINS=https://$MIR_DOMAIN,https://www.$MIR_DOMAIN
SEED_DEMO_DATA=false
AI_API_KEY=${AI_API_KEY:-}
AI_BASE_URL=$AI_BASE_URL
AI_MODEL=$AI_MODEL
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=1
# Пико на я-зарядка.рф (публичный детский чат через единую Светлану)
PICO_PUBLIC=true
# Ключи сайтов для единой Светланы (SVETLANA_CORE.md)
ASSISTANT_KEY_MIR=$(rnd 24)
ASSISTANT_KEY_AIKO=$(rnd 24)
ASSISTANT_KEY_ZARYADKA=$(rnd 24)
ASSISTANT_KEY_REPETITOR=$(rnd 24)
ASSISTANT_KEY_SVETLANA2=$(rnd 32)
# Платежи: укажите реального провайдера перед приёмом оплаты (YOOKASSA_SHOP_ID, YOOKASSA_SECRET)
# PAYMENT_PROVIDER=yookassa
ENV
  umask 022
  chown root:$APP_USER $ETC/backend.env && chmod 640 $ETC/backend.env
  [ -n "${AI_API_KEY:-}" ] || echo "!! AI_API_KEY не задан: впишите его в $ETC/backend.env и выполните systemctl restart svetlana"
fi

bash "$HERE/build.sh"

say "Сервисы systemd"
install -m 644 "$HERE/svetlana.service" /etc/systemd/system/svetlana.service
install -m 644 "$HERE/svetlana-backup.service" /etc/systemd/system/svetlana-backup.service
install -m 644 "$HERE/svetlana-backup.timer" /etc/systemd/system/svetlana-backup.timer
install -m 755 "$HERE/backup.sh" /usr/local/bin/svetlana-backup
install -m 755 "$HERE/update.sh" /usr/local/bin/svetlana-update
systemctl daemon-reload
systemctl enable --now svetlana.service svetlana-backup.timer

say "nginx"
sed "s/__MIR_DOMAIN__/$MIR_DOMAIN/g" "$HERE/nginx/mir.conf" > /etc/nginx/sites-available/mir.conf
sed "s/__YZ_DOMAIN__/$YZ_DOMAIN/g; s#__YZ_WWW__#$YZ_WWW#g" "$HERE/nginx/zaryadka.conf" > /etc/nginx/sites-available/zaryadka.conf
ln -sf /etc/nginx/sites-available/mir.conf /etc/nginx/sites-enabled/mir.conf
ln -sf /etc/nginx/sites-available/zaryadka.conf /etc/nginx/sites-enabled/zaryadka.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

say "Файрвол: только SSH, HTTP, HTTPS"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

say "Проверка сервера Светланы"
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:4000/api/v1/health | head -c 400; echo

say "HTTPS (нужно, чтобы A-записи доменов уже указывали на этот сервер)"
if certbot --nginx --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect \
     -d "$MIR_DOMAIN" -d "www.$MIR_DOMAIN" -d "$YZ_DOMAIN" -d "www.$YZ_DOMAIN"; then
  echo "HTTPS готов."
else
  echo "!! Сертификаты не выпущены: домены ещё не смотрят на этот сервер."
  echo "   Когда DNS обновится (до 24 ч), выполните: CERT_EMAIL=$CERT_EMAIL bash /opt/svetlana/app/deploy/vps/certs.sh"
fi

say "Готово"
echo "Мир Самозанятых: https://мир-самозанятых.рф"
echo "Я-Зарядка:       https://я-зарядка.рф"
echo "Ключи сайтов для единой Светланы: grep ASSISTANT_KEY $ETC/backend.env"
