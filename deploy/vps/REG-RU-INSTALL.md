# REG.RU VPS/VDS: установка «Мира Самозанятых» с backend и авторизацией

Этот набор использует текущие `web/` и `backend/` из репозитория; не заменяет сайт упрощённой заглушкой. Backend: Fastify/Node.js 22, API `/api/v1`, SQLite на постоянном диске, текущие маршруты регистрации/входа/обновления токена/выхода. Nginx публикует сайт и проксирует API на loopback; systemd перезапускает процесс. Установка не меняет DNS.

## До установки

- VPS/VDS на Ubuntu 22.04 или 24.04, доступ root по SSH.
- Открытые входящие TCP 22, 80, 443 в панели REG.RU и на сервере.
- Домен: `мир-самозанятых.рф` (для Nginx/сертификатов используйте punycode `xn----8sba1acxdkgqms3b9euc.xn--p1ai`).
- Если GitHub-репозиторий приватный: fine-grained token только для этого репозитория с правом Contents: Read-only. Не отправляйте токен в чат и не добавляйте его в Git.

## Установка

В SSH-консоли VPS:

```bash
export GITHUB_TOKEN='ВАШ_GITHUB_TOKEN'
export CERT_EMAIL='ВАША_ПОЧТА_ДЛЯ_LETS_ENCRYPT'
# Опционально, если нужно подключить AI Светланы:
# export AI_API_KEY='КЛЮЧ_МОДЕЛИ'
# export AI_BASE_URL='https://api.atria-asi.ai/v1'
# export AI_MODEL='Atria-Dawn-Preview'
export MIR_BRANCH='deploy/reg-ru-vps'
GH_AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"
git -c "http.https://github.com/.extraheader=$GH_AUTH" clone --depth 1 -b deploy/reg-ru-vps https://github.com/paulafanasyev/svetlana-self-employed.git /tmp/svetlana-deploy
cd /tmp/svetlana-deploy
sudo -E bash deploy/vps/install.sh
```

Инсталлятор устанавливает Node.js 22, Nginx и инструменты сертификатов, получает полный код, собирает frontend, выполняет миграции и системный seed, создаёт секрет JWT, постоянные каталоги данных, systemd-сервис, резервное копирование и конфигурацию Nginx. Для интеграции «Я-Зарядки» он также получает её репозиторий, как описано в основном `deploy/vps/README.md`.

Инсталлятор пробует получить сертификаты для доменов, указанных в конфигурации, но не изменяет DNS. Если сертификат не выдан, после направления A-записей на фактический IP VPS запустите:

```bash
sudo -E bash /opt/svetlana/app/deploy/vps/certs.sh
```

## Обязательная проверка после установки

```bash
sudo systemctl status svetlana --no-pager
sudo journalctl -u svetlana -n 100 --no-pager
curl -fsS http://127.0.0.1:4000/api/v1/health
curl -fsS http://127.0.0.1:4000/api/v1/health/ready
```

В health ожидается `storage: "persistent"`, а `health/ready` должен отвечать HTTP 200. Затем в браузере нужно проверить регистрацию нового пользователя, вход, переход в личный кабинет, обновление токена, выход и повторный вход. Это пользовательский runtime-тест; один ответ health сам по себе не доказывает, что весь сценарий авторизации пройден.

## Где находятся данные и секреты

- SQLite: `/var/lib/svetlana/data/app.sqlite`
- Файлы и документы: `/var/lib/svetlana/storage`
- Серверные ключи: `/etc/svetlana/backend.env`
- Логи: `sudo journalctl -u svetlana -f`
- Ручная резервная копия: `sudo svetlana-backup`
- Обновление кода и обоих сайтов: `sudo svetlana-update`

Не удаляйте `/var/lib/svetlana`. Не копируйте `backend.env` в репозиторий. До добавления реальных ключей платёжного провайдера платежи не считаются production-ready; AI-ответы требуют настроенных `AI_API_KEY` и `AI_BASE_URL`.

## Текущий статус

Файлы развёртывания находятся в ветке `deploy/reg-ru-vps`. Это подготовленный установочный комплект, а не подтверждение, что он уже выполнен на VPS. Production можно пометить VERIFIED только после выполнения установки на вашем сервере и прохождения перечисленных HTTP- и браузерных проверок.
