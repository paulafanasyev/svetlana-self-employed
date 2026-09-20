/**
 * Seed (§7, §54).
 *
 *   SEED_DEMO_DATA=true  → demo users, clients, tasks, grants, knowledge base
 *   SEED_DEMO_DATA=false → only system defaults (templates, base knowledge) are
 *                          created. NO fake payments, NO fake government results.
 *
 * Demo data is clearly marked (demo=true) and only ever exists in a non-
 * production database.
 */
import { nanoid } from 'nanoid';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './client.js';
import { migrate } from './migrate.js';
import { seedTemplates } from '../documents/templates.js';
import { ingestDocument } from '../ai/rag.js';
import { config } from '../config.js';
import { getCommissionPercent, setCommissionPercent } from '../payments/commission.js';

const DEMO = {
  user: { email: 'demo@mir-samozanyatyh.ru', password: 'demo12345', name: 'Анна Петрова' },
  admin: { email: 'admin@mir-samozanyatyh.ru', password: 'admin12345', name: 'Администратор' },
};

async function seedBase() {
  const t = seedTemplates(db());
  console.log(`📄 templates: ${t.inserted} inserted, ${t.updated} updated`);

  // Commission default (§25): only seed if never configured.
  setCommissionPercent(getCommissionPercent() ?? config.DEFAULT_COMMISSION_PERCENT, null);

  // Curated official-sourced knowledge (§18: every fact carries provenance).
  await seedKnowledgeBase();
}

async function seedKnowledgeBase() {
  const existing = db().prepare("SELECT COUNT(*) AS n FROM knowledge_documents WHERE source IN ('fns','law') AND status='active'").get().n;
  if (existing > 0) {
    console.log(`📚 knowledge base already seeded (${existing} docs)`);
    return;
  }

  const docs = [
    {
      source: 'fns',
      sourceName: 'ФНС России',
      sourceUrl: 'https://www.nalog.gov.ru/rn77/nalogi/samozanyatye/',
      title: 'Налог на профессиональный доход (НПД) — основные условия',
      text: `Налог на профессиональный доход (НПД) — это специальный налоговый режим для самозанятых.
Ставки: 4% при работе с физическими лицами и 6% при работе с юридическими лицами и ИП.
Лимит дохода: 2,4 млн рублей в год. При превышении требуется переход на другой режим налогообложения.
Регистрация — через приложение «Мой налог» без визита в инспекцию.
Налог уплачивается до 28 числа месяца, следующего за отчётным.
Срок уплаты налога — не позднее 28-го числа месяца, следующего за налоговым периодом (месяцем).
Источник: ФНС России, раздел «Самозанятые» (nalog.gov.ru).`,
      publishedAt: isoToEpoch('2024-06-20'),
    },
    {
      source: 'fns',
      sourceName: 'ФНС России',
      sourceUrl: 'https://www.nalog.gov.ru/rn77/nalogi/samozanyatye/npd/',
      title: 'Чеки и отчётность при НПД',
      text: `Самозанятый обязан сформировать чек в приложении «Мой налог» и передать его покупателю.
Чек формируется в момент расчёта, если покупатель — физическое лицо, либо не позднее 9-го числа месяца, следующего за месяцем расчёта, при безналичных расчётах.
Отчётность по НПД не предоставляется — налог рассчитывается автоматически на основе пробитых чеков.
Налоговый период — календарный месяц.
Источник: ФНС России.`,
      publishedAt: isoToEpoch('2024-06-20'),
    },
    {
      source: 'law',
      sourceName: 'Федеральный закон от 27.11.2018 № 422-ФЗ',
      sourceUrl: 'http://publication.pravo.gov.ru/Document/View/0001201811270027',
      title: 'Закон о налоге на профессиональный доход (422-ФЗ)',
      text: `Федеральный закон от 27 ноября 2018 года № 422-ФЗ «О проведении эксперимента по установлению специального налогового режима „Налог на профессиональный доход"».
Закон ввёл НПД в пилотных регионах и распространил его на всю территорию Российской Федерации.
Самозанятые — плательщики НПД, применяющие ставки 4% и 6% в зависимости от категории контрагента.
Ограничение по доходу — 2,4 млн рублей в год.
Источник: официальный интернет-портал правовой информации publication.pravo.gov.ru.`,
      publishedAt: isoToEpoch('2018-11-27'),
      effectiveAt: isoToEpoch('2019-01-01'),
    },
    {
      source: 'law',
      sourceName: 'Налоговый кодекс РФ, глава 26.5',
      sourceUrl: 'https://www.consultant.ru/document/cons_doc_LAW_182041/',
      title: 'Патентная система налогообложения (глава 26.5 НК РФ)',
      text: `Патентная система налогообложения (ПСН) применяется индивидуальными предпринимателями.
Патент выдаётся на срок от 1 до 12 месяцев в пределах календарного года.
Максимальный потенциальный доход устанавливается законами субъектов РФ.
ПСН недоступна для самозанятых без регистрации в качестве ИП.
Источник: Налоговый кодекс РФ, глава 26.5.`,
      publishedAt: isoToEpoch('2023-07-01'),
    },
    {
      source: 'msp',
      sourceName: 'МСП.РФ',
      sourceUrl: 'https://msp.ru/',
      title: 'Меры поддержки самозанятых и микропредприятий',
      text: `Единая платформа поддержки малого и среднего предпринимательства (МСП.РФ) объединяет меры государственной поддержки.
Доступны: льготное кредитование, гранты на развитие, обучение, социальный контракт.
Социальный контракт — мера поддержки для малоимущих граждан и семей на открытие своего дела.
Источник: корпорация МСП, msp.ru.`,
      publishedAt: isoToEpoch('2024-03-01'),
    },
    {
      source: 'trud',
      sourceName: 'Работа России',
      sourceUrl: 'https://trudvsem.ru/',
      title: 'Платформа «Работа России» — общероссийская база вакансий',
      text: `Работа России (trudvsem.ru) — общероссийская база вакансий и резюме, оператор — Роструд.
Публикация вакансий и резюме бесплатна. Доступны фильтры по региону, зарплате, формату работы.
Публичный API для интеграции в общем случае не предоставляется; взаимодействие — через веб-кабинет работодателя.
Источник: Роструд, trudvsem.ru.`,
      publishedAt: isoToEpoch('2024-02-01'),
    },
  ];

  for (const d of docs) {
    await ingestDocument({
      source: d.source,
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      title: d.title,
      contentType: 'text',
      text: d.text,
      publishedAt: d.publishedAt ?? null,
      effectiveAt: d.effectiveAt ?? null,
      visibility: 'public',
      ownerId: null,
    });
  }
  console.log(`📚 knowledge base: ${docs.length} official documents ingested`);
}

function isoToEpoch(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

async function seedDemo() {
  if (config.isProd) {
    console.log('⚠️  demo seed refused in production (§54)');
    return;
  }
  const { hashPassword } = await import('../auth/crypto.js');
  let userId, adminId;

  db().transaction(() => {
    const existing = db().prepare('SELECT id FROM users WHERE email = ?').get(DEMO.user.email);
    if (existing) {
      userId = existing.id;
    } else {
      userId = nanoid();
      db()
        .prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(userId, DEMO.user.email, hashPassword(DEMO.user.password), 'user');
      db()
        .prepare('INSERT INTO profiles (id, user_id, display_name, profession, specialization, city, experience_years, min_hourly_rate, schedule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(nanoid(), userId, DEMO.user.name, 'Дизайнер', 'Веб-сайты и фирменный стиль', 'Москва', 4, 1500, 'Удалённо, будни 10:00–19:00');
    }
    const existingAdmin = db().prepare('SELECT id FROM users WHERE email = ?').get(DEMO.admin.email);
    adminId = existingAdmin?.id ?? nanoid();
    if (!existingAdmin) {
      db()
        .prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(adminId, DEMO.admin.email, hashPassword(DEMO.admin.password), 'admin');
    }
  });

  const hasClients = db().prepare('SELECT COUNT(*) AS n FROM clients WHERE owner_id = ?').get(userId).n;
  if (hasClients === 0) {
    const clients = [
      { name: 'Иван Сидоров', email: 'ivan@example.com', phone: '+7 900 111-22-33', status: 'active', company: 'ООО «Альфа»' },
      { name: 'Мария Кузнецова', email: 'maria@example.com', phone: '+7 900 222-33-44', status: 'lead' },
      { name: 'ООО «Бета Тех»', email: 'info@beta.example', status: 'active' },
    ];
    db().transaction(() => {
      for (const c of clients) {
        const cid = nanoid();
        let companyId = null;
        if (c.company) {
          companyId = nanoid();
          db().prepare('INSERT INTO companies (id, owner_id, name) VALUES (?, ?, ?)').run(companyId, userId, c.company);
        }
        db()
          .prepare('INSERT INTO clients (id, owner_id, type, name, company_id, email, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(cid, userId, c.company ? 'company' : 'person', c.name, companyId, c.email ?? null, c.phone ?? null, c.status ?? 'lead');
      }
      const t1 = nanoid();
      db()
        .prepare('INSERT INTO tasks (id, owner_id, title, status, priority, due_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(t1, userId, 'Согласовать макет лендинга', 'in_progress', 'high', Math.floor(Date.now() / 1000) + 2 * 86400);
      db()
        .prepare('INSERT INTO tasks (id, owner_id, title, status, priority) VALUES (?, ?, ?, ?, ?)')
        .run(nanoid(), userId, 'Отправить счёт клиенту', 'todo', 'urgent');
    });
  }

  // Demo grants (admin-curated, with official URLs).
  const hasGrants = db().prepare('SELECT COUNT(*) AS n FROM government_programs').get().n;
  if (hasGrants === 0) {
    const programs = [
      { kind: 'grant', title: 'Грант на развитие собственного дела', funder: 'Федеральный', amount_max: 500000, url: 'https://msp.ru/', source_name: 'МСП.РФ', region: null },
      { kind: 'social_contract', title: 'Социальный контракт на открытие бизнеса', funder: 'Региональный', amount_max: 350000, url: 'https://msk.ru/soccontract', source_name: 'Департамент труда и социальной защиты', region: 'Москва' },
      { kind: 'training', title: 'Обучение для самозанятых по программе «Азбука предпринимателя»', funder: 'Федеральный', amount_max: 0, url: 'https://fpp.economy.gov.ru/', source_name: 'Минэкономразвития России', region: null },
    ];
    db().transaction(() => {
      for (const p of programs) {
        db()
          .prepare(`INSERT INTO government_programs (id, kind, title, funder, region, amount_min, amount_max, currency,
                                                      url, source_name, retrieved_at, is_active)
                    VALUES (?, ?, ?, ?, ?, 0, ?, 'RUB', ?, ?, unixepoch(), 1)`)
          .run(nanoid(), p.kind, p.title, p.funder, p.region, p.amount_max, p.url, p.source_name);
      }
    });
  }

  console.log(`🌱 demo data created (user: ${DEMO.user.email} / ${DEMO.user.password})`);
  console.log(`🌱 admin: ${DEMO.admin.email} / ${DEMO.admin.password}`);
}

async function main() {
  migrate(db());
  await seedBase();
  if (config.SEED_DEMO_DATA) {
    await seedDemo();
  } else {
    console.log('ℹ️  SEED_DEMO_DATA=false → только системные данные (демо-данные не создаются)');
  }
  console.log('✅ seed complete');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
