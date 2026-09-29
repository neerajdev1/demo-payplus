"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { books, findBook } from "@/lib/books";

type Payment = {
  orderId: string;
  merchantOrderId: string;
  status: string;
  statusReason: string | null;
  environment: string;
  amount: string;
  payableAmount: string;
  fee: string;
  netAmount: string;
  paymentUrl: string | null;
  utr: string | null;
  expiresAt: string | null;
  completedAt: string | null;
};

type ApiResult = { data?: Payment; error?: { code?: string; message?: string; details?: unknown } };
type LogEntry = { id: number; at: string; endpoint: string; request: unknown; status: number; response: unknown };
type WebhookEvent = { receivedAt: string; event: string; eventId: string; payload: { data?: Partial<Payment> } };
type WebhookInfo = { url: string; configured: boolean; events: WebhookEvent[] };

const inr = (v: number | string) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OPEN_STATUSES = ["PROVISIONING", "CREATED", "READY"];
const PAYMENT_EVENTS = ["payin.success", "payin.reverted"];

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  PENDING_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CANCELED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ARCHIVED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  REVERTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const btn =
  "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btn} bg-indigo-600 text-white hover:bg-indigo-500`;
const btnSecondary = `${btn} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;
const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700";

export default function Store({ returnedOrder }: { returnedOrder?: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [username, setUsername] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const [lookup, setLookup] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookInfo | null>(null);

  const lines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const count = lines.reduce((n, [, qty]) => n + qty, 0);
  const total = lines.reduce((sum, [id, qty]) => sum + (findBook(id)?.price ?? 0) * qty, 0);
  const setQty = (id: string, qty: number) => setCart((c) => ({ ...c, [id]: Math.max(0, qty) }));

  // Calls our own API route, which forwards to Payplus with the server-side API key.
  async function api(endpoint: string, path: string, body: unknown): Promise<ApiResult> {
    setBusy(endpoint);
    setError(null);
    let status = 0;
    let json: ApiResult;
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      status = res.status;
      json = await res.json();
    } catch (e) {
      json = { error: { code: "CLIENT_ERROR", message: (e as Error).message } };
    }
    setLog((l) => [{ id: Date.now(), at: new Date().toLocaleTimeString(), endpoint, request: body, status, response: json }, ...l].slice(0, 25));
    if (json.data?.orderId) setPayment(json.data);
    if (json.error) setError(`${json.error.code ?? "ERROR"}: ${json.error.message ?? "Request failed"}`);
    setBusy(null);
    return json;
  }

  async function checkout() {
    const json = await api("payin/create", "/api/checkout", {
      items: lines.map(([id, qty]) => ({ id, qty })),
      username: username.trim() || undefined,
    });
    if (json.data) setCart({});
  }

  const checkStatus = (ref: string) =>
    api("payin/status", "/api/status", ref.startsWith("ORD_") ? { orderId: ref } : { merchantOrderId: ref });

  async function submitUtr() {
    if (!payment) return;
    const json = await api("payin/submit-utr", "/api/submit-utr", { orderId: payment.orderId, utr });
    if (json.data) setUtr("");
  }

  function applyWebhooks(info: WebhookInfo) {
    setWebhooks(info);
    // A verified webhook for the open payment carries its latest status.
    setPayment((p) => {
      const data =
        p &&
        info.events.find((e) => PAYMENT_EVENTS.includes(e.event) && e.payload.data?.merchantOrderId === p.merchantOrderId)
          ?.payload.data;
      return p && data ? { ...p, ...data } : p;
    });
  }

  const loadWebhooks = () =>
    fetch("/api/webhook")
      .then((res) => res.json())
      .then(applyWebhooks)
      .catch(() => {}); // Dev server restarting; the next poll will retry.

  async function sendTestWebhook(event: string, badSignature = false) {
    await api("api/webhook/test", "/api/webhook/test", { event, badSignature });
    await loadWebhooks();
  }

  const paymentWebhook = payment && webhooks?.events.find((e) => e.payload.data?.merchantOrderId === payment.merchantOrderId);
  const awaitingWebhook = !!payment && [...OPEN_STATUSES, "PENDING_REVIEW"].includes(payment.status);

  // Load webhook info once, then poll while a payment is waiting for its webhook.
  useEffect(() => {
    loadWebhooks();
    if (!awaitingWebhook) return;
    const timer = setInterval(loadWebhooks, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingWebhook]);

  // Customer came back from the Payplus page via returnUrl (?order=<merchantOrderId>).
  const checkedReturn = useRef(false);
  useEffect(() => {
    if (!returnedOrder || checkedReturn.current) return;
    checkedReturn.current = true;
    checkStatus(returnedOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedOrder]);

  return (
    <div className="flex-1 bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">Bookshelf</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              Payplus test store
            </span>
          </div>
          <a href="#cart" className={btnSecondary}>
            Cart · {count}
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <section>
          <h1 className="mb-4 text-xl font-semibold">Books</h1>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {books.map((b) => (
              <article
                key={b.id}
                className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className={`flex aspect-[3/4] flex-col justify-between bg-linear-to-br p-4 text-white ${b.color}`}>
                  <span className="text-[10px] font-medium uppercase tracking-widest opacity-80">{b.genre}</span>
                  <div>
                    <p className="font-serif text-lg font-semibold leading-tight">{b.title}</p>
                    <p className="mt-1 text-xs opacity-80">{b.author}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="font-semibold">{inr(b.price)}</span>
                  {cart[b.id] ? (
                    <QtyStepper qty={cart[b.id]} onChange={(q) => setQty(b.id, q)} />
                  ) : (
                    <button className={btnPrimary} onClick={() => setQty(b.id, 1)}>
                      Add
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          {error && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <Panel title={`Cart (${count})`} id="cart">
            {lines.length === 0 ? (
              <p className="text-sm text-zinc-500">Your cart is empty.</p>
            ) : (
              <div className="space-y-4">
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {lines.map(([id, qty]) => {
                    const book = findBook(id)!;
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{book.title}</p>
                          <p className="text-xs text-zinc-500">{inr(book.price * qty)}</p>
                        </div>
                        <QtyStepper qty={qty} onChange={(q) => setQty(id, q)} />
                      </li>
                    );
                  })}
                </ul>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>{inr(total)}</span>
                </div>
                <input
                  className={input}
                  placeholder="Your name (optional)"
                  maxLength={100}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <button className={`${btnPrimary} w-full`} disabled={!!busy} onClick={checkout}>
                  {busy === "payin/create" ? "Creating payment…" : "Checkout with Payplus"}
                </button>
              </div>
            )}
          </Panel>

          {payment && (
            <Panel
              title="Payment"
              action={
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[payment.status] ?? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"}`}>
                  {payment.status}
                </span>
              }
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <Row label="Order ID" value={payment.orderId} mono />
                <Row label="Merchant order" value={payment.merchantOrderId} mono />
                <Row label="Environment" value={payment.environment} />
                <Row label="Amount" value={inr(payment.amount)} />
                <Row label="Pay exactly" value={inr(payment.payableAmount)} strong />
                <Row label="Fee" value={inr(payment.fee)} />
                <Row label="Net to you" value={inr(payment.netAmount)} />
                <Row label="UTR" value={payment.utr ?? "—"} mono />
                <Row
                  label="Webhook"
                  value={
                    paymentWebhook
                      ? `${paymentWebhook.event} · ${new Date(paymentWebhook.receivedAt).toLocaleTimeString()}`
                      : awaitingWebhook
                        ? "waiting…"
                        : "—"
                  }
                />
                {payment.statusReason && <Row label="Reason" value={payment.statusReason} />}
                {payment.expiresAt && <Row label="Expires" value={new Date(payment.expiresAt).toLocaleString()} />}
                {payment.completedAt && <Row label="Completed" value={new Date(payment.completedAt).toLocaleString()} />}
              </dl>

              {payment.status === "SUCCESS" && (
                <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Payment received. Safe to deliver the order.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {payment.paymentUrl && OPEN_STATUSES.includes(payment.status) && (
                  <>
                    <a className={btnPrimary} href={payment.paymentUrl}>
                      Pay now
                    </a>
                    <a className={btnSecondary} href={payment.paymentUrl} target="_blank" rel="noreferrer">
                      Open in new tab
                    </a>
                  </>
                )}
                <button className={btnSecondary} disabled={!!busy} onClick={() => checkStatus(payment.orderId)}>
                  {busy === "payin/status" ? "Checking…" : "Check status"}
                </button>
              </div>

              {OPEN_STATUSES.includes(payment.status) && (
                <form
                  className="mt-4 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitUtr();
                  }}
                >
                  <label className="text-xs text-zinc-500" htmlFor="utr">
                    Paid but not confirmed? Submit the 12-digit UTR from your receipt.
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="utr"
                      className={`${input} font-mono`}
                      inputMode="numeric"
                      placeholder="123456789012"
                      maxLength={12}
                      value={utr}
                      onChange={(e) => setUtr(e.target.value.replace(/\D/g, ""))}
                    />
                    <button className={btnSecondary} disabled={!!busy || utr.length !== 12}>
                      Submit
                    </button>
                  </div>
                </form>
              )}
            </Panel>
          )}

          <Panel title="Look up a payment">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (lookup.trim()) checkStatus(lookup.trim());
              }}
            >
              <input
                className={`${input} font-mono`}
                placeholder="ORD_… or order-…"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
              />
              <button className={btnSecondary} disabled={!!busy || !lookup.trim()}>
                Check
              </button>
            </form>
          </Panel>
        </aside>
      </main>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 lg:grid-cols-2">
        <Panel title="API console" action={log.length > 0 && <button className="text-xs text-zinc-500 hover:underline" onClick={() => setLog([])}>Clear</button>}>
          {log.length === 0 ? (
            <p className="text-sm text-zinc-500">Requests to Payplus will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {log.map((entry) => (
                <li key={entry.id}>
                  <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                      <span className={`font-mono text-xs font-semibold ${entry.status >= 200 && entry.status < 300 ? "text-emerald-600" : "text-red-600"}`}>
                        {entry.status || "ERR"}
                      </span>
                      <span className="font-mono">POST /{entry.endpoint}</span>
                      <span className="ml-auto text-xs text-zinc-500">{entry.at}</span>
                    </summary>
                    <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
                      <Json label="Request" value={entry.request} />
                      <Json label="Response" value={entry.response} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Webhooks" action={<button className={btnSecondary} onClick={loadWebhooks}>Refresh</button>}>
          {webhooks && (
            <div className="mb-4 space-y-2 text-xs">
              <div>
                <p className="mb-1 text-zinc-500">Webhook URL for the Payplus dashboard (Apps &amp; API keys → Webhook)</p>
                <code className="block break-all rounded-md bg-zinc-100 px-2 py-1.5 font-mono dark:bg-zinc-950">{webhooks.url}</code>
              </div>
              {/localhost|127\.0\.0\.1/.test(webhooks.url) && (
                <p className="text-amber-700 dark:text-amber-400">
                  Payplus can’t reach localhost. Expose port 3000 with a tunnel, e.g.{" "}
                  <code className="font-mono">npx cloudflared tunnel --url http://localhost:3000</code>, then set{" "}
                  <code className="font-mono">APP_URL=https://&lt;tunnel&gt;</code> in .env.
                </p>
              )}
              <p>
                Signing secret:{" "}
                {webhooks.configured ? (
                  <span className="font-medium text-emerald-600">configured</span>
                ) : (
                  <span className="font-medium text-red-600">
                    missing. Add <code className="font-mono">PAYPLUS_WEBHOOK_SECRET=whsec_…</code> to .env
                  </span>
                )}
              </p>
            </div>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            <button className={btnSecondary} disabled={!!busy || !webhooks?.configured} onClick={() => sendTestWebhook("payin.success")}>
              Test payin.success
            </button>
            <button className={btnSecondary} disabled={!!busy || !webhooks?.configured} onClick={() => sendTestWebhook("payin.reverted")}>
              Test payin.reverted
            </button>
            <button className={btnSecondary} disabled={!!busy || !webhooks?.configured} onClick={() => sendTestWebhook("payin.success", true)}>
              Test bad signature
            </button>
          </div>
          {!webhooks || webhooks.events.length === 0 ? (
            <p className="text-sm text-zinc-500">No webhooks received yet.</p>
          ) : (
            <ul className="space-y-2">
              {webhooks.events.map((w) => (
                <li key={w.eventId}>
                  <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                      <span className="font-mono font-semibold">{w.event}</span>
                      <span className="truncate font-mono text-xs text-zinc-500">{w.payload.data?.merchantOrderId}</span>
                      <span className="ml-auto text-xs text-zinc-500">{new Date(w.receivedAt).toLocaleTimeString()}</span>
                    </summary>
                    <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                      <Json label="Payload" value={w.payload} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, action, id, children }: { title: string; action?: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function QtyStepper({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const step = "h-7 w-7 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
  return (
    <div className="flex items-center gap-2">
      <button className={step} aria-label="Decrease quantity" onClick={() => onChange(qty - 1)}>
        −
      </button>
      <span className="w-4 text-center text-sm tabular-nums">{qty}</span>
      <button className={step} aria-label="Increase quantity" onClick={() => onChange(qty + 1)}>
        +
      </button>
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`break-all text-right ${mono ? "font-mono text-xs leading-5" : ""} ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
      <pre className="max-h-72 overflow-auto rounded-md bg-zinc-100 p-2 font-mono text-xs dark:bg-zinc-950">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
