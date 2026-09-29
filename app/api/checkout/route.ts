import type { NextRequest } from "next/server";
import { findBook } from "@/lib/books";
import { publicOrigin } from "@/lib/origin";
import { payplus } from "@/lib/payplus";

type CartLine = { id: string; qty: number };

// POST /payin/create — the server prices the cart; never trust a price sent by the browser.
export async function POST(request: NextRequest) {
  const { items, username } = (await request.json()) as { items: CartLine[]; username?: string };

  let total = 0;
  for (const line of items ?? []) {
    const book = findBook(line.id);
    const qty = Math.floor(Number(line.qty));
    if (!book || !(qty > 0)) {
      return Response.json({ error: { code: "BAD_CART", message: `Invalid cart line: ${line.id}` } }, { status: 400 });
    }
    total += book.price * qty;
  }
  if (total === 0) {
    return Response.json({ error: { code: "EMPTY_CART", message: "Cart is empty" } }, { status: 400 });
  }

  const merchantOrderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const origin = publicOrigin(request);

  return payplus("/payin/create", {
    amount: total.toFixed(2),
    merchantOrderId,
    customerReference: "test-customer",
    returnUrl: `${origin}/?order=${merchantOrderId}`,
    ...(username ? { username } : {}),
    customerMeta: {
      items: items.map((l) => `${l.id}x${l.qty}`).join(","),
      itemCount: items.reduce((n, l) => n + l.qty, 0),
    },
  });
}
