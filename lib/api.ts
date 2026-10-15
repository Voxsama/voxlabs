// Client-side fetch helper: throws Error(message) on non-2xx JSON `{ error }` responses.
export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const type = res.headers.get("content-type") || "";
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.hash)}`;
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    if (type.includes("json")) {
      const j = await res.json().catch(() => null);
      if (j?.error) msg = j.error;
    }
    throw new Error(msg);
  }
  return (type.includes("json") ? res.json() : res.blob()) as Promise<T>;
}

/** Download a POST response as a file (used by export). */
export async function downloadPost(url: string, payload: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error || `${res.status} ${res.statusText}`);
  }
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) || /filename="([^"]+)"/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "export";
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
