import "server-only";

/** An error whose message is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

/** Wraps a Route Handler body: turns ApiError into JSON, hides unexpected errors. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data ?? { ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Eroare internă. Încearcă din nou." }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  fail(400, "Cerere invalidă.");
}

export function cleanText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") fail(400, `${field} lipsește.`);
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) fail(400, `${field} trebuie să aibă ${min}-${max} caractere.`);
  return text;
}

/** Postgres unique_violation */
export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
