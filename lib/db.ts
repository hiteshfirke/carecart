import { neon } from "@neondatabase/serverless";
import type { ProductOption } from "@/lib/channel3";
import type { AiRisk, Flag, Route, RuleHistory } from "@/lib/safety/rules";
import { checkTransition, type OrderStatus } from "@/lib/orders/state";
import { HOUSEHOLD_TIMEZONE, startOfLocalDay } from "@/lib/time";

type Row = Record<string, unknown>;
type Sql = ReturnType<typeof neon>;

let client: Sql | null = null;
function sql(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

export type Address = { fullName: string; line1: string; city: string; state: string; postalCode: string; countryCode: "US" };
export type Role = "senior" | "caregiver";
export type User = {
  id: string;
  householdId: string;
  role: Role;
  name: string;
  email: string | null;
  address: Address | null;
  selfPayLimitCents: number;
  dailyCapCents: number;
};
export type Household = { id: string; senior: User; caregiver: User };
export type Tracking = { carrier: string; number: string };
export type Order = {
  id: string;
  userId: string;
  sessionId: string | null;
  product: ProductOption;
  quantity: number;
  totalCents: number;
  merchant: string;
  status: OrderStatus;
  route: Route | null;
  flags: Flag[];
  aiRisk: AiRisk | null;
  summary: string | null;
  declineReason: string | null;
  payerRole: Role | null;
  paypalOrderId: string | null;
  captureId: string | null;
  tracking: Tracking | null;
  caregiverToken: string | null;
  remindedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type Session = { id: string; userId: string; lastOptions: ProductOption[]; turns: number };
export type ChatMessage = { role: "user" | "assistant"; text: string };
export type OrderPatch = Partial<
  Pick<Order, "route" | "flags" | "aiRisk" | "summary" | "declineReason" | "payerRole" | "paypalOrderId" | "captureId" | "tracking" | "caregiverToken">
>;
export type TransitionOutcome = { result: "applied" | "noop" | "rejected"; order: Order };

export const DEMO_ADDRESS: Address = {
  fullName: "Rose Miller",
  line1: "1 Main St",
  city: "San Jose",
  state: "CA",
  postalCode: "95131",
  countryCode: "US",
};

const date = (v: unknown) => new Date(v as string | Date);

function toUser(r: Row): User {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    role: r.role as Role,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    address: (r.address as Address | null) ?? null,
    selfPayLimitCents: r.self_pay_limit_cents as number,
    dailyCapCents: r.daily_cap_cents as number,
  };
}

function toOrder(r: Row): Order {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    sessionId: (r.session_id as string | null) ?? null,
    product: r.product as ProductOption,
    quantity: r.quantity as number,
    totalCents: r.total_cents as number,
    merchant: r.merchant as string,
    status: r.status as OrderStatus,
    route: (r.route as Route | null) ?? null,
    flags: (r.flags as Flag[] | null) ?? [],
    aiRisk: (r.ai_risk as AiRisk | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    declineReason: (r.decline_reason as string | null) ?? null,
    payerRole: (r.payer_role as Role | null) ?? null,
    paypalOrderId: (r.paypal_order_id as string | null) ?? null,
    captureId: (r.capture_id as string | null) ?? null,
    tracking: (r.tracking as Tracking | null) ?? null,
    caregiverToken: (r.caregiver_token as string | null) ?? null,
    remindedAt: r.reminded_at ? date(r.reminded_at) : null,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}

function toSession(r: Row): Session {
  return { id: r.id as string, userId: r.user_id as string, lastOptions: (r.last_options as ProductOption[]) ?? [], turns: r.turns as number };
}

// ---------- households and users ----------

export async function createHousehold(caregiverEmail: string | null): Promise<Household> {
  const db = sql();
  const householdId = crypto.randomUUID();
  const seniorId = crypto.randomUUID();
  const caregiverId = crypto.randomUUID();
  await db`insert into households (id) values (${householdId})`;
  await db`insert into users (id, household_id, role, name, address)
           values (${seniorId}, ${householdId}, 'senior', 'Rose', ${JSON.stringify(DEMO_ADDRESS)}::jsonb)`;
  await db`insert into users (id, household_id, role, name, email)
           values (${caregiverId}, ${householdId}, 'caregiver', 'Anna', ${caregiverEmail})`;
  // Three past paid orders give the "unusual amount" and "new store" rules a baseline.
  const past: Array<[string, number, string, number]> = [
    ["Lipton Green Tea, 100 bags", 800, "walmart.com", 6],
    ["Epsom Salt, 3 lb", 1200, "target.com", 4],
    ["Peppermint Tea, 20 bags", 900, "walmart.com", 2],
  ];
  for (const [title, cents, merchant, daysAgo] of past) {
    const product: ProductOption = {
      productId: `seed-${title}`,
      title,
      priceCents: cents,
      merchant,
      url: `https://${merchant}`,
      imageUrl: null,
      imageAlt: title,
      rating: null,
      category: "Grocery",
    };
    await db`insert into orders (id, user_id, product, quantity, total_cents, merchant, status, payer_role, created_at, updated_at)
             values (${crypto.randomUUID()}, ${seniorId}, ${JSON.stringify(product)}::jsonb, 1, ${cents}, ${merchant}, 'SHIPPED', 'senior',
                     now() - make_interval(days => ${daysAgo}::int), now() - make_interval(days => ${daysAgo}::int))`;
  }
  const household = await getHousehold(householdId);
  if (!household) throw new Error("household was not created");
  return household;
}

export async function getHousehold(id: string): Promise<Household | null> {
  const rows = (await sql()`select * from users where household_id = ${id}`) as Row[];
  const senior = rows.find((r) => r.role === "senior");
  const caregiver = rows.find((r) => r.role === "caregiver");
  if (!senior || !caregiver) return null;
  return { id, senior: toUser(senior), caregiver: toUser(caregiver) };
}

export async function getHouseholdByUser(userId: string): Promise<Household | null> {
  const rows = (await sql()`select household_id from users where id = ${userId}`) as Row[];
  return rows[0] ? getHousehold(rows[0].household_id as string) : null;
}

export async function updateLimits(seniorId: string, selfPayLimitCents: number, dailyCapCents: number): Promise<void> {
  await sql()`update users set self_pay_limit_cents = ${selfPayLimitCents}, daily_cap_cents = ${dailyCapCents}
              where id = ${seniorId} and role = 'senior'`;
}

// ---------- sessions and messages ----------

export async function createSession(userId: string): Promise<Session> {
  const rows = (await sql()`insert into sessions (id, user_id) values (${crypto.randomUUID()}, ${userId}) returning *`) as Row[];
  return toSession(rows[0]);
}

export async function getSession(id: string): Promise<Session | null> {
  const rows = (await sql()`select * from sessions where id = ${id}`) as Row[];
  return rows[0] ? toSession(rows[0]) : null;
}

export async function saveOptions(sessionId: string, options: ProductOption[]): Promise<void> {
  await sql()`update sessions set last_options = ${JSON.stringify(options)}::jsonb where id = ${sessionId}`;
}

export async function getOptions(sessionId: string): Promise<ProductOption[]> {
  return (await getSession(sessionId))?.lastOptions ?? [];
}

export async function incrementTurns(sessionId: string): Promise<number> {
  const rows = (await sql()`update sessions set turns = turns + 1 where id = ${sessionId} returning turns`) as Row[];
  return rows[0].turns as number;
}

export async function addMessage(sessionId: string, role: ChatMessage["role"], text: string): Promise<void> {
  await sql()`insert into messages (session_id, role, text) values (${sessionId}, ${role}, ${text})`;
}

export async function recentMessages(sessionId: string, limit: number): Promise<ChatMessage[]> {
  const rows = (await sql()`select role, text from messages where session_id = ${sessionId} order by id desc limit ${limit}`) as Row[];
  return rows.reverse().map((r) => ({ role: r.role as ChatMessage["role"], text: r.text as string }));
}

export async function userUtterances(sessionId: string): Promise<string[]> {
  const rows = (await sql()`select text from messages where session_id = ${sessionId} and role = 'user' order by id`) as Row[];
  return rows.map((r) => r.text as string);
}

// ---------- orders ----------

export async function createDraftOrder(input: { userId: string; sessionId: string; product: ProductOption; quantity: number }): Promise<Order> {
  const total = input.product.priceCents * input.quantity;
  const rows = (await sql()`
    insert into orders (id, user_id, session_id, product, quantity, total_cents, merchant, status)
    values (${crypto.randomUUID()}, ${input.userId}, ${input.sessionId}, ${JSON.stringify(input.product)}::jsonb,
            ${input.quantity}, ${total}, ${input.product.merchant}, 'DRAFT')
    returning *`) as Row[];
  return toOrder(rows[0]);
}

export async function getOrder(id: string): Promise<Order | null> {
  const rows = (await sql()`select * from orders where id = ${id}`) as Row[];
  return rows[0] ? toOrder(rows[0]) : null;
}

export async function getOrderByPaypalId(paypalOrderId: string): Promise<Order | null> {
  const rows = (await sql()`select * from orders where paypal_order_id = ${paypalOrderId}`) as Row[];
  return rows[0] ? toOrder(rows[0]) : null;
}

// Newest real orders. Drafts are excluded here, not by callers: they pile up from cancels and
// re-drafts and would otherwise push real orders out of the limit.
export async function listOrders(userId: string, limit: number): Promise<Order[]> {
  const rows = (await sql()`select * from orders where user_id = ${userId} and status <> 'DRAFT' order by created_at desc limit ${limit}`) as Row[];
  return rows.map(toOrder);
}

export async function listOrdersByStatus(userId: string, statuses: OrderStatus[]): Promise<Order[]> {
  const rows = (await sql()`select * from orders where user_id = ${userId} and status = any(${statuses}) order by created_at desc`) as Row[];
  return rows.map(toOrder);
}

export async function transitionOrder(id: string, to: OrderStatus, actor: string, patch: OrderPatch = {}): Promise<TransitionOutcome | null> {
  const current = await getOrder(id);
  if (!current) return null;
  const check = checkTransition(current.status, to);
  if (check.kind === "noop") return { result: "noop", order: current };
  if (check.kind === "reject") return { result: "rejected", order: current };

  const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
  const rows = (await sql()`
    update orders set
      status = ${to},
      route = coalesce(${patch.route ?? null}, route),
      flags = coalesce(${json(patch.flags)}::jsonb, flags),
      ai_risk = coalesce(${json(patch.aiRisk)}::jsonb, ai_risk),
      summary = coalesce(${patch.summary ?? null}, summary),
      decline_reason = coalesce(${patch.declineReason ?? null}, decline_reason),
      payer_role = coalesce(${patch.payerRole ?? null}, payer_role),
      paypal_order_id = coalesce(${patch.paypalOrderId ?? null}, paypal_order_id),
      capture_id = coalesce(${patch.captureId ?? null}, capture_id),
      tracking = coalesce(${json(patch.tracking)}::jsonb, tracking),
      caregiver_token = coalesce(${patch.caregiverToken ?? null}, caregiver_token),
      updated_at = now()
    where id = ${id} and status = ${current.status}
    returning *`) as Row[];

  if (rows.length === 0) {
    // Another request moved the order first (e.g. webhook vs. return page).
    const latest = await getOrder(id);
    if (!latest) return null;
    return { result: latest.status === to ? "noop" : "rejected", order: latest };
  }
  await sql()`insert into order_events (order_id, from_status, to_status, actor) values (${id}, ${current.status}, ${to}, ${actor})`;
  return { result: "applied", order: toOrder(rows[0]) };
}

export async function setPaypalOrderId(id: string, paypalOrderId: string): Promise<boolean> {
  const rows = (await sql()`update orders set paypal_order_id = ${paypalOrderId}, updated_at = now()
              where id = ${id} and status = 'AWAITING_PAYMENT' and payer_role = 'caregiver'
              returning id`) as Row[];
  if (rows.length === 0) return false;
  await sql()`insert into order_events (order_id, from_status, to_status, actor)
              values (${id}, 'AWAITING_PAYMENT', 'AWAITING_PAYMENT', ${`paypal-rebind:${paypalOrderId}`})`;
  return true;
}

export async function ruleHistory(userId: string, productId: string, excludingOrderId: string): Promise<RuleHistory> {
  const paid = (await sql()`
    select total_cents, merchant, created_at from orders
    where user_id = ${userId} and status in ('PAID', 'SHIPPED')
    order by created_at desc limit 50`) as Row[];
  const startOfDay = startOfLocalDay(new Date(), HOUSEHOLD_TIMEZONE);
  const same = (await sql()`
    select created_at from orders
    where user_id = ${userId} and id <> ${excludingOrderId} and product->>'productId' = ${productId}
      and status in ('AWAITING_CAREGIVER', 'AWAITING_PAYMENT', 'PAID', 'SHIPPED')
    order by created_at desc limit 1`) as Row[];
  return {
    paidTodayCents: paid.filter((r) => date(r.created_at) >= startOfDay).reduce((sum, r) => sum + (r.total_cents as number), 0),
    recentPaidTotalsCents: paid.slice(0, 10).map((r) => r.total_cents as number),
    paidMerchants: [...new Set(paid.map((r) => r.merchant as string))],
    minutesSinceSameProduct: same[0] ? (Date.now() - date(same[0].created_at).getTime()) / 60_000 : null,
  };
}

export async function bumpDailyAgentCalls(): Promise<number> {
  const rows = (await sql()`
    insert into daily_usage (day, agent_calls) values (current_date, 1)
    on conflict (day) do update set agent_calls = daily_usage.agent_calls + 1
    returning agent_calls`) as Row[];
  return rows[0].agent_calls as number;
}

export async function ordersNeedingReminder(hours: number): Promise<Order[]> {
  const rows = (await sql()`
    select * from orders
    where status = 'AWAITING_CAREGIVER' and reminded_at is null and updated_at < now() - make_interval(hours => ${hours}::int)`) as Row[];
  return rows.map(toOrder);
}

export async function markReminded(id: string): Promise<void> {
  await sql()`update orders set reminded_at = now() where id = ${id}`;
}
