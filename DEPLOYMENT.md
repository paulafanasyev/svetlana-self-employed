# Развёртывание: мир-самозанятых.рф + GitHub Pages

Единая кодовая база разворачивается в два публичных места (§2, §5, §53):

```
LOCAL SOURCE
      │
      ├──────────────→ GitHub Pages   (secondary / fallback)
      │
      └──────────────→ мир-самозанятых.рф  (primary canonical)
```

**Принцип (§61):** это одна и та же сборка, один frontend, один backend,
одна база данных. Не две версии сайта.

---

## 1. GitHub Pages — VERIFIED (конфигурация)

Публикуется автоматически через GitHub Actions:

```yaml
# .github/workflows/ci.yml → job deploy-pages
- uses: actions/upload-pages-artifact@v3
  with: { path: web/dist }
- uses: actions/deploy-pages@v4
```

### Что обеспечивает корректную работу project-site

| Проблема | Решение |
| --- | --- |
| SPA deep-links (`/app/tasks`) падают в 404 | `web/dist/404.html = index.html` — стандартный GitHub Pages SPA-трюк |
| Assets по относительным путям | `VITE_BASE_PATH='/${{ github.event.repository.name }}/'` на этапе сборки |
| Дубликат SEO (§49) | `robots.txt` с `Disallow: /` для Pages-копии; canonical всегда на основной домен |

### Проверка после деплоя (§51 — green workflow ≠ verified)

Откройте фактический URL и проверьте: HTTP→HTTPS redirect, JS/CSS
загружаются, навигация по deep-link не падает, API доступен, layout на
375px и 1280px.

---

## 2. мир-самозанятых.рф — BLOCKED (нет доступа к DNS/хостингу)

### Текущее фактическое состояние (проверено напрямую)

```
Домен:      мир-самозанятых.рф
Punycode:   xn----8sba1acxdkgqms3b9euc.xn--p1ai
A-запись:   37.140.192.181
NS:         ns1.hosting.reg.ru, ns2.hosting.reg.ru
HTTPS:      403, ssl_verify_result=18 (self-signed certificate)
Сертификат: subject = CN=xn----8sba1acxdkgqms3b9euc.xn--p1ai
            issuer  = CN=xn----8sba1acxdkgqms3b9euc.xn--p1ai  ← SELF-SIGNED
            notBefore = Jul 28 13:34:53 2026 GMT
Содержимое: REG.RU заглушка «Работа сайта приостановлена»
            (data-panel-url=https://server276.hosting.reg.ru/manager)
```

**Вывод:** домен делегирован на REG.RU, но там лежит страница-заглушка
хостера с самоподписанным сертификатом. Продукт на домене **не работает**.

Это **BLOCKED**, а не VERIFIED. Доступ к панели REG.RU / DNS-записям
в текущем окружении отсутствует — поэтому ниже точная конфигурация,
которую нужно применить.

### Что нужно сделать (точно)

**Шаг 1. Разместить сборку на хостинге REG.RU**

```bash
npm run build          # web/dist + backend
# Залить web/dist в корень сайта (public_html / www)
# Запустить backend: npm start (PORT из .env)
```

**Шаг 2. Переменные окружения backend**

```bash
NODE_ENV=production
DB_PATH=/var/www/data/app.sqlite
STORAGE_DIR=/var/www/data/storage
JWT_SECRET=<64-символьный случайный секрет>
WEB_ORIGIN=https://мир-самозанятых.рф
CORS_ORIGINS=https://мир-самозанятых.рф,https://<учётка>.github.io
PAYMENT_PROVIDER=<реальный провайдер, НЕ test>   # test отказывается в prod
SEED_DEMO_DATA=false                                # §54: никакого fake в prod
```

**Шаг 3. Сборка frontend для корневого домена**

```bash
VITE_BASE_PATH=/ VITE_API_URL=/api/v1 npm run build:web
```

**Шаг 4. SSL сертификат (Let's Encrypt через REG.RU)**

В панели REG.RU: «SSL-сертификаты» → бесплатный Let's Encrypt для
`мир-самозанятых.рф` + `www.мир-самозанятых.рф`. Это заменит
самоподписанный сертификат и уберёт `ssl_verify_result=18`.

**Шаг 5. Редиректы и canonical (`.htaccess` или nginx)**

```apache
RewriteEngine On
# HTTP → HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
# www → без www (canonical)
RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]
# SPA deep-link fallback
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

**Шаг 6. Проверка после деплоя**

```bash
curl -sI https://мир-самозанятых.рф            # 200 + HTTPS
curl -sI http://мир-самозанятых.рф             # 301 → https
dig +short мир-самозанятых.рф A                # IP хостинга
# robots.txt, sitemap.xml, canonical, OpenGraph — вручную в браузере
```

---

## 3. SEO: canonical и дубликаты (§49)

Канонический URL всегда указывает на основной домен:

```html
<link rel="canonical" href="https://мир-самозанятых.рф/" />
```

GitHub Pages копия не индексируется (`robots.txt: Disallow: /`),
поэтому дублирующего SEO-контента не возникает, но Pages остаётся
полностью рабочим fallback-размещением (§53).
