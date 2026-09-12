import { api } from '../../api/client';

export const barcodeApi = {
  generateBatch: (code, cartonCount, qtyOverride) => api.post('/inventory/stock-in-batches', { code, cartonCount, qtyOverride }),
  getBatch: (batchId) => api.get(`/inventory/stock-in-batches/${batchId}`),
  lookup: (code) => api.get(`/inventory/carton/${encodeURIComponent(code)}`),
  confirm: (code) => api.post(`/inventory/carton/${encodeURIComponent(code)}/confirm`),
};
