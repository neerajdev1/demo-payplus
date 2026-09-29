import type { NextRequest } from "next/server";
import { sign } from "@/lib/webhook";

// Dev-only: posts a sample webhook to /api/webhook so the handler can be tested without a tunnel.
// Uses made-up order IDs so it never touches a real payment.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: { code: "NOT_FOUND", message: "Test webhooks are disabled in production" } }, { status: 404 });
  }
  const secret = process.env.PAYPLUS_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: { code: "CONFIG_ERROR", message: "Set PAYPLUS_WEBHOOK_SECRET in .env first" } }, { status: 500 });
  }

  const { event = "payin.success", badSignature = false } = (await request.json()) as { event?: string; badSignature?: boolean };
  const id = Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const body = JSON.stringify({
    event,
    eventId: `ORD_TEST${id}.${event}.1`,
    createdAt: now,
    data: {
      orderId: `ORD_TEST${id}`,
      merchantOrderId: `test-order-${id}`,
      status: event === "payin.reverted" ? "REVERTED" : "SUCCESS",
      environment: "TEST",
      amount: "10.00",
      payableAmount: "10.00",
      fee: "0.20",
      netAmount: "9.80",
      currency: "INR",
      utr: "123456789012",
      customerReference: "test-customer",
      completedAt: now,
    },
  });

  const res = await fetch(new URL("/api/webhook", request.nextUrl.origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payplus-signature": badSignature ? "0".repeat(64) : sign(body, secret),
      "x-payplus-event": event,
      "x-payplus-delivery": crypto.randomUUID(),
      "x-payplus-timestamp": String(Math.floor(Date.now() / 1000)),
    },
    body,
  });
  const json = await res.json();
  // Surface the handler's answer as-is (401 for a bad signature is the expected result).
  return Response.json({ webhookStatus: res.status, webhookResponse: json }, { status: res.status });
}
