export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function withCors<T>(body: T, init?: ResponseInit) {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    {
      ...init,
      headers: {
        "Content-Type":
          typeof body === "string" ? "text/plain" : "application/json",
        ...corsHeaders,
        ...(init?.headers || {}),
      },
    }
  );
}
