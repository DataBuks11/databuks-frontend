const OUTREACH_EVENT_TYPES = ["OUTREACH_SENT", "OUTREACH_ATTEMPTED"];

export async function countOutreachInWindow(
  supabase: any,
  userId: string,
  windowHours = 24
): Promise<number> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const { count, error } = await supabase
    .from("funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("event_type", OUTREACH_EVENT_TYPES)
    .gte("created_at", since);
  if (error) throw new Error(`Failed to count outreach events: ${error.message}`);
  return count ?? 0;
}

export async function lastOutreachAtForLead(
  supabase: any,
  userId: string,
  leadId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("funnel_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .in("event_type", OUTREACH_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(`Failed to read outreach events: ${error.message}`);
  return data?.created_at ?? null;
}
