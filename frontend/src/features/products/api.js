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
  // masterAdmin-only — cascades the code change across Inventory, PI/Invoice
  // lines, carton QR records, and SKU aliases in one transaction. See the
  // backend controller for exactly what this does and doesn't cover (it
  // can't fix an already-printed physical label).
  renameCode: (code, newCode) => api.post(`/products/${code}/rename-code`, { newCode }),
  remove: (code) => api.del(`/products/${code}`),
  uploadPhoto: (code, formData) => api.putForm(`/products/${code}/photo`, formData), // legacy single-photo endpoint
  uploadImages: (code, formData) => api.postForm(`/products/${code}/images`, formData),
  removeImage: (code, publicId) => api.del(`/products/${code}/images`, { publicId }),
  setFeaturedImage: (code, publicId) => api.put(`/products/${code}/featured-image`, { publicId }),
  uploadVideo: (code, formData) => api.putForm(`/products/${code}/video`, formData),
  removeVideo: (code) => api.del(`/products/${code}/video`),
  getDispatchedTotals: () => api.get('/products/dispatched-totals'),
  getDispatchBreakdown: (code, params = '') => api.get(`/products/${code}/dispatch-breakdown${params ? `?${params}` : ''}`),
  // Legacy (pre-CRM) dispatch data import — preview parses & matches the
  // uploaded file against real product codes for review; confirm only ever
  // saves the specific rows approved on that review screen.
  previewLegacyDispatch: (formData) => api.postForm('/products/legacy-dispatch/preview', formData),
  confirmLegacyDispatch: (rows) => api.post('/products/legacy-dispatch/confirm', { rows }),
};
