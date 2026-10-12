#!/usr/bin/env bash
# Сборка обоих сайтов из скачанного кода (вызывается из install.sh и update.sh).
set -euo pipefail
MIR_DOMAIN="${MIR_DOMAIN:-xn----8sba1acxdkgqms3b9euc.xn--p1ai}"
MIR_DIR=/opt/svetlana/app
YZ_SRC=/opt/svetlana/ya-zaryadka
YZ_WWW=/var/www/ya-zaryadka
ENV=/etc/svetlana/backend.env
as_app() { runuser -u svetlana -- env HOME=/opt/svetlana "$@"; }

echo "==> Мир Самозанятых: зависимости и сборка сайта"
cd $MIR_DIR
as_app npm ci --no-audit --no-fund
as_app VITE_API_URL=/api/v1 VITE_BASE_PATH=/ VITE_PUBLIC_ORIGIN="https://$MIR_DOMAIN" npm run build:web

echo "==> База: миграции"
cd $MIR_DIR/backend
runuser -u svetlana -- node --env-file=$ENV src/db/migrate.js

echo "==> Я-Зарядка: голос Пико и статический сайт"
cd $YZ_SRC/web-app
as_app npm install --no-audit --no-fund
as_app node scripts/build-piko-tts.mjs
rsync -a --delete \
  --exclude='.git/' --exclude='.github/' --exclude='api/' --exclude='api-tests/' \
  --exclude='yz-runtime-transfer.txt' --exclude='web-app/node_modules/' \
  --exclude='web-app/android/' --exclude='web-app/ios/' --exclude='web-app/scripts/' \
  --exclude='vercel.json' --exclude='DEPLOY_STAMP.txt' \
  $YZ_SRC/ $YZ_WWW/
chown -R root:root $YZ_WWW && find $YZ_WWW -type d -exec chmod 755 {} + && find $YZ_WWW -type f -exec chmod 644 {} +
test -f $YZ_WWW/index.html && test -f $YZ_WWW/web-app/index.html
echo "==> Сборка готова"
