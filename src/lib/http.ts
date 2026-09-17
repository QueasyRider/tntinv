export function apiError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return Response.json({ ok: false, error: message }, { status });
}
