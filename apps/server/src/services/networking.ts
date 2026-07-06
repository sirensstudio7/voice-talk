const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "SOCKS_PROXY",
  "SOCKS5_PROXY",
  "socks_proxy",
  "socks5_proxy",
];

export async function withDirectConnectionAsync<T>(fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string> = {};
  for (const key of PROXY_ENV_KEYS) {
    if (process.env[key]) {
      saved[key] = process.env[key]!;
      delete process.env[key];
    }
  }
  try {
    return await fn();
  } finally {
    Object.assign(process.env, saved);
  }
}

export function formatConnectionError(exc: unknown): string {
  const message = exc instanceof Error ? exc.message : String(exc);
  const errno = exc && typeof exc === "object" && "errno" in exc ? Number(exc.errno) : undefined;

  if (errno === -3008 || message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
    return (
      "Cannot reach the Gemini voice API (DNS lookup failed). " +
      "Restart the API with `npm run api:restart` and check your internet connection."
    );
  }
  if (
    message.includes("nodename nor servname provided") ||
    message.includes("Name or service not known")
  ) {
    return (
      "Cannot reach the Gemini voice API (DNS lookup failed). " +
      "Restart the API with `npm run api:restart` and check your internet connection."
    );
  }
  return message;
}
