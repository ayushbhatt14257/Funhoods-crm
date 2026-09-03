import { api } from '../../api/client';

// Everything the Products feature does against /api/products.
export const productsApi = {
  list: (q = '') => api.get(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
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
};
