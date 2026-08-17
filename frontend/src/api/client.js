const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('funhoods_token');
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJSON = contentType.includes('application/json');

  if (!res.ok) {
    const errBody = isJSON ? await res.json().catch(() => ({})) : {};
    throw new Error(errBody.message || `Request failed (${res.status})`);
  }
  if (!isJSON) return res; // caller handles blob/file responses
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
  putForm: (path, formData) => request(path, { method: 'PUT', body: formData, isForm: true }),
  fileUrl: (path) => `${API_URL}${path}`,
};

export { getToken, API_URL };
