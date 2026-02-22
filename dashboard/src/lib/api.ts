const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;
  private extraHeaders: Record<string, string> = {};

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  setHeader(key: string, value: string) {
    this.extraHeaders[key] = value;
  }

  removeHeader(key: string) {
    delete this.extraHeaders[key];
  }

  async request<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...this.extraHeaders };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      const isAuthRoute = path.startsWith('/auth/');
      if (isAuthRoute) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || data.message || (typeof data.error === 'string' ? data.error : 'Invalid email or password'));
      }

      if (!isRetry && path !== '/auth/refresh' && token && typeof window !== 'undefined') {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          const refreshData = await refreshRes.json().catch(() => ({}));
          if (refreshRes.ok && refreshData.token) {
            this.setToken(refreshData.token);
            return this.request<T>(method, path, body, true);
          }
        } catch {
          // fall through to clear and redirect
        }
      }
      this.clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
      throw new Error('Session expired — please sign in again');
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error?.message || data.message || (typeof data.error === 'string' ? data.error : 'Something went wrong'));
    }

    return data as T;
  }

  get<T>(path: string) { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown) { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown) { return this.request<T>('PUT', path, body); }
  delete<T>(path: string) { return this.request<T>('DELETE', path); }

  /**
   * POST with SSE streaming response. Returns the raw Response so the caller
   * can consume the ReadableStream. Handles auth header injection.
   */
  async stream(path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...this.extraHeaders };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (res.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined') window.location.href = '/auth/login';
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message || data.message || (typeof data.error === 'string' ? data.error : `Request failed (${res.status})`));
    }

    return res;
  }

  getBaseUrl() { return API_BASE; }
}

const api = new ApiClient();
export default api;
