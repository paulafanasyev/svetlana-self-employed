/**
 * Public discovery endpoints.
 *
 * No account is required to discover local work, training and support.
 * Personal actions remain protected in their existing domain routes.
 */
import { paginationSchema } from '../lib/http.js';
import { db } from '../db/client.js';

const TRUD_API = 'http://opendata.trudvsem.ru/api/v1/vacancies';

function asText(value) {
  return value == null ? '' : String(value);
}

function firstNonEmpty(...values) {
  return values.find((value) => asText(value).trim()) ?? null;
}

function unwrapVacancy(value) {
  if (!value || typeof value !== 'object') return {};
  return value.vacancy ?? value.item ?? value;
}

function extractVacancies(payload) {
  const results = payload?.results;
  const candidates = [
    results?.vacancies,
    results?.vacancy,
    results?.data,
    Array.isArray(results) ? results : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const rows = Array.isArray(candidate) ? candidate : candidate?.vacancy;
    if (Array.isArray(rows)) return rows.map(unwrapVacancy);
  }
  return [];
}

function mapTrudVacancy(raw, index) {
  const v = unwrapVacancy(raw);
  const location = v.location ?? v.address ?? v.region ?? {};
  const company = v.company ?? v.employer ?? {};
  const salary = v.compensation ?? v.salary ?? {};
  return {
    id: firstNonEmpty(v.id, v.vacancyId, String(index)),
    title: firstNonEmpty(v.jobName, v.title, v.profession, v.name) ?? 'Вакансия',
    description: firstNonEmpty(v.jobDescription, v.description, v.requirements, v.duty) ?? '',
    company: firstNonEmpty(company.companyName, company.name, v.companyName, v.employerName),
    city: firstNonEmpty(location.city, location.addressCity, v.city),
    region: firstNonEmpty(location.regionName, location.region, v.regionName, v.region),
    salary_from: Number(salary.from ?? salary.min ?? v.salaryFrom ?? 0) || null,
    salary_to: Number(salary.to ?? salary.max ?? v.salaryTo ?? 0) || null,
    url: firstNonEmpty(v.vacancyUrl, v.url, v.sourceUrl) ?? 'https://trudvsem.ru/vacancy/search',
  };
}

async function fetchTrudVacancies({ city, q, limit = 12 }) {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(limit * 2, 12), 100)));
  params.set('offset', '1');
  if (q) params.set('text', city ? city + ' ' + q : q);
  else if (city) params.set('text', city);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(TRUD_API + '?' + params.toString(), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { data: [], unavailable: true, reason: 'HTTP ' + response.status };
    }
    const payload = await response.json();
    const data = extractVacancies(payload)
      .map(mapTrudVacancy)
      .filter((row) => row.title);
    return {
      data: data.slice(0, limit),
      unavailable: false,
      total: Number(payload?.meta?.total ?? 0) || null,
    };
  } catch (error) {
    return {
      data: [],
      unavailable: true,
      reason: error?.name === 'AbortError' ? 'timeout' : error?.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function publicRoutes(fastify) {
  fastify.get('/geo', async (request) => {
    const city = String(request.query?.city ?? '').trim().slice(0, 120);
    const region = String(request.query?.region ?? '').trim().slice(0, 120);
    const q = String(request.query?.q ?? '').trim().slice(0, 160);
    const { limit } = paginationSchema.parse({
      limit: request.query?.limit ?? 12,
      offset: 0,
    });

    let vacancySql = "SELECT v.* FROM vacancies v WHERE v.status = 'active'";
    const vacancyParams = [];
    if (city) {
      vacancySql += ' AND (v.city LIKE ? OR v.remote = 1)';
      vacancyParams.push('%' + city + '%');
    }
    if (q) {
      vacancySql += ' AND (v.title LIKE ? OR v.description LIKE ?)';
      vacancyParams.push('%' + q + '%', '%' + q + '%');
    }
    vacancySql += ' ORDER BY v.created_at DESC LIMIT ?';
    const localVacancies = db().prepare(vacancySql).all(...vacancyParams, limit);

    const courseSql =
      "SELECT c.id, c.title, c.description, c.price, c.currency, c.format, " +
      "c.duration_hours, c.author_kind, c.created_at, p.city, p.display_name AS author_name " +
      "FROM courses c LEFT JOIN profiles p ON p.user_id = c.author_id " +
      "WHERE c.is_published = 1 " +
      "AND (? = '' OR p.city LIKE ?) " +
      "AND (? = '' OR c.title LIKE ? OR c.description LIKE ?) " +
      "ORDER BY c.created_at DESC LIMIT ?";
    const courses = db().prepare(courseSql).all(
      city, '%' + city + '%', q, '%' + q + '%', '%' + q + '%', limit,
    );

    let grantSql =
      "SELECT id, kind, title, description, funder, region, amount_min, amount_max, " +
      "currency, url, source_name, retrieved_at, updated_at " +
      "FROM government_programs WHERE is_active = 1";
    const grantParams = [];
    if (region) {
      grantSql += ' AND (region = ? OR funder = ? OR region IS NULL)';
      grantParams.push(region, 'Федеральный');
    }
    if (q) {
      grantSql += ' AND (title LIKE ? OR description LIKE ?)';
      grantParams.push('%' + q + '%', '%' + q + '%');
    }
    grantSql += ' ORDER BY updated_at DESC LIMIT ?';
    const grants = db().prepare(grantSql).all(...grantParams, limit);

    const external = await fetchTrudVacancies({ city, q, limit });
    return {
      city,
      region,
      local_vacancies: localVacancies,
      trud_russia: {
        source: 'Работа России',
        source_url: 'https://trudvsem.ru/',
        official_open_data: TRUD_API,
        data: external.data,
        unavailable: external.unavailable,
        reason: external.reason ?? null,
        total: external.total ?? null,
      },
      courses,
      grants,
      meta: {
        generated_at: new Date().toISOString(),
        note: 'Публикация вакансии в «Работа России» — отдельный партнёрский/API-процесс; этот endpoint использует официальные открытые данные для поиска.',
      },
    };
  });

  fastify.get('/ping', async () => ({ ok: true }));
}
