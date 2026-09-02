const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

export function ExperienceBackground({ backgroundUrl }: { backgroundUrl?: string }) {
  const resolvedUrl = resolveMediaUrl(backgroundUrl ?? "");

  if (!resolvedUrl) {
    return <div className="absolute inset-0 z-0 bg-slate-100" aria-hidden />;
  }

  return (
    <div
      className="absolute inset-0 z-0 bg-slate-100 bg-cover bg-center bg-no-repeat"
      aria-hidden
      style={{ backgroundImage: `url(${resolvedUrl})` }}
    />
  );
}
