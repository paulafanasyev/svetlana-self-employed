# МИР САМОЗАНЯТЫХ — СВЕТЛАНА 3.0

Единый продукт: **Web + Android + Backend + AI + CRM + Marketplace**.
Светлана — единый AI-оператор платформы.

```
                 МИР САМОЗАНЯТЫХ
                       │
              ┌────────┴────────┐
              │                 │
            WEB              ANDROID
              │                 │
              └────────┬────────┘
                       │
                 COMMON API  (единый backend)
                       │
                   BACKEND
                       │
                  DATABASE   (единая SQLite)
                       │
                 AI PLATFORM  (единый abstraction)
                       │
                   СВЕТЛАНА
```

Одна кодовая база. Один backend. Одна база данных. Один набор
пользовательских данных. Никаких параллельных проектов.

---

## Структура репозитория

| Путь | Назначение |
| --- | --- |
| `backend/` | Единый backend: Fastify + SQLite, auth, CRM, documents, AI/Светлана, marketplace, education, payments, RAG |
| `web/` | Единый web-клиент (React + Vite). Та же сборка идёт на `мир-самозанятых.рф` и на GitHub Pages |
| `android/` | Android-клиент на Kotlin + Jetpack Compose. Использует тот же backend |
| `.github/workflows/ci.yml` | CI/CD: install → test → build → security → GitHub Pages → Android APK |

---

## Быстрый старт (локально)

Требуется **Node.js ≥ 22** (используется встроенный `node:sqlite` —
никаких внешних баз данных не нужно).

```bash
# 1. Установить зависимости
npm install

# 2. Подготовить backend-окружение
cp backend/.env.example backend/.env
#   затем сгенерировать JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Развернуть БД + демонстрационные данные
npm run migrate
npm run seed

# 4. Запустить backend и web одновременно
npm run dev
```

- Backend: <http://localhost:4000>
- Web: <http://localhost:5173>

### Отдельные команды

```bash
npm run dev:backend      # только backend
npm run dev:web          # только web
npm run build            # production-сборка backend + web
npm start                # production-сервер backend
npm test                 # все тесты (backend + web)
npm run test:backend     # 24 теста: unit + 12 E2E-потоков
npm run test:web         # 10 тестов контракта API-клиента
npm run e2e              # только E2E (10 обязательных потоков §44)
```

---

## Единый backend

Fastify 5, TypeScript-free JavaScript (ES modules), SQLite через
`node:sqlite`. Всё за одним API: `/api/v1`.

Поддерживает: authentication, authorization, RBAC, users, profiles,
CRM (clients, companies, contacts, leads, deals, projects, tasks,
subtasks, invoices, payments, contracts, documents, quotes, meetings,
calendar, reminders, opportunities, candidates, vacancies, applications,
services, products, experts, courses, grants, subsidies, government
programs, competitors, knowledge documents, AI conversations, AI actions,
audit logs), marketplace, education, payments, notifications, RAG,
admin panel.

### Безопасность

- JWT access + refresh tokens, bcrypt-хеширование паролей
- **IDOR-защита**: каждая запись фильтруется по `owner_id` —
  пользователь не может прочитать чужие данные (покрыто E2E-тестом)
- RBAC-роли (`user` / `admin`)
- Rate limiting на auth-эндпоинтах
- Audit logs на чувствительные действия
- Helmet + CORS
- Все секреты — в переменных окружения, **никогда** в frontend или APK

---

## Светлана — AI-оператор

Архитектура:

```
USER → SVETLANA → INTENT → PLANNER → POLICY ENGINE
     → TOOL REGISTRY → EXECUTION → EVIDENCE
     → VERIFICATION → RESULT → SVETLANA → USER
```

### Анти-галлюцинация (§14)

Светлана **никогда** не утверждает, что действие выполнено, пока
`tool execution + successful result + verification evidence` не докажут
это. Статусы:

- `VERIFIED` — выполнение + верификация подтверждены
- `NOT PROVEN` —success есть, но верификация не пройдена
- `BLOCKED` — требовалось подтверждение пользователя
- `FAILED` — выполнение не удалось
- `PENDING` — ещё в работе

### Emotion Engine (§12)

Эмоции — детерминированная функция от `context + task state + risk +
result + confidence`. Никаких случайных эмоций. 10 состояний:
IDLE, LISTENING, THINKING, FOCUSED, EXPLAINING, HAPPY, SUCCESS,
CONCERNED, WARNING, WAITING.

Чувствительные действия, ожидающие подтверждения, дают **WAITING**
(открытая поза, приглашение подтвердить), а не WARNING — это приглашение,
а не тревога.

### AI-провайдеры (§30)

Абстракция `AIProvider` с fallback, retry, timeout, routing,
cost tracking: Atria, OpenAI, OpenRouter + детерминированный
`local`-планер (работает офлайн, честно помечен).

---

## Тесты

**34 теста, все зелёные.**

Backend (24): emotion engine, анти-галлюцинация, RAG chunking, комиссии,
+ 12 E2E-потоков против реального in-memory backend, включая:

1. REGISTER → ONBOARDING → SVETLANA → PROFILE
2. SVETLANA → CREATE CLIENT → CRM → VERIFIED
3. SVETLANA → CREATE CONTRACT → PREVIEW → APPROVAL → DOCUMENT
4. SVETLANA → FIND GRANTS → RAG → SOURCES
5. USER → FIND CLIENTS → MATCHING → RESULTS
6. CUSTOMER → CREATE PROJECT → SPECIALIST → APPLICATION
7. EXPERT → CREATE COURSE → PURCHASE → COMMISSION
8. ANDROID → CREATE TASK → WEB SEES TASK
9. WEB → CREATE CLIENT → ANDROID SEES CLIENT
10. TOOL ACTION → EXECUTION → EVIDENCE → VERIFICATION
11. §45: tool failure reported honestly (FAILED, не фейковый успех)
12. §39: IDOR — пользователь не видит чужих клиентов

Web (10): контракт API-клиента — токены, single-retry на 401,
поведение при сетевом сбое и 403, очистка учётных данных.

---

## Android

Kotlin + Jetpack Compose, один модуль. Тот же backend, та же модель
данных. Минификация R8 для release-сборки.

```bash
cd android && gradle assembleDebug     # debug APK
cd android && gradle assembleRelease    # release APK (minified)
```

---

## Развёртывание

### GitHub Pages (secondary public deployment)

CI собирает web один раз и публикует через GitHub Actions:
`.github/workflows/ci.yml` → `actions/deploy-pages`.

- SPA deep-links поддержаны через `404.html` = `index.html`
- Base path `/​<repo>/​` для project sites
- `robots.txt` запрещает индексацию Pages-копии (чтобы не было
  дублей SEO) — канонический URL всегда основной домен

### мир-самозанятых.рф (primary canonical domain)

Та же сборка, `VITE_BASE_PATH=/`. См. `DEPLOYMENT.md`.

---

## Переменные окружения

См. `backend/.env.example`. Главное:

- `JWT_SECRET` — **обязательно** длинный случайный секрет (≥ 32 символов)
- `DB_PATH` — путь к SQLite (по умолчанию `./data/app.sqlite`)
- `AI_PROVIDER_ORDER` — порядок fallback провайдеров
- `PAYMENT_PROVIDER` — `test` (песочница) или реальный провайдер
- `SEED_DEMO_DATA` — демо-данные только при явном `true`

**Ни один API-ключ не попадает в frontend или APK** (проверяется
secret-scan шагом в CI).

---

## Лицензия

UNLICENSED (проприетарный продукт).
