// Server-only Payplus client. The API key never reaches the browser.
// Docs: https://new.payplus.live/docs/api-reference

const BASE_URL = process.env.NEXT_APP_BASE_URL ?? "https://api.payplus.live/api/v2";

export async function payplus(path: string, body: unknown) {
  const apiKey = process.env.API_SECRET_KEY;
  if (!apiKey) {
    return Response.json(
      { error: { code: "CONFIG_ERROR", message: "API_SECRET_KEY is not set in .env" } },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: { code: "NON_JSON_RESPONSE", message: text.slice(0, 500) } };
    }
    return Response.json(json, { status: res.status });
  } catch (err) {
    return Response.json(
      { error: { code: "NETWORK_ERROR", message: (err as Error).message } },
      { status: 502 },
    );
  }
}
