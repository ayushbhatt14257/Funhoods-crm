import { api } from '../../api/client';

// Everything the Categories feature does against /api/categories.
export const categoriesApi = {
  list: () => api.get('/categories'),
  create: (name) => api.post('/categories', { name }),
  remove: (id) => api.del(`/categories/${id}`),
};
