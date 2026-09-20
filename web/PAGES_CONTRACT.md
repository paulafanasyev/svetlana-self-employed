# Page development contract — web/src/pages/*.jsx

All workspace pages must follow this contract so the app stays consistent and
small. Reference implementations: `Clients.jsx` (full CRUD), `Svetlana.jsx`.

## Imports available

- `../api.js` — `api`, plus domain namespaces: `crm`, `tasks`, `calendar`,
  `documents`, `finance`, `ai`, `marketplace`, `vacancies`, `education`,
  `government` (`.grants`, `.grantsPersonalized`), `competitors`, `rag`,
  `notifications`, `profileApi`, `admin`, `auth`.
- `../ui.jsx` — `useResource(fetcher, deps)`, `Badge`, `Spinner`, `EmptyState`,
  `ErrorState`, `fmtDate`, `fmtMoney`, `plural`, `confirmAction`.
  `useResource` returns `{ data, loading, error, reload, setData }`.
- `../auth.jsx` — `useAuth()` → `{ user, profile, login, register, logout, refreshProfile }`.
- `react-router-dom` — `Link`, `NavLink`, `useNavigate`, `useParams`.
- `../components/SvetlanaAvatar.jsx` — `SvetlanaAvatar({ emotion, size, thinking })`.

## CSS classes available (styles.css) — do NOT add new CSS unless unavoidable

Layout: `.app .sidebar .nav .nav-group .brand .main .topbar .content`
Components: `.card .grid .grid-2 .grid-3 .btn .btn-primary .btn-ghost .btn-danger .btn-sm`
Forms: `.field label input select textarea`
Tables: `table.data th td`
Feedback: `.badge(.ok|.warn|.err|.info) .alert(.ok|.warn|.err|.info) .empty .ico`
Misc: `.muted .small .row(.between) .stack .spin .chat-* .hero .feature .faq`

## Rules

1. **No mock/fake data.** Every list comes from the real API. Loading → show an
   honest "Загружаю…", error → `<ErrorState error onRetry={reload} />`, empty →
   `<EmptyState>`.
2. Default export per page. Each page is rendered inside `.content` by App.jsx —
   do NOT render the sidebar/topbar yourself.
3. LIST responses are `{ data, total, limit, offset }`. Use `data?.data ?? []`.
   Some routes return a bare array — handle both with `?? []`.
4. Mutations: call the api method, then `setData(...)` to update the list
   optimistically-from-response (never invent rows). Confirm deletes with
   `confirmAction('...?')`.
5. Russian UI text. Keep it concise and professional.
6. Keep each page under ~250 lines. Extract a small local `Form` component when
   a create/edit form is needed.
