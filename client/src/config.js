// Get API base URL from environment or use default
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  SOCKET_URL: API_BASE_URL
};

export default API_CONFIG;
