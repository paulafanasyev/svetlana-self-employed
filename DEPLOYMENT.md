# Развёртывание «Мира Самозанятых»

Проект использует единый исходный код для web, Android и серверной части.

## Production backend

Сервер запускается из корня репозитория:

```bash
npm ci
npm run build
npm start
```

Обязательные переменные:

```text
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
DB_PATH=/var/data/app.sqlite
STORAGE_DIR=/var/data/storage
JWT_SECRET=<случайный секрет от 32 символов>
WEB_ORIGIN=<основной HTTPS-адрес сайта>
CORS_ORIGINS=<разрешённые HTTPS-адреса>
PAYMENT_PROVIDER=<реальный провайдер>
SEED_DEMO_DATA=false

AI_API_KEY=<секретный ключ серверного модельного контура>
AI_BASE_URL=<закрытый HTTPS endpoint модельного сервиса>
AI_MODEL=svetlana-core
AI_PROVIDER_ORDER=primary,local
```

Ключ модельного сервиса хранится только на сервере. Он не должен попадать в web bundle, Android APK, Git или ответы API.

## Web

Для GitHub Pages используется project base path. Публичный API-адрес задаётся переменной сборки:

```text
VITE_API_URL=<публичный HTTPS API>
```

Когда frontend и backend обслуживаются одним origin, допустимо:

```text
VITE_API_URL=/api/v1
```

Технические адреса инфраструктуры не должны быть зашиты в исходный код.

## Android

Production URL передаётся при сборке:

```bash
cd android
gradle assembleRelease bundleRelease -PmirApiBaseUrl=<публичный HTTPS API>/api/v1
```

Секретов в APK нет.

## Публикация

GitHub Actions выполняет проверку, сборку web и Android и публикацию GitHub Pages.

Основной домен `мир-самозанятых.рф` подключается отдельно через доступный хостинг и DNS. До восстановления домена GitHub Pages остаётся публичной резервной точкой.

## Контакты

АНО «Центр поддержки самозанятых «Мир Самозанятых»  
115612, Москва, ул. Ключевая, дом 18, этаж 1 пом. 6, ком. 11  
Москва, Варшавское шоссе, дом 76 корпус 2, Коворкинг Центр НКО ЮАО  
ИНН 9724016805 · ОГРН 1207700247864 · КПП 772401001  
+7 (919) 999-13-36  
mir.samozanyatyh@yandex.ru
