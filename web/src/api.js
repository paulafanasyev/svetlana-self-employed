/**
 * Единый API-клиент для web и (логически) общий с Android по контракту.
 *
 * Token'ы хранятся в памяти + localStorage; при 401 делается один refresh,
 * при неудаче пользователь разлогинивается. Никаких фейковых ответов:
 * если backend недоступен, ошибка всплывает наверх и показывается честно.
 */

// import.meta.env is undefined outside vite (e.g. unit tests); fall back safely.
const DEFAULT_PAGES_API = 'https://mir-samozanyatykh-api-frankfurt.onrender.com/api/v1';
const isPagesHost = typeof window !== 'undefined' && /(^|\.)github\.io$/.test(window.location.hostname);
const configuredApi = import.meta.env?.VITE_API_URL || (isPagesHost ? (import.meta.env?.VITE_PAGES_API_URL || DEFAULT_PAGES_API) : '/api/v1');
export const API_BASE = configuredApi.replace(/\/$/, '');
const TOKEN_KEY = 'mir_access_token';
const REFRESH_KEY = 'mir_refresh_token';

let accessToken = localStorage.getItem(TOKEN_KEY) || null;
let refreshToken = localStorage.getItem(REFRESH_KEY) || null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem(TOKEN_KEY, access);
  else localStorage.removeItem(TOKEN_KEY);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken() {
  return accessToken;
}

let backendAvailable = true;
export function isBackendAvailable() {
  return backendAvailable;
}

async function doFetch(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    backendAvailable = false;
    throw new ApiError('network', `Сервер недоступен: ${err.message}`, 0);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? safeParse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !options.__retried && refreshToken) {
      const refreshed = await tryRefresh();
      if (refreshed) return doFetch(path, { ...options, __retried: true });
    }
    throw new ApiError(body?.error || 'http_error', body?.message || `HTTP ${res.status}`, res.status, body);
  }
  backendAvailable = true;
  return body;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function tryRefresh() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const body = await res.json();
    setTokens(body.access_token, body.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export class ApiError extends Error {
  constructor(error, message, status, details) {
    super(message);
    this.code = error;
    this.status = status;
    this.details = details;
  }
}

export const api = {
  get: (path) => doFetch(path),
  post: (path, body) => doFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (path, body) => doFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => doFetch(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  // DELETE may carry a body (e.g. password confirmation for account deletion).
  del: (path, body) =>
    doFetch(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

/** Auth */
export const auth = {
  register: ({ email, password, display_name, role }) =>
    api.post('/auth/register', { email, password, display_name, role, consent_ai_processing: true }),
  login: ({ email, password }) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  exportData: () => api.get('/auth/export'),
  deleteAccount: (password) => api.del('/auth/account', { password }),
};

/** Health probe — used by the shell to show an honest backend status badge. */
export async function probeHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json();
    backendAvailable = true;
    return { ok: true, body };
  } catch (err) {
    backendAvailable = false;
    return { ok: false, reason: err.message };
  }
}

/* ==========================================================================
   Domain API — one method per backend route (§42). Used by web and mirrored
   by the Android client against the same contract.
   ========================================================================== */

export const crm = {
  // clients (contacts live under /clients/:id/contacts)
  clients: (q) => api.get(`/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  client: (id) => api.get(`/clients/${id}`),
  createClient: (body) => api.post('/clients', body),
  updateClient: (id, body) => api.put(`/clients/${id}`, body),
  deleteClient: (id) => api.del(`/clients/${id}`),
  clientContacts: (id) => api.get(`/clients/${id}/contacts`),
  addClientContact: (id, body) => api.post(`/clients/${id}/contacts`, body),
  deleteClientContact: (id, cid) => api.del(`/clients/${id}/contacts/${cid}`),
  addClientTag: (id, tag) => api.post(`/clients/${id}/tags`, { tags: [tag] }),
  removeClientTag: (id, tag) => api.del(`/clients/${id}/tags/${encodeURIComponent(tag)}`),

  companies: (q) => api.get(`/companies${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createCompany: (body) => api.post('/companies', body),
  updateCompany: (id, body) => api.put(`/companies/${id}`, body),
  deleteCompany: (id) => api.del(`/companies/${id}`),

  leads: (q) => api.get(`/leads${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createLead: (body) => api.post('/leads', body),
  updateLead: (id, body) => api.put(`/leads/${id}`, body),
  deleteLead: (id) => api.del(`/leads/${id}`),

  deals: (q) => api.get(`/deals${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createDeal: (body) => api.post('/deals', body),
  updateDeal: (id, body) => api.put(`/deals/${id}`, body),
  deleteDeal: (id) => api.del(`/deals/${id}`),

  projects: (q) => api.get(`/projects${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createProject: (body) => api.post('/projects', body),
  updateProject: (id, body) => api.put(`/projects/${id}`, body),
  deleteProject: (id) => api.del(`/projects/${id}`),
};

export const tasks = {
  list: (q) => api.get(`/tasks${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id) => api.get(`/tasks/${id}`),
  create: (body) => api.post('/tasks', body),
  update: (id, body) => api.put(`/tasks/${id}`, body),
  delete: (id) => api.del(`/tasks/${id}`),
  subtasks: (id) => api.get(`/tasks/${id}/subtasks`),
  addSubtask: (id, body) => api.post(`/tasks/${id}/subtasks`, body),
  toggleSubtask: (id, subId, done) => api.patch(`/tasks/${id}/subtasks/${subId}`, { done }),
  deleteSubtask: (id, subId) => api.del(`/tasks/${id}/subtasks/${subId}`),
  overdue: () => api.get('/tasks/overdue/all'),
};

export const calendar = {
  range: (from, to) => api.get(`/calendar/range/${from}/${to}`),
  create: (body) => api.post('/calendar', body),
  update: (id, body) => api.put(`/calendar/${id}`, body),
  delete: (id) => api.del(`/calendar/${id}`),
  reminders: () => api.get('/calendar/reminders'),
  createReminder: (body) => api.post('/calendar/reminders', body),
  updateReminder: (id, body) => api.patch(`/calendar/reminders/${id}`, body),
  deleteReminder: (id) => api.del(`/calendar/reminders/${id}`),
};

export const documents = {
  templates: () => api.get('/documents/templates'),
  list: () => api.get('/documents'),
  get: (id) => api.get(`/documents/${id}`),
  create: (body) => api.post('/documents', body),
  questions: (id) => api.get(`/documents/${id}/questions`),
  setData: (id, data) => api.put(`/documents/${id}/data`, data),
  generate: (id) => api.post(`/documents/${id}/generate`),
  preview: (id) => api.get(`/documents/${id}/preview`),
  approve: (id) => api.post(`/documents/${id}/approve`),
  downloadUrl: (id) => `${API_BASE}/documents/${id}/download`,
  send: (id, body) => api.post(`/documents/${id}/send`, body),
  contracts: () => api.get('/documents/contracts'),
  linkContract: (id, body) => api.patch(`/documents/contracts/${id}`, body),
  setStatus: (id, body) => api.post(`/documents/${id}/status`, body),
  delete: (id) => api.del(`/documents/${id}`),
};

export const finance = {
  invoices: (q) => api.get(`/invoices${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createInvoice: (body) => api.post('/invoices', body),
  updateInvoice: (id, body) => api.put(`/invoices/${id}`, body),
  payInvoice: (id, body) => api.post(`/invoices/${id}/pay`, body),
  deleteInvoice: (id) => api.del(`/invoices/${id}`),
  revenue: (from, to) => api.get(`/invoices/analytics/revenue?from=${from}&to=${to}`),

  payments: (params = '') => api.get(`/payments${params}`),
  payment: (id) => api.get(`/payments/${id}`),
  charge: (body) => api.post('/payments/charge', body),
  providers: () => api.get('/payments/providers'),
  balance: () => api.get('/payments/balance/summary'),
};

export const ai = {
  chat: (body) => api.post('/ai/chat', body),
  conversations: () => api.get('/ai/conversations'),
  conversation: (id) => api.get(`/ai/conversations/${id}`),
  deleteConversation: (id) => api.del(`/ai/conversations/${id}`),
  actions: (params = '') => api.get(`/ai/actions${params}`),
};

export const marketplace = {
  projects: (params = '') => api.get(`/marketplace/projects${params}`),
  project: (id) => api.get(`/marketplace/projects/${id}`),
  createProject: (body) => api.post('/marketplace/projects', body),
  updateProject: (id, body) => api.patch(`/marketplace/projects/${id}`, body),
  apply: (id, body) => api.post(`/marketplace/projects/${id}/applications`, body),
  myApplications: () => api.get('/marketplace/applications/mine'),
  decideApplication: (id, appId, body) => api.patch(`/marketplace/projects/${id}/applications/${appId}`, body),
  matching: (id) => api.get(`/marketplace/projects/${id}/matching`),
  services: (params = '') => api.get(`/marketplace/services${params}`),
  myServices: () => api.get('/marketplace/services/mine'),
  createService: (body) => api.post('/marketplace/services', body),
  updateService: (id, body) => api.patch(`/marketplace/services/${id}`, body),
  deleteService: (id) => api.del(`/marketplace/services/${id}`),
  orders: () => api.get('/marketplace/orders'),
  updateOrder: (id, body) => api.patch(`/marketplace/orders/${id}`, body),
  reviews: (userId) => api.get(`/marketplace/reviews/${userId}`),
  createReview: (body) => api.post('/marketplace/reviews', body),
};

export const vacancies = {
  list: (params = '') => api.get(`/vacancies${params}`),
  mine: () => api.get('/vacancies/mine'),
  get: (id) => api.get(`/vacancies/${id}`),
  create: (body) => api.post('/vacancies', body),
  update: (id, body) => api.patch(`/vacancies/${id}`, body),
  delete: (id) => api.del(`/vacancies/${id}`),
  apply: (id, body) => api.post(`/vacancies/${id}/apply`, body),
  candidates: (id) => api.get(`/vacancies/${id}/candidates`),
  decideCandidate: (id, candId, body) => api.patch(`/vacancies/${id}/candidates/${candId}`, body),
};

export const education = {
  courses: (params = '') => api.get(`/courses${params}`),
  myCourses: () => api.get('/courses/mine'),
  course: (id) => api.get(`/courses/${id}`),
  createCourse: (body) => api.post('/courses', body),
  updateCourse: (id, body) => api.patch(`/courses/${id}`, body),
  deleteCourse: (id) => api.del(`/courses/${id}`),
  enroll: (id) => api.post(`/courses/${id}/enroll`),
  myEnrollments: () => api.get('/courses/enrollments/mine'),
  setProgress: (enrollmentId, progress) => api.patch(`/courses/enrollments/${enrollmentId}/progress`, { progress }),
  experts: () => api.get('/courses/experts'),
  becomeExpert: (body) => api.post('/courses/experts', body),
};

export const government = {
  grants: (params = '') => api.get(`/grants${params}`),
  grantsPersonalized: () => api.get('/grants/personalized'),
  grant: (id) => api.get(`/grants/${id}`),
  createGrant: (body) => api.post('/grants', body),
  updateGrant: (id, body) => api.patch(`/grants/${id}`, body),
  deleteGrant: (id) => api.del(`/grants/${id}`),
};

export const competitors = {
  list: (params = '') => api.get(`/competitors${params}`),
  get: (id) => api.get(`/competitors/${id}`),
  create: (body) => api.post('/competitors', body),
  update: (id, body) => api.put(`/competitors/${id}`, body),
  delete: (id) => api.del(`/competitors/${id}`),
};

export const rag = {
  search: (params = '') => api.get(`/rag/search${params}`),
  documents: (params = '') => api.get(`/rag/documents${params}`),
  ingest: (body) => api.post('/rag/ingest', body),
  deleteDocument: (id) => api.del(`/rag/documents/${id}`),
};

export const notifications = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  flushReminders: () => api.post('/notifications/reminders/flush'),
};

export const profileApi = {
  get: () => api.get('/profile'),
  update: (body) => api.put('/profile', body),
};

export const admin = {
  users: (params = '') => api.get(`/admin/users${params}`),
  updateUser: (id, body) => api.patch(`/admin/users/${id}`, body),
  moderationCourses: () => api.get('/admin/moderation/courses'),
  decideCourse: (id, body) => api.patch(`/admin/moderation/courses/${id}`, body),
  moderationServices: () => api.get('/admin/moderation/services'),
  decideService: (id, body) => api.patch(`/admin/moderation/services/${id}`, body),
  disputes: () => api.get('/admin/disputes'),
  decideDispute: (orderId, body) => api.patch(`/admin/disputes/${orderId}`, body),
  payments: (params = '') => api.get(`/admin/payments${params}`),
  commission: () => api.get('/admin/commission'),
  updateCommission: (body) => api.patch('/admin/commission', body),
  payouts: () => api.get('/admin/payouts'),
  system: () => api.get('/admin/system'),
  audit: (params = '') => api.get(`/admin/audit${params}`),
  ragStats: () => api.get('/admin/rag/stats'),
};


