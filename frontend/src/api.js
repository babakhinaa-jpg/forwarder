const BASE = '/api';

function getToken() {
  return localStorage.getItem('pf_token');
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login: (username, password) =>
    fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(handleResponse),

  changePassword: (currentPassword, newPassword) =>
    fetch(`${BASE}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(handleResponse),

  getRules: () =>
    fetch(`${BASE}/rules`, { headers: authHeaders() }).then(handleResponse),

  createRule: (rule) =>
    fetch(`${BASE}/rules`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(rule),
    }).then(handleResponse),

  updateRule: (id, rule) =>
    fetch(`${BASE}/rules/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(rule),
    }).then(handleResponse),

  deleteRule: (id) =>
    fetch(`${BASE}/rules/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then(handleResponse),

  toggleRule: (id) =>
    fetch(`${BASE}/rules/${id}/toggle`, {
      method: 'POST',
      headers: authHeaders(),
    }).then(handleResponse),
};
