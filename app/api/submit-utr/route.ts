import { payplus } from "@/lib/payplus";

// POST /payin/submit-utr — utr must be exactly 12 digits.
export async function POST(request: Request) {
  const { orderId, utr } = (await request.json()) as { orderId: string; utr: string };
  return payplus("/payin/submit-utr", { orderId, utr });
}
