/**
 * @file api/axios.js
 * @description Shared Axios instance for all backend API calls.
 *
 * `withCredentials: true` ensures the session cookie is forwarded on every
 * request to the backend.
 */

import axios from 'axios';

const api = axios.create({
  baseURL:         import.meta.env.VITE_API_BASE_URL ?? '',
  withCredentials: true,
});

export default api;
