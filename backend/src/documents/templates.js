/**
 * Document templates (§16): contract / act / invoice / kp / offer / nda / tz / appendix.
 *
 * Each template declares:
 *  - body_html: a Handlebars-free {{var}} template rendered server-side
 *  - schema_json: the fields Светлана must collect before generation
 *
 * Legal wording is intentionally a sound, general-purpose Russian template —
 * it is a starting point, not legal advice, and the UI says so.
 */

import { nanoid } from 'nanoid';

const renderable = (vars) => vars;

export const TEMPLATES = [
  {
    slug: 'contract',
    title: 'Договор оказания услуг',
    description: 'Базовый договор возмездного оказания услуг между самозанятым и заказчиком',
    schema_json: renderable([
      { key: 'contractor_name', label: 'ФИО исполнителя', type: 'string', required: true },
      { key: 'contractor_inn', label: 'ИНН исполнителя', type: 'string', required: true },
      { key: 'client_name', label: 'Наименование заказчика', type: 'string', required: true },
      { key: 'client_repr', label: 'Действует на основании', type: 'string', required: false, default: 'Устава' },
      { key: 'service_title', label: 'Предмет договора (услуги)', type: 'text', required: true },
      { key: 'amount', label: 'Стоимость, ₽', type: 'number', required: true },
      { key: 'deadline', label: 'Срок оказания услуг', type: 'string', required: true },
      { key: 'payment_terms', label: 'Порядок оплаты', type: 'string', required: false, default: '100% предоплата' },
      { key: 'city', label: 'Город', type: 'string', required: false, default: 'Москва' },
      { key: 'start_date', label: 'Дата начала', type: 'date', required: true },
    ]),
    body_html: `<h1>Договор возмездного оказания услуг № {{number}}</h1>
<p class="muted">г. {{city}}, «{{start_date}}»</p>
<p>{{contractor_name}}, именуемый(ая) в дальнейшем <b>Исполнитель</b>, являющийся плательщиком налога на профессиональный доход (ИНН {{contractor_inn}}), с одной стороны, и {{client_name}}, именуемое(ый) в дальнейшем <b>Заказчик</b>, в лице {{client_repr}}, с другой стороны, заключили настоящий договор о нижеследующем.</p>
<h2>1. Предмет договора</h2>
<p>Исполнитель обязуется оказать следующие услуги: {{service_title}}, а Заказчик обязуется принять и оплатить их.</p>
<h2>2. Срок оказания услуг</h2>
<p>Услуги оказываются в срок до «{{deadline}}».</p>
<h2>3. Стоимость и порядок оплаты</h2>
<p>Стоимость услуг составляет <b>{{amount}} рублей</b> (без НДС). Оплата производится на условиях: {{payment_terms}}.</p>
<h2>4. Права и обязанности сторон</h2>
<p>Исполнитель обязуется оказать услуги качественно и в срок. Заказчик обязуется предоставить необходимую информацию и принять результат.</p>
<h2>5. Ответственность</h2>
<p>За неисполнение обязательств стороны несут ответственность в соответствии с законодательством Российской Федерации.</p>
<h2>6. Заключительные положения</h2>
<p>Настоящий договор вступает в силу с момента подписания и действует до полного исполнения обязательств сторонами. Все изменения оформляются письменно.</p>
<table class="sign">
<tr><td><b>Исполнитель:</b><br>{{contractor_name}}<br>ИНН {{contractor_inn}}</td>
<td><b>Заказчик:</b><br>{{client_name}}</td></tr>
</table>`,
  },
  {
    slug: 'act',
    title: 'Акт сдачи-приёмки оказанных услуг',
    description: 'Закрывающий акт к договору оказания услуг',
    schema_json: renderable([
      { key: 'number', label: 'Номер акта', type: 'string', required: false },
      { key: 'contract_number', label: 'Номер договора', type: 'string', required: true },
      { key: 'contractor_name', label: 'ФИО исполнителя', type: 'string', required: true },
      { key: 'client_name', label: 'Наименование заказчика', type: 'string', required: true },
      { key: 'service_title', label: 'Оказанные услуги', type: 'text', required: true },
      { key: 'amount', label: 'Стоимость, ₽', type: 'number', required: true },
      { key: 'date', label: 'Дата акта', type: 'date', required: true },
      { key: 'city', label: 'Город', type: 'string', required: false, default: 'Москва' },
    ]),
    body_html: `<h1>Акт сдачи-приёмки оказанных услуг № {{number}}</h1>
<p class="muted">г. {{city}}, «{{date}}»</p>
<p>Исполнитель {{contractor_name}} и Заказчик {{client_name}} составили настоящий акт о том, что по договору {{contract_number}} оказаны следующие услуги:</p>
<p>{{service_title}}</p>
<p>Стоимость оказанных услуг составляет <b>{{amount}} рублей</b>. Услуги оказаны в полном объёме и в срок. Стороны претензий друг к другу не имеют.</p>
<table class="sign">
<tr><td><b>Исполнитель:</b><br>{{contractor_name}}</td>
<td><b>Заказчик:</b><br>{{client_name}}</td></tr>
</table>`,
  },
  {
    slug: 'invoice',
    title: 'Счёт на оплату',
    description: 'Счёт для безналичной оплаты физическим лицом',
    schema_json: renderable([
      { key: 'number', label: 'Номер счёта', type: 'string', required: false },
      { key: 'contractor_name', label: 'ФИО получателя', type: 'string', required: true },
      { key: 'client_name', label: 'Плательщик', type: 'string', required: true },
      { key: 'purpose', label: 'Назначение платежа', type: 'text', required: true },
      { key: 'amount', label: 'Сумма, ₽', type: 'number', required: true },
      { key: 'due_date', label: 'Срок оплаты', type: 'date', required: false },
    ]),
    body_html: `<h1>Счёт на оплату № {{number}}</h1>
<p>Получатель: <b>{{contractor_name}}</b> (плательщик налога на профессиональный доход)</p>
<p>Плательщик: {{client_name}}</p>
<table class="kv">
<tr><th>Назначение</th><td>{{purpose}}</td></tr>
<tr><th>Сумма</th><td><b>{{amount}} ₽</b></td></tr>
{{#if due_date}}<tr><th>Срок оплаты</th><td>{{due_date}}</td></tr>{{/if}}
</table>
<p class="muted">Оплата по счёту подтверждает согласие с условиями оказания услуг.</p>`,
  },
  {
    slug: 'kp',
    title: 'Коммерческое предложение',
    description: 'КП для ответа на запрос заказчика',
    schema_json: renderable([
      { key: 'contractor_name', label: 'От кого', type: 'string', required: true },
      { key: 'client_name', label: 'Кому', type: 'string', required: true },
      { key: 'offer_title', label: 'Заголовок', type: 'string', required: true },
      { key: 'offer_body', label: 'Содержание', type: 'text', required: true },
      { key: 'amount', label: 'Стоимость, ₽', type: 'number', required: true },
      { key: 'terms', label: 'Условия и сроки', type: 'string', required: true },
    ]),
    body_html: `<h1>{{offer_title}}</h1>
<p>Для: {{client_name}}</p>
<p>От: {{contractor_name}}</p>
<div class="offer">{{offer_body}}</div>
<h2>Стоимость и условия</h2>
<p>Стоимость: <b>{{amount}} ₽</b>. Условия и сроки: {{terms}}.</p>`,
  },
  {
    slug: 'offer',
    title: 'Публичная оферта',
    description: 'Оферта об оказании услуг физическим лицом',
    schema_json: renderable([
      { key: 'contractor_name', label: 'ФИО', type: 'string', required: true },
      { key: 'contractor_inn', label: 'ИНН', type: 'string', required: true },
      { key: 'service_title', label: 'Услуги', type: 'text', required: true },
      { key: 'amount', label: 'Стоимость, ₽', type: 'number', required: true },
      { key: 'payment_terms', label: 'Порядок оплаты', type: 'string', required: false, default: '100% предоплата' },
      { key: 'city', label: 'Город', type: 'string', required: false, default: 'Москва' },
    ]),
    body_html: `<h1>Публичная оферта об оказании услуг</h1>
<p class="muted">г. {{city}}</p>
<p>{{contractor_name}} (ИНН {{contractor_inn}}) предлагает любому лицу, акцептировавшему настоящую оферту, оказание следующих услуг: {{service_title}}.</p>
<h2>Стоимость и порядок оплаты</h2>
<p>Стоимость услуг составляет <b>{{amount}} рублей</b>. Оплата: {{payment_terms}}. Акцепт оферты осуществляется путём оплаты счёта.</p>
<h2>Заключительные положения</h2>
<p>Исполнитель вправе отказаться от оферты, уведомив об этом. Все споры разрешаются в соответствии с законодательством Российской Федерации.</p>`,
  },
  {
    slug: 'nda',
    title: 'Соглашение о неразглашении (NDA)',
    description: 'Двустороннее соглашение о конфиденциальности',
    schema_json: renderable([
      { key: 'party_a', label: 'Сторона А', type: 'string', required: true },
      { key: 'party_b', label: 'Сторона Б', type: 'string', required: true },
      { key: 'city', label: 'Город', type: 'string', required: false, default: 'Москва' },
      { key: 'date', label: 'Дата', type: 'date', required: true },
      { key: 'term_months', label: 'Срок действия, мес.', type: 'number', required: false, default: 24 },
    ]),
    body_html: `<h1>Соглашение о неразглашении конфиденциальной информации</h1>
<p class="muted">г. {{city}}, «{{date}}»</p>
<p>{{party_a}} и {{party_b}} (далее — «Стороны») заключили настоящее Соглашение:</p>
<h2>1. Предмет</h2>
<p>Стороны обязуются сохранять конфиденциальность информации, полученной друг от друга в ходе взаимодействия.</p>
<h2>2. Срок</h2>
<p>Обязательства действуют в течение <b>{{term_months}} месяцев</b> с момента подписания.</p>
<h2>3. Ответственность</h2>
<p>В случае разглашения виновная сторона обязана возместить причинённые убытки.</p>
<table class="sign">
<tr><td><b>Сторона А:</b><br>{{party_a}}</td>
<td><b>Сторона Б:</b><br>{{party_b}}</td></tr>
</table>`,
  },
  {
    slug: 'tz',
    title: 'Техническое задание',
    description: 'ТЗ на выполнение работ/оказание услуг',
    schema_json: renderable([
      { key: 'project_title', label: 'Название проекта', type: 'string', required: true },
      { key: 'client_name', label: 'Заказчик', type: 'string', required: true },
      { key: 'contractor_name', label: 'Исполнитель', type: 'string', required: true },
      { key: 'goal', label: 'Цель', type: 'text', required: true },
      { key: 'scope', label: 'Объём работ', type: 'text', required: true },
      { key: 'deliverables', label: 'Результаты', type: 'text', required: true },
      { key: 'stages', label: 'Этапы', type: 'text', required: true },
      { key: 'criteria', label: 'Критерии приёмки', type: 'text', required: true },
      { key: 'deadline', label: 'Срок', type: 'string', required: true },
    ]),
    body_html: `<h1>Техническое задание<br>{{project_title}}</h1>
<table class="kv">
<tr><th>Заказчик</th><td>{{client_name}}</td></tr>
<tr><th>Исполнитель</th><td>{{contractor_name}}</td></tr>
</table>
<h2>1. Цель</h2><p>{{goal}}</p>
<h2>2. Объём работ</h2><p>{{scope}}</p>
<h2>3. Этапы</h2><p>{{stages}}</p>
<h2>4. Результаты</h2><p>{{deliverables}}</p>
<h2>5. Критерии приёмки</h2><p>{{criteria}}</p>
<h2>6. Срок</h2><p>{{deadline}}</p>`,
  },
  {
    slug: 'appendix',
    title: 'Дополнительное приложение',
    description: 'Приложение к договору (уточнение объёма или стоимости)',
    schema_json: renderable([
      { key: 'contract_number', label: 'К договору №', type: 'string', required: true },
      { key: 'title', label: 'Заголовок приложения', type: 'string', required: true },
      { key: 'body', label: 'Содержание', type: 'text', required: true },
      { key: 'date', label: 'Дата', type: 'date', required: true },
    ]),
    body_html: `<h1>Приложение к договору {{contract_number}}</h1>
<p class="muted">«{{date}}»</p>
<h2>{{title}}</h2>
<div>{{body}}</div>`,
  },
];

/** Seed the templates table (idempotent — re-runs bump version only on change). */
export function seedTemplates(database) {
  const sel = database.prepare('SELECT id, version FROM document_templates WHERE slug = ?');
  const ins = database.prepare(
    `INSERT INTO document_templates (id, slug, title, description, body_html, schema_json, version, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
  );
  const upd = database.prepare(
    `UPDATE document_templates SET title = ?, description = ?, body_html = ?, schema_json = ?, version = version + 1, updated_at = unixepoch()
     WHERE slug = ?`
  );
  let inserted = 0;
  let updated = 0;
  for (const t of TEMPLATES) {
    const existing = sel.get(t.slug);
    if (!existing) {
      ins.run(nanoid(), t.slug, t.title, t.description ?? null, t.body_html, JSON.stringify(t.schema_json));
      inserted++;
    } else {
      const res = upd.run(t.title, t.description ?? null, t.body_html, JSON.stringify(t.schema_json), t.slug);
      if (res.changes) updated++;
    }
  }
  return { inserted, updated };
}
