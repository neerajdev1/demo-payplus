import { payplus } from "@/lib/payplus";

// POST /payin/status — send exactly one of orderId or merchantOrderId.
export async function POST(request: Request) {
  const { orderId, merchantOrderId } = (await request.json()) as { orderId?: string; merchantOrderId?: string };
  return payplus("/payin/status", orderId ? { orderId } : { merchantOrderId });
}
