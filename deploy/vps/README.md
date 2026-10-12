# Переезд на свой сервер (VPS) — «в один запрос»

Один сервер держит всё сразу:
- **мир-самозанятых.рф** — сайт, кабинет, CRM и API;
- **я-зарядка.рф** — сайт и веб-приложение, «Спроси Пико»;
- **единую Светлану** для всех сайтов (АИКО, Репетитор, Svetlana 2.0 подключаются по ключу — `SVETLANA_CORE.md`).

База SQLite постоянная, копия делается каждую ночь в 03:30 и хранится 14 дней.

## 1. Купить сервер

Timeweb Cloud → Облачные серверы → **Ubuntu 24.04**, тариф MSK 50 (2 ядра, 4 ГБ) или выше,
регион Москва. Запишите IP-адрес сервера и пароль root.

## 2. Направить домены на сервер (reg.ru)

Для **мир-самозанятых.рф** и **я-зарядка.рф** в «DNS-серверы и управление зоной»:

| Тип | Имя | Значение |
|---|---|---|
| A | @ | IP сервера |
| A | www | IP сервера |

Старые A/CNAME-записи на Vercel и GitHub Pages для этих имён удалить. Обновление DNS — от 15 минут до суток.

## 3. Токен GitHub (только чтение)

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained** →
доступ к репозиториям `svetlana-self-employed` и `ya-zaryadka-ai`, права **Contents: Read-only**.
Токен хранится на сервере в `/etc/svetlana/github-token` (только root) и не попадает в git.

## 4. Одна команда на сервере

Подключиться: `ssh root@IP` и выполнить (подставьте свои значения):

```bash
export GITHUB_TOKEN='github_pat_...'
export AI_API_KEY='ключ модели'
export CERT_EMAIL='mir.samozanyatyh@yandex.ru'
git clone --depth 1 -b master "https://x-access-token:$GITHUB_TOKEN@github.com/paulafanasyev/svetlana-self-employed.git" /tmp/mir \
  && bash /tmp/mir/deploy/vps/install.sh; rm -rf /tmp/mir
```

Пока ветка `feat/site-10` не слита в `master`, замените в команде `-b master` на `-b feat/site-10`
и добавьте строку `export MIR_BRANCH=feat/site-10`.

Скрипт ставит Node.js 22, nginx, бесплатный HTTPS (Let's Encrypt), файрвол, собирает оба сайта,
создаёт секреты, запускает сервис и ночные копии базы. Повторный запуск безопасен.

Если домены ещё не смотрят на сервер, HTTPS выпустится позже командой:
`CERT_EMAIL=... bash /opt/svetlana/app/deploy/vps/certs.sh`

## 5. Проверка

- https://мир-самозанятых.рф/api/v1/health — сервер жив, `storage` не `ephemeral_demo`;
- https://я-зарядка.рф/api/pico/chat — `{"ok":true,"configured":true}`;
- https://я-зарядка.рф/web-app/ → Пико → «Спроси Пико».

## Повседневное

| Что | Команда |
|---|---|
| Обновить оба сайта до свежего кода | `svetlana-update` |
| Сделать копию базы сейчас | `svetlana-backup` |
| Логи | `journalctl -u svetlana -n 100 -f` |
| Перезапуск | `systemctl restart svetlana` |
| Ключи сайтов для единой Светланы | `grep ASSISTANT_KEY /etc/svetlana/backend.env` |
| Сменить ключ модели | правка `/etc/svetlana/backend.env` → `systemctl restart svetlana` |

**Копия вне сервера (рекомендуется):** заведите S3-хранилище у другого российского провайдера
(например, Selectel), настройте `rclone config` и впишите `BACKUP_REMOTE=имя:папка` в
`/etc/svetlana/backup.env`.

## После переезда

- В Android-приложениях адрес API: `https://мир-самозанятых.рф/api/v1` (уже по умолчанию в CI).
- Пико в приложении Я-Зарядки: в `web-app/assets/pico/pico-chat.js` вернуть `SITE` на `https://я-зарядка.рф`.
- Проекты Vercel `web`, `backend`, `svetlana_ai`, `ya-zaryadka-ai` можно отключить.
- Платежи: перед приёмом оплаты указать реального провайдера (`PAYMENT_PROVIDER`, ключи ЮKassa) в `/etc/svetlana/backend.env`.
