// Public origin of the site (e.g. https://test.payplus.live), used for the Payplus returnUrl.
// Behind nginx, request.url holds the internal address Next listens on (https://localhost:7987),
// so use APP_URL when set, otherwise the public host nginx forwards.
export function publicOrigin(request: Request) {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");

  const first = (value: string | null) => value?.split(",")[0].trim() || null;
  const host = first(request.headers.get("x-forwarded-host")) ?? first(request.headers.get("host"));
  const proto = first(request.headers.get("x-forwarded-proto")) ?? new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
