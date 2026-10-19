declare const API_BASE_URL: string | undefined;

export const environment = {
  apiBaseUrl: typeof API_BASE_URL === 'undefined' ? '/api' : API_BASE_URL
};
