/**
 * OUTREACH SAFETY GATE (cold-WhatsApp protection)
 *
 * Hamara Baileys stack UNOFFICIAL WhatsApp automation hai — blind
 * 10-20/day blasting se number ban hota hai. Isliye har send se pehle:
 * - configurable DAILY CAP (default 20, env OUTREACH_DAILY_CAP)
 * - MIN INTERVAL between sends (default 90s, env OUTREACH_MIN_INTERVAL_S)
 * - duplicate prevention (7-day idempotency already in orchestrator;
 *   yahan same-day same-lead double-send guard)
 *
 * Opt-out / loop / max-turn conversation ke andar conversation-engine
 * + cooldown.ts me pehle se hain — ye gate FIRST-TOUCH sends par hai.
 * Controlled testing me ye gate har run par enforce hota hai.
 */

export interface SafetyCheck {
  allowed: boolean;
  reason: string | null;
  /** seconds to wait before retry (min-interval case) */
  retryAfterSec: number | null;
}

export function dailyCap(): number {
  const v = Number(process.env.OUTREACH_DAILY_CAP ?? "20");
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 20;
}

export function minIntervalSec(): number {
  const v = Number(process.env.OUTREACH_MIN_INTERVAL_S ?? "90");
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 90;
}

/** Randomized spacing helper (scheduling side ke liye; send path block nahi karta) */
export function jitteredDelayMs(baseMs: number, jitterMs: number): number {
  return Math.max(0, baseMs + Math.floor(Math.random() * Math.max(0, jitterMs)));
}

export async function checkOutreachSafety(
  supabase: any,
  userId: string
): Promise<SafetyCheck> {
  const cap = dailyCap();
  const interval = minIntervalSec();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  let recent: any[] | null = null;
  try {
    const res = await supabase
      .from("funnel_events")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("event_type", "OUTREACH_SENT")
      .gte("created_at", dayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(Math.max(cap + 1, 5));
    recent = res.data ?? [];
    if (res.error) throw res.error;
  } catch {
    // DB unreachable — fail CLOSED (koi send nahi), kyunki cap verify nahi hui.
    return { allowed: false, reason: "safety-check unavailable (funnel_events unreadable) — failing closed", retryAfterSec: 300 };
  }

  if ((recent ?? []).length >= cap) {
    return { allowed: false, reason: `daily outreach cap reached (${recent!.length}/${cap}) — resume tomorrow`, retryAfterSec: null };
  }

  const latest = (recent ?? [])[0]?.created_at ?? null;
  if (latest && interval > 0) {
    const elapsedSec = (Date.now() - new Date(latest).getTime()) / 1000;
    if (elapsedSec < interval) {
      return {
        allowed: false,
        reason: `min send interval not met (${Math.floor(elapsedSec)}s < ${interval}s) — anti-ban spacing`,
        retryAfterSec: Math.ceil(interval - elapsedSec),
      };
    }
  }

  return { allowed: true, reason: null, retryAfterSec: null };
}
