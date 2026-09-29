import { createHmac, timingSafeEqual } from "node:crypto";

// Payplus signs the raw request body with HMAC-SHA256 using the app's webhook signing secret (whsec_…).
// Docs: https://new.payplus.live/docs/verify-a-payment

export function sign(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function isFromPayplus(rawBody: string, signatureHeader: string | null, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader ?? "", "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
