# Atria Dawn Preview для Светланы

Светлана уже использует первый настроенный AI-провайдер из `AI_PROVIDER_ORDER`. Для Atria задаются:

- `ATRIA_API_KEY` — секретный API-ключ. Не коммитить и не помещать во frontend.
- `ATRIA_BASE_URL=https://api.atria-asi.ai/v1`
- `ATRIA_MODEL=Atria-Dawn-Preview`
- `AI_PROVIDER_ORDER=atria,openrouter,openai,local`

## Где создать ключ

Официальный API Console Atria: https://api.atria-asi.ai/console

Документация: https://api.atria-asi.ai/docs

## Где хранить ключ

Для текущего production backend ключ должен находиться в **Render → Environment**, потому что именно Render запускает backend. Имя переменной строго:

`ATRIA_API_KEY`

Путь в Render: Dashboard → сервис `mir-samozanyatykh-api-frankfurt` → Environment → Add Environment Variable.

Значения `ATRIA_BASE_URL` и `ATRIA_MODEL` уже закреплены в `render.yaml`; ключ остаётся секретом.

## GitHub Secrets

GitHub Actions Secret можно создать здесь:

https://github.com/paulafanasyev/svetlana-self-employed/settings/secrets/actions

Имя: `ATRIA_API_KEY`

Важно: GitHub Actions Secrets **не передаются автоматически** в уже запущенный Render-сервис. Поэтому для работы Светланы в production ключ необходимо также добавить в Render Environment, либо настроить отдельный защищённый механизм деплоя, который передаст секрет в Render.

## Что видно пользователю

Ключ не попадает в web bundle, HTML, localStorage или публичные ответы API. Backend передаёт его Atria только сервер-сервером через заголовок `Authorization: Bearer …`.

## Контроль работоспособности

После добавления ключа health endpoint покажет только имя включённого провайдера (`atria`), но не ключ. Фактическая проверка ответа Atria выполняется отдельным запросом Светланы в рабочем кабинете.
