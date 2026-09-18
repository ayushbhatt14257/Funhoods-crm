import { api } from '../../api/client';

export const barcodeApi = {
  generateBatch: (code, cartonCount, qtyOverride) => api.post('/inventory/stock-in-batches', { code, cartonCount, qtyOverride }),
  getBatch: (batchId) => api.get(`/inventory/stock-in-batches/${batchId}`),
  getByProduct: (code) => api.get(`/inventory/carton/by-product/${code}`),
  getRecentBatches: (limit = 10) => api.get(`/inventory/carton/recent-batches?limit=${limit}`),
  clearAll: () => api.del('/inventory/carton/all'),
  lookup: (code) => api.get(`/inventory/carton/${encodeURIComponent(code)}`),
  confirm: (code) => api.post(`/inventory/carton/${encodeURIComponent(code)}/confirm`),
};
