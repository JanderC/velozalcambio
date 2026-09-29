const BASE_URL = import.meta.env.VITE_API_URL;

export interface DetalleError {
  campo: string;
  mensaje: string;
}

export class ApiError extends Error {
  status: number;
  detalles: DetalleError[];
  constructor(status: number, message: string, detalles: DetalleError[] = []) {
    super(message);
    this.status = status;
    this.detalles = detalles;
  }
}

function leerDetalles(body: unknown): DetalleError[] {
  if (typeof body !== "object" || body === null || !("detalles" in body) || !Array.isArray(body.detalles)) return [];
  return body.detalles.filter(
    (d: unknown): d is DetalleError =>
      typeof d === "object" && d !== null && "campo" in d && "mensaje" in d && typeof d.campo === "string" && typeof d.mensaje === "string"
  );
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

/**
 * Wrapper delgado sobre fetch. Nunca parsea montos a number acá -- todo lo
 * que venga del backend como string (dinero) se pasa tal cual a quien lo
 * consuma; parsear a number en el cliente sería reintroducir el problema
 * de precisión que evitamos en todo el backend.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    let detalles: DetalleError[] = [];
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      detalles = leerDetalles(body);
    } catch {
      // el body no era JSON -- se deja el mensaje genérico
    }
    throw new ApiError(response.status, message, detalles);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, formData: FormData) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData }).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new ApiError(r.status, body?.error ?? `Error ${r.status}`, leerDetalles(body));
      }
      return r.json() as Promise<T>;
    });
  },
};