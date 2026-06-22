import api from './axios.js';

export const getAnalytics   = ()     => api.get('/api/analytics').then((r) => r.data);
export const getYearSummary = (year) => api.get(`/api/analytics/summary?year=${year}`).then((r) => r.data);
