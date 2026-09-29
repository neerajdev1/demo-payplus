import { isFromPayplus } from "@/lib/webhook";

// Payplus webhook receiver. Set <public https url>/api/webhook in the Payplus dashboard
// (Apps & API keys > Webhook) and put the signing secret it shows in .env as PAYPLUS_WEBHOOK_SECRET.

type WebhookPayload = {
  event: string;
  eventId: string;
  createdAt: string;
  data: { orderId: string; merchantOrderId: string; status: string; amount: string; utr: string | null };
};
type WebhookEvent = { receivedAt: string; event: string; eventId: string; deliveryId: string | null; payload: WebhookPayload };

// In-memory log for this test app only; resets when the server restarts. A real store would use a database.
const events: WebhookEvent[] = [];

export async function POST(request: Request) {
  const secret = process.env.PAYPLUS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[payplus webhook] PAYPLUS_WEBHOOK_SECRET is not set; rejecting delivery");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Verify against the raw body, before JSON parsing.
  const rawBody = await request.text();
  if (!isFromPayplus(rawBody, request.headers.get("x-payplus-signature"), secret)) {
    console.warn("[payplus webhook] rejected: invalid signature");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WebhookPayload;

  // Payplus retries until it gets a 2xx, so the same eventId can arrive more than once. Handle it only once.
  if (events.some((e) => e.eventId === payload.eventId)) {
    return Response.json({ received: true, duplicate: true });
  }

  events.unshift({
    receivedAt: new Date().toISOString(),
    event: payload.event,
    eventId: payload.eventId,
    deliveryId: request.headers.get("x-payplus-delivery"),
    payload,
  });

  const { merchantOrderId, amount } = payload.data;
  switch (payload.event) {
    case "payin.success":
      // Fulfil the order here (mark paid, email, ship), after checking amount matches your order.
      console.log(`[payplus webhook] ${merchantOrderId} PAID ₹${amount}: fulfil order`);
      break;
    case "payin.reverted":
      // Money was recalled after SUCCESS: undo fulfilment.
      console.log(`[payplus webhook] ${merchantOrderId} REVERTED ₹${amount}: reverse order`);
      break;
    default:
      // payin.dispute.opened, payin.dispute.released, payin.chargeback
      console.log(`[payplus webhook] ${merchantOrderId} ${payload.event}`);
  }

  // Answer within 10 seconds; do slow work after responding.
  return Response.json({ received: true });
}

// Lets the UI show the webhook URL, whether the secret is set, and received events.
export async function GET(request: Request) {
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  return Response.json({
    url: `${origin}/api/webhook`,
    configured: Boolean(process.env.PAYPLUS_WEBHOOK_SECRET),
    testMode: process.env.NODE_ENV !== "production", // /api/webhook/test is dev-only
    events,
  });
}
