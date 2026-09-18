import { api } from '../../api/client';

// Everything the Products feature does against /api/products.
export const productsApi = {
  // includeInactive always on — this is the management page, it needs to
  // see disabled products too so they can be found and re-enabled. Every
  // other picker in the app calls plain GET /products (no param), which
  // excludes disabled ones automatically.
  list: (q = '') => api.get(`/products?includeInactive=1${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  getByCode: (code) => api.get(`/products/${code}`),
  create: (payload) => api.post('/products', payload),
  update: (code, payload) => api.put(`/products/${code}`, payload),
  remove: (code) => api.del(`/products/${code}`),
  uploadPhoto: (code, formData) => api.putForm(`/products/${code}/photo`, formData), // legacy single-photo endpoint
  uploadImages: (code, formData) => api.postForm(`/products/${code}/images`, formData),
  removeImage: (code, publicId) => api.del(`/products/${code}/images`, { publicId }),
  setFeaturedImage: (code, publicId) => api.put(`/products/${code}/featured-image`, { publicId }),
  uploadVideo: (code, formData) => api.putForm(`/products/${code}/video`, formData),
  removeVideo: (code) => api.del(`/products/${code}/video`),
  getDispatchedTotals: () => api.get('/products/dispatched-totals'),
  getDispatchBreakdown: (code, params = '') => api.get(`/products/${code}/dispatch-breakdown${params ? `?${params}` : ''}`),
};
