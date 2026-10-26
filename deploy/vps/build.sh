#!/usr/bin/env bash
# Сборка обоих сайтов из скачанного кода (вызывается из install.sh и update.sh).
set -euo pipefail
MIR_DOMAIN="${MIR_DOMAIN:-xn----8sba1acxdkgqms3b9euc.xn--p1ai}"
YZ_DOMAIN="${YZ_DOMAIN:-xn----8sbapnu4bzhe.xn--p1ai}"
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
runuser -u svetlana -- node --env-file=$ENV src/db/seed.js

echo "==> Голос Светланы: Piper (Ирина)"
# Без него сайт говорит синтезатором браузера. Повторный запуск ничего не качает заново.
cd $MIR_DIR/backend
as_app bash scripts/install-piper.sh || echo "!! Голос Piper не установлен: Светлана будет говорить голосом браузера"

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
# На своём сервере: канонические ссылки и адрес Пико — я-зарядка.рф (на Vercel остаются как есть).
grep -rl 'paulafanasyev.github.io/ya-zaryadka-ai' $YZ_WWW --include='*.html' | xargs -r sed -i 's#https://paulafanasyev.github.io/ya-zaryadka-ai/#https://я-зарядка.рф/#g'
sed -i "s#var SITE = 'https://ya-zaryadka-ai.vercel.app';#var SITE = 'https://$YZ_DOMAIN';#" $YZ_WWW/web-app/assets/pico/pico-chat.js
grep -q "var SITE = 'https://$YZ_DOMAIN';" $YZ_WWW/web-app/assets/pico/pico-chat.js || echo "!! адрес Пико в pico-chat.js не заменён — проверьте вручную"
echo "==> Сборка готова"
