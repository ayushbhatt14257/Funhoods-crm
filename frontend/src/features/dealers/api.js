import { api } from '../../api/client';

// Everything the Dealers (customer master) feature does against /api/dealers.
export const dealersApi = {
  list: (q = '') => api.get(`/dealers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getByCode: (code) => api.get(`/dealers/${code}`),
  create: (payload) => api.post('/dealers', payload),
  update: (code, payload) => api.put(`/dealers/${code}`, payload),
  remove: (code) => api.del(`/dealers/${code}`),
  uploadDoc: (code, field, formData) => api.putForm(`/dealers/${code}/${field}`, formData),
};
