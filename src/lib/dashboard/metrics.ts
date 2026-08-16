export interface OverviewMetrics {
  totalLeads: number;
  newLeads7d: number;
  qualifiedLeads: number;
  conversations: number;
  totalMessages: number;
  meetingsBooked: number;
  meetingsHeld: number;
  websiteScans: number;
  conversionRate: number | null;
}

export interface DayBucket {
  day: string;
  leads: number;
  conversations: number;
  messages: number;
  meetings: number;
}

export async function computeOverview(supabase: any, userId: string): Promise<OverviewMetrics> {
  const [leadsRes, convRes, msgRes, meetRes, scanRes] = await Promise.all([
    supabase.from("leads").select("funnel_stage,created_at").eq("user_id", userId),
    supabase.from("conversations").select("id").eq("user_id", userId),
    supabase.from("messages").select("id").eq("user_id", userId),
    supabase.from("meetings").select("status").eq("user_id", userId),
    supabase.from("website_scans").select("status").eq("user_id", userId),
  ]);

  const leads = leadsRes.data ?? [];
  const meetings = meetRes.data ?? [];
  const scans = scanRes.data ?? [];
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;

  const qualifiedCount = leads.filter(
    (l: any) =>
      ["QUALIFIED", "PRIORITIZED", "OUTREACH_READY", "CONTACTED", "CONVERSATION", "MEETING_INTENT", "MEETING_BOOKED", "MEETING_HELD", "WON"].includes(
        l.funnel_stage
      )
  ).length;

  return {
    totalLeads: leads.length,
    newLeads7d: leads.filter((l: any) => new Date(l.created_at).getTime() > weekAgo).length,
    qualifiedLeads: qualifiedCount,
    conversations: (convRes.data ?? []).length,
    totalMessages: (msgRes.data ?? []).length,
    meetingsBooked: meetings.filter((m: any) => ["scheduled", "confirmed", "held"].includes(m.status)).length,
    meetingsHeld: meetings.filter((m: any) => m.status === "held").length,
    websiteScans: scans.filter((s: any) => ["COMPLETED", "PARTIAL"].includes(s.status)).length,
    conversionRate: qualifiedCount > 0 ? Math.round((meetings.length / qualifiedCount) * 100) : null,
  };
}

export async function computeDailyBuckets(
  supabase: any,
  userId: string,
  days: number
): Promise<DayBucket[]> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const [leadsRes, convRes, msgRes, meetRes] = await Promise.all([
    supabase.from("leads").select("created_at").eq("user_id", userId).gte("created_at", since),
    supabase.from("conversations").select("created_at").eq("user_id", userId).gte("created_at", since),
    supabase.from("messages").select("created_at").eq("user_id", userId).gte("created_at", since),
    supabase.from("meetings").select("created_at").eq("user_id", userId).gte("created_at", since),
  ]);

  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = date.toISOString().slice(0, 10);
    buckets.push({ day: key, leads: 0, conversations: 0, messages: 0, meetings: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.day, i]));

  const countByDay = (rows: any[], field: string) => {
    for (const row of rows) {
      const key = String(row[field]).slice(0, 10);
      const i = index.get(key);
      if (i !== undefined) {
        if (field === "created_at") buckets[i].leads += 1;
      }
    }
  };

  countByDay(leadsRes.data ?? [], "created_at");
  for (const row of convRes.data ?? []) {
    const i = index.get(String(row.created_at).slice(0, 10));
    if (i !== undefined) buckets[i].conversations += 1;
  }
  for (const row of msgRes.data ?? []) {
    const i = index.get(String(row.created_at).slice(0, 10));
    if (i !== undefined) buckets[i].messages += 1;
  }
  for (const row of meetRes.data ?? []) {
    const i = index.get(String(row.created_at).slice(0, 10));
    if (i !== undefined) buckets[i].meetings += 1;
  }

  return buckets;
}
