import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import * as db from "@/lib/db";
import { currentHousehold } from "@/lib/demo";
import { searchProducts } from "@/lib/channel3";
import { runTurn } from "@/lib/agent/run";
import { AiProviderError } from "@/lib/ai/openaiCompat";
import type { AgentDeps } from "@/lib/agent/tools";
import { readBack, toOptionView, toOrderView } from "@/lib/orders/view";

const MAX_TURNS = 30;
const Body = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  text: z.string().trim().min(1).max(500),
});

const deps: AgentDeps = {
  searchProducts: (query, maxPriceCents) => searchProducts(query, { maxPriceCents }),
  saveOptions: db.saveOptions,
  getOptions: db.getOptions,
  createDraftOrder: db.createDraftOrder,
  listOrders: db.listOrders,
};

export async function POST(req: Request) {
  const household = await currentHousehold();
  if (!household) return NextResponse.json({ error: "no_demo_session" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const senior = household.senior;
  let session = parsed.data.sessionId ? await db.getSession(parsed.data.sessionId) : null;
  if (!session || session.userId !== senior.id) session = await db.createSession(senior.id);
  const sessionId = session.id;
  const quiet = (reply: string) => NextResponse.json({ sessionId, reply, options: null, draft: null });

  if ((await db.incrementTurns(sessionId)) > MAX_TURNS) {
    return quiet("We've talked a lot in this session. Please go back to the home page to start a new one.");
  }
  if ((await db.bumpDailyAgentCalls()) > Number(process.env.DAILY_AGENT_CALL_CAP ?? 2000)) {
    return quiet("The demo helper is resting for today. Please try again tomorrow.");
  }

  const history = await db.recentMessages(sessionId, 20);
  await db.addMessage(sessionId, "user", parsed.data.text);
  try {
    const result = await runTurn({
      deps,
      ctx: { userId: senior.id, sessionId, caregiverName: household.caregiver.name },
      userName: senior.name,
      history,
      userText: parsed.data.text,
    });
    await db.addMessage(sessionId, "assistant", result.reply);
    return NextResponse.json({
      sessionId,
      reply: result.reply,
      options: result.options ? result.options.map(toOptionView) : null,
      draft: result.draft ? { ...toOrderView(result.draft, household.caregiver.name), readBack: readBack(result.draft) } : null,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError || err instanceof AiProviderError) {
      console.error("agent API error", err.status, err.message);
      return NextResponse.json({ sessionId, reply: "Sorry, I had trouble just now. Please say that again.", options: null, draft: null, retry: true });
    }
    throw err;
  }
}
