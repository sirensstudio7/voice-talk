export type HttpClientConfig = {
  baseUrl: string;
  getToken?: () => string | null;
  timeout?: number;
};

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export type HttpClient = {
  get: <T>(path: string, options?: RequestInit) => Promise<T>;
  post: <T>(path: string, body?: any, options?: RequestInit) => Promise<T>;
  put: <T>(path: string, body?: any, options?: RequestInit) => Promise<T>;
  patch: <T>(path: string, body?: any, options?: RequestInit) => Promise<T>;
  delete: <T>(path: string, options?: RequestInit) => Promise<T>;
  upload: <T>(path: string, file: File, options?: RequestInit) => Promise<T>;
};

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl, getToken, timeout: defaultTimeout = 15000 } = config;

  async function request<T>(path: string, options: RequestInit = {}, retries = 2): Promise<T> {
    const token = getToken?.();
    const headers = new Headers(options.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    
    // Auto JSON parse and content-type, unless it's FormData
    if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), defaultTimeout);
    
    let signal = controller.signal;
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        signal,
      });

      if (!response.ok) {
        if (response.status >= 500 && retries > 0) {
          return request(path, options, retries - 1);
        }
        
        const text = await response.text();
        let errorMessage = response.statusText;
        try {
          const json = JSON.parse(text);
          errorMessage = json.detail || text;
        } catch {
          errorMessage = text || errorMessage;
        }
        throw new ApiRequestError(errorMessage, response.status);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    get: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: "GET" }),
    post: <T>(path: string, body?: any, options?: RequestInit) => request<T>(path, { ...options, method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) }),
    put: <T>(path: string, body?: any, options?: RequestInit) => request<T>(path, { ...options, method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body) }),
    patch: <T>(path: string, body?: any, options?: RequestInit) => request<T>(path, { ...options, method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body) }),
    delete: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: "DELETE" }),
    upload: <T>(path: string, file: File, options?: RequestInit) => {
      const formData = new FormData();
      formData.append("file", file);
      return request<T>(path, { ...options, method: "POST", body: formData });
    },
  };
}
