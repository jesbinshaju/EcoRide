// Get API base URL from environment or use default
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://ecoride-t9uw.onrender.com';

export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  SOCKET_URL: API_BASE_URL
};

export default API_CONFIG;
