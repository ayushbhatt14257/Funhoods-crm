import { api } from '../../api/client';

export const barcodeApi = {
  generateBatch: (code, cartonCount, qtyOverride) => api.post('/inventory/stock-in-batches', { code, cartonCount, qtyOverride }),
  getBatch: (batchId) => api.get(`/inventory/stock-in-batches/${batchId}`),
  getByProduct: (code) => api.get(`/inventory/carton/by-product/${code}`),
  getRecentBatches: (limit = 10) => api.get(`/inventory/carton/recent-batches?limit=${limit}`),
  deleteBatch: (batchId, opts = {}) => api.del(`/inventory/stock-in-batches/${batchId}${opts.force ? '?force=1' : ''}`),
  clearAll: () => api.del('/inventory/carton/all'),
  lookup: (code) => api.get(`/inventory/carton/${encodeURIComponent(code)}`),
  search: (q, opts = {}) => {
    const params = new URLSearchParams({ q });
    if (opts.product) params.set('product', opts.product);
    return api.get(`/inventory/carton/search?${params}`);
  },
  confirm: (code) => api.post(`/inventory/carton/${encodeURIComponent(code)}/confirm`),
  // Outward/dispatch scanning
  forDispatch: (code, dealerCode, opts = {}) => {
    const params = new URLSearchParams({ dealer: dealerCode });
    if (opts.product) params.set('product', opts.product);
    if (opts.gift) params.set('gift', '1');
    return api.get(`/inventory/carton/${encodeURIComponent(code)}/for-dispatch?${params}`);
  },
  availableCounts: (codes) => api.get(`/inventory/carton/available-counts?codes=${codes.map(encodeURIComponent).join(',')}`),
  split: (code) => api.post(`/inventory/carton/${encodeURIComponent(code)}/split`),
  manualDispatch: (code, dealerCode) => api.post(`/inventory/carton/${encodeURIComponent(code)}/manual-dispatch`, { dealerCode }),
};
