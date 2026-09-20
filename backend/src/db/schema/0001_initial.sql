-- ============================================================================
-- МИР САМОЗАНЯТЫХ — initial schema (migration 0001)
-- All CRM entities, AI/Светлана, RAG, marketplace, education, payments,
-- government programs, audit. Foreign keys enforced by the client.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Users, profiles, auth
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user','expert','training_center','admin')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','deleted')),
  email_verified_at INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_status ON users(role, status);

CREATE TABLE refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Privacy: consent log (GDPR/152-ФЗ style). Every consent change is a row.
CREATE TABLE consents (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL,          -- 'ai_processing' | 'marketing' | 'data_export' ...
  granted    INTEGER NOT NULL,       -- 1 granted, 0 withdrawn
  policy_version TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_consents_user ON consents(user_id, scope);

-- ---------------------------------------------------------------------------
-- Profiles (Personal work profile — §28: lives in DB, never in model weights)
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,
  avatar_kind     TEXT NOT NULL DEFAULT 'svetlana_default',
  profession      TEXT,             -- e.g. "Дизайнер"
  specialization  TEXT,             -- e.g. "Мобильные приложения"
  bio             TEXT,
  city            TEXT,
  work_geography  TEXT,             -- free text / region list
  schedule        TEXT,             -- e.g. "Удалённо, будни 10:00–19:00"
  experience_years INTEGER,
  -- Price policy floor: Светлана never proposes below this without asking.
  min_hourly_rate INTEGER,
  currency        TEXT NOT NULL DEFAULT 'RUB',
  goals           TEXT,             -- JSON array
  preferences     TEXT,             -- JSON object
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_profiles_user ON profiles(user_id);

CREATE TABLE skills (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE
);
CREATE TABLE profile_skills (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id   TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level      INTEGER NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 5),
  PRIMARY KEY (profile_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- Clients, companies, contacts, leads, deals
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'person' CHECK (type IN ('person','company')),
  name        TEXT NOT NULL,
  company_id  TEXT REFERENCES companies(id) ON DELETE SET NULL,
  email       TEXT,
  phone       TEXT,
  position    TEXT,
  city        TEXT,
  source      TEXT,                  -- 'referral' | 'marketplace' | 'import' ...
  status      TEXT NOT NULL DEFAULT 'lead'
              CHECK (status IN ('lead','active','paused','archived','lost')),
  tags        TEXT,                  -- JSON array
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_clients_owner ON clients(owner_id);
CREATE INDEX idx_clients_status ON clients(owner_id, status);

CREATE TABLE companies (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  inn        TEXT,
  website    TEXT,
  industry   TEXT,
  size       TEXT,
  notes      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_companies_owner ON companies(owner_id);
CREATE INDEX idx_companies_inn ON companies(inn);

CREATE TABLE contacts (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  email      TEXT,
  phone      TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_contacts_client ON contacts(client_id);

CREATE TABLE leads (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  value       INTEGER,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  stage       TEXT NOT NULL DEFAULT 'new'
              CHECK (stage IN ('new','qualified','proposal','negotiation','won','lost')),
  source      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_leads_owner_stage ON leads(owner_id, stage);

CREATE TABLE deals (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  lead_id     TEXT REFERENCES leads(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  stage       TEXT NOT NULL DEFAULT 'new'
              CHECK (stage IN ('new','proposal','won','lost','closed')),
  closed_at   INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_deals_owner ON deals(owner_id);

CREATE TABLE opportunities (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  est_value   INTEGER,
  probability INTEGER NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  due_at      INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_opportunities_owner ON opportunities(owner_id);

-- ---------------------------------------------------------------------------
-- Projects, tasks, subtasks, calendar
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  deal_id     TEXT REFERENCES deals(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning','active','review','done','cancelled')),
  budget      INTEGER,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  deadline    INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_projects_owner_status ON projects(owner_id, status);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo','in_progress','done','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low','medium','high','urgent')),
  due_at       INTEGER,
  completed_at INTEGER,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_tasks_owner_status ON tasks(owner_id, status);
CREATE INDEX idx_tasks_due ON tasks(due_at);
CREATE INDEX idx_tasks_project ON tasks(project_id);

CREATE TABLE subtasks (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_subtasks_task ON subtasks(task_id);

CREATE TABLE calendar_events (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER,
  location      TEXT,
  kind          TEXT NOT NULL DEFAULT 'meeting'
                CHECK (kind IN ('meeting','deadline','reminder','task','other')),
  -- iCalendar-style RRULE for recurring events ("Напомни каждый понедельник")
  rrule         TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_events_owner_start ON calendar_events(owner_id, starts_at);
CREATE INDEX idx_events_rrule ON calendar_events(rrule);

CREATE TABLE reminders (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   TEXT REFERENCES calendar_events(id) ON DELETE CASCADE,
  task_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  remind_at  INTEGER NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','push')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','snoozed','cancelled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_reminders_owner_time ON reminders(owner_id, remind_at);
CREATE INDEX idx_reminders_pending ON reminders(status, remind_at);

-- ---------------------------------------------------------------------------
-- Documents (§16 pipeline: request → questions → data → generation →
-- validation → preview → approval → document → storage → optional send)
-- ---------------------------------------------------------------------------
CREATE TABLE document_templates (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,      -- contract / act / invoice / offer / nda / kp / tz
  title       TEXT NOT NULL,
  description TEXT,
  body_html   TEXT NOT NULL,
  schema_json TEXT NOT NULL,             -- JSON schema of required fields
  version     INTEGER NOT NULL DEFAULT 1,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  template_id   TEXT REFERENCES document_templates(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL
                CHECK (kind IN ('contract','act','invoice','kp','offer','nda','tz','appendix','other')),
  title         TEXT NOT NULL,
  -- Pipeline state machine (§16). draft → data → generated → preview →
  -- approved → stored; optional sent_* after delivery + verification.
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','questions','data','generated','preview',
                                  'approved','stored','sent_email','sent_sign',
                                  'verified','archived','rejected')),
  data_json     TEXT,                    -- answers feeding the template
  body_html     TEXT,                    -- rendered content
  amount        INTEGER,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  pdf_path      TEXT,
  docx_path     TEXT,
  questions_json TEXT,                   -- clarification questions asked by Светлана
  -- §14 anti-hallucination: delivery claims must cite real evidence.
  sent_evidence TEXT,                    -- JSON {channel, message_id, sent_at, verified}
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_documents_owner_status ON documents(owner_id, status);
CREATE INDEX idx_documents_kind ON documents(owner_id, kind);

CREATE TABLE contracts (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  number        TEXT,
  amount        INTEGER,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  starts_at     INTEGER,
  ends_at       INTEGER,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','signed','terminated','expired')),
  signed_at     INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_contracts_owner ON contracts(owner_id);

-- ---------------------------------------------------------------------------
-- Invoices, payments, quotes, commercial offers
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  number      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','sent','paid','partial','cancelled','refunded')),
  due_at      INTEGER,
  paid_at     INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_invoices_owner_status ON invoices(owner_id, status);

CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invoice_id       TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  order_id         TEXT REFERENCES orders(id) ON DELETE SET NULL,
  -- Idempotency key (§26): same key never charges twice.
  idempotency_key  TEXT NOT NULL UNIQUE,
  provider         TEXT NOT NULL,          -- 'test' | 'yookassa' | 'sbp' ...
  provider_txn_id  TEXT,
  amount           INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'RUB',
  -- Commission split (§25): platform_fee + seller_amount == amount
  platform_fee     INTEGER NOT NULL DEFAULT 0,
  seller_amount    INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),
  failure_reason   TEXT,
  evidence         TEXT,                   -- JSON proof of provider result
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_payments_owner ON payments(owner_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);

CREATE TABLE quotes (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  valid_until INTEGER,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_quotes_owner ON quotes(owner_id);

CREATE TABLE commercial_offers (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body_html   TEXT,
  amount      INTEGER,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','sent','accepted','rejected')),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_offers_owner ON commercial_offers(owner_id);

-- ---------------------------------------------------------------------------
-- Marketplace: services/products, orders, applications, reviews
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id           TEXT PRIMARY KEY,
  seller_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT,
  price        INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'RUB',
  unit         TEXT NOT NULL DEFAULT 'project' CHECK (unit IN ('project','hour','month','piece')),
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_services_seller ON services(seller_id);
CREATE INDEX idx_services_published ON services(is_published, category);

CREATE TABLE products (
  id           TEXT PRIMARY KEY,
  seller_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  price        INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'RUB',
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_products_seller ON products(seller_id);

CREATE TABLE orders (
  id            TEXT PRIMARY KEY,
  buyer_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id    TEXT REFERENCES services(id) ON DELETE SET NULL,
  product_id    TEXT REFERENCES products(id) ON DELETE SET NULL,
  amount        INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  status        TEXT NOT NULL DEFAULT 'created'
                CHECK (status IN ('created','paid','in_progress','delivered','completed',
                                  'disputed','cancelled','refunded')),
  -- §25 commission snapshot at purchase time (config is live; history is fixed)
  commission_rate INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Marketplace project board (§21): customer posts, specialist applies
CREATE TABLE marketplace_projects (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  budget_min   INTEGER,
  budget_max   INTEGER,
  currency     TEXT NOT NULL DEFAULT 'RUB',
  category     TEXT,
  skills_json  TEXT,                       -- JSON array of skill names
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','in_progress','closed','cancelled')),
  deadline     INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_mp_customer ON marketplace_projects(customer_id);
CREATE INDEX idx_mp_status ON marketplace_projects(status);

CREATE TABLE applications (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES marketplace_projects(id) ON DELETE CASCADE,
  specialist_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT,
  proposed_price INTEGER,
  currency     TEXT NOT NULL DEFAULT 'RUB',
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_applications_project ON applications(project_id);
CREATE INDEX idx_applications_specialist ON applications(specialist_id);

CREATE TABLE reviews (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   TEXT REFERENCES orders(id) ON DELETE SET NULL,
  target_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_reviews_target ON reviews(target_id);

-- ---------------------------------------------------------------------------
-- Jobs (§22): vacancies, candidates
-- ---------------------------------------------------------------------------
CREATE TABLE vacancies (
  id          TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  salary_from INTEGER,
  salary_to   INTEGER,
  currency    TEXT NOT NULL DEFAULT 'RUB',
  city        TEXT,
  remote      INTEGER NOT NULL DEFAULT 0,
  skills_json TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','draft')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_vacancies_employer ON vacancies(employer_id);
CREATE INDEX idx_vacancies_status ON vacancies(status);

CREATE TABLE candidates (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vacancy_id  TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  resume      TEXT,
  status      TEXT NOT NULL DEFAULT 'applied'
              CHECK (status IN ('applied','screening','interview','offered','hired','rejected')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_candidates_vacancy ON candidates(vacancy_id);
CREATE INDEX idx_candidates_user ON candidates(user_id);

-- ---------------------------------------------------------------------------
-- Education marketplace (§24)
-- ---------------------------------------------------------------------------
CREATE TABLE experts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio          TEXT,
  is_verified  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_experts_user ON experts(user_id);

CREATE TABLE training_centers (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  inn          TEXT,
  is_verified  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_tc_user ON training_centers(user_id);

CREATE TABLE courses (
  id            TEXT PRIMARY KEY,
  author_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_kind   TEXT NOT NULL CHECK (author_kind IN ('expert','training_center')),
  title         TEXT NOT NULL,
  description   TEXT,
  price         INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  format        TEXT NOT NULL DEFAULT 'course'
                CHECK (format IN ('course','consultation','webinar','masterclass','materials')),
  duration_hours INTEGER,
  is_published  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_courses_author ON courses(author_id);
CREATE INDEX idx_courses_published ON courses(is_published, format);

CREATE TABLE enrollments (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  order_id   TEXT REFERENCES orders(id) ON DELETE SET NULL,
  progress   INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','completed','refunded','cancelled')),
  certificate_issued INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_enrollments_user ON enrollments(user_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);

-- ---------------------------------------------------------------------------
-- Government: grants, subsidies, programs (§18/§19)
-- Mutable legal facts carry source/version/effective dates (§18).
-- ---------------------------------------------------------------------------
CREATE TABLE government_programs (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL
                CHECK (kind IN ('grant','subsidy','social_contract','loan','training','compensation')),
  title         TEXT NOT NULL,
  description   TEXT,
  funder        TEXT,                     -- 'Федеральный' | region name | municipality
  region        TEXT,
  amount_min    INTEGER,
  amount_max    INTEGER,
  currency      TEXT NOT NULL DEFAULT 'RUB',
  url           TEXT NOT NULL,            -- official page
  doc_url       TEXT,
  -- §18 provenance: a fact is never stored without a citation.
  source_name   TEXT NOT NULL,
  published_at  INTEGER,
  effective_at  INTEGER,
  retrieved_at  INTEGER NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_gov_kind_active ON government_programs(kind, is_active);
CREATE INDEX idx_gov_region ON government_programs(region);

-- ---------------------------------------------------------------------------
-- Competitor intelligence (§27) — only observed, public, sourced facts
-- ---------------------------------------------------------------------------
CREATE TABLE competitors (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  website    TEXT,
  position   TEXT,
  notes      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_competitors_owner ON competitors(owner_id);

CREATE TABLE competitor_observations (
  id            TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  aspect        TEXT NOT NULL,             -- 'service' | 'price' | 'review' | 'content' ...
  value         TEXT NOT NULL,
  observed_at   INTEGER NOT NULL,
  source_url    TEXT NOT NULL,             -- §27: no invented facts
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_compobs_competitor ON competitor_observations(competitor_id);

-- ---------------------------------------------------------------------------
-- AI: conversations, actions, tool calls, evidence (§13/§14)
-- ---------------------------------------------------------------------------
CREATE TABLE ai_conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ai_conv_user ON ai_conversations(user_id);

CREATE TABLE ai_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content         TEXT NOT NULL,
  -- Светлана's emotional state for the turn (§12) — deterministic, never random
  emotion         TEXT,
  provider        TEXT,
  model           TEXT,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_rub        REAL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ai_msg_conv ON ai_messages(conversation_id);

-- §13: every step Светлана takes is recorded, with evidence.
CREATE TABLE ai_actions (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_id         TEXT NOT NULL,
  tool            TEXT NOT NULL,
  args_json       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','succeeded','failed','blocked','not_proven')),
  result_json     TEXT,
  -- §14 anti-hallucination chain: tool execution + result + verification
  evidence        TEXT,                   -- JSON array of evidence records
  verified        INTEGER NOT NULL DEFAULT 0,
  human_approved  INTEGER NOT NULL DEFAULT 0,
  started_at      INTEGER,
  finished_at     INTEGER,
  error           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ai_actions_conv ON ai_actions(conversation_id);
CREATE INDEX idx_ai_actions_user_status ON ai_actions(user_id, status);

CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,               -- 'create' | 'update' | 'delete' | 'login' ...
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     TEXT,                        -- JSON diff summary
  ip         TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);

-- ---------------------------------------------------------------------------
-- RAG (§29): knowledge documents, chunks, retrieval, freshness, permissions
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge_documents (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,             -- 'fns' | 'law' | 'trud' | 'msp' | 'user' | 'manual'
  source_name  TEXT NOT NULL,
  source_url   TEXT,
  title        TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text'
               CHECK (content_type IN ('text','pdf','docx','image','html')),
  -- §18 versioning / freshness
  published_at INTEGER,
  effective_at INTEGER,
  retrieved_at INTEGER NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','superseded','deleted')),
  -- §29 permission boundary
  visibility   TEXT NOT NULL DEFAULT 'public'
               CHECK (visibility IN ('public','user','private')),
  owner_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_kd_source ON knowledge_documents(source, status);
CREATE INDEX idx_kd_owner ON knowledge_documents(owner_id);

CREATE TABLE knowledge_chunks (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  text            TEXT NOT NULL,
  embedding       TEXT,                   -- JSON vector (provider-injected)
  token_count     INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_chunks_doc ON knowledge_chunks(document_id);

-- Vector retrieval: embeddings are stored as JSON in knowledge_chunks.embedding
-- and ranked by pure-JS cosine similarity in src/ai/rag.js. This keeps the DB
-- dependency-free (node:sqlite ships with Node >=22 and has no sqlite-vec
-- extension bundled), while still supporting semantic search + reranking.
-- If sqlite-vec is ever loaded as an extension, a vec0 mirror can be added in a
-- later migration without changing this retrieval contract.

CREATE TABLE rag_citations (
  id          TEXT PRIMARY KEY,
  action_id   TEXT REFERENCES ai_actions(id) ON DELETE CASCADE,
  message_id  TEXT REFERENCES ai_messages(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_id    TEXT REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
  quote       TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_citations_msg ON rag_citations(message_id);
CREATE INDEX idx_citations_action ON rag_citations(action_id);

-- ---------------------------------------------------------------------------
-- Notifications + system config
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_notifs_user_unread ON notifications(user_id, read_at);

-- §25/§26: commission & provider config lives in DB, not in frontend code.
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,             -- JSON
  description TEXT,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seller balances (§25 payout side)
CREATE TABLE seller_balances (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available  INTEGER NOT NULL DEFAULT 0,
  in_dispute INTEGER NOT NULL DEFAULT 0,
  paid_out   INTEGER NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'RUB',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE payouts (
  id         TEXT PRIMARY KEY,
  seller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'RUB',
  provider   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','succeeded','failed','cancelled')),
  evidence   TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_payouts_seller ON payouts(seller_id);
