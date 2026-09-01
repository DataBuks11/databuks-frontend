import { runAiTask } from "../orchestrator";
import { buildBusinessContext } from "../context/business-context";
import { generateImage, buildImagePrompt } from "./image-generator";

/**
 * DAILY AI POST GENERATOR
 *
 * Once per day, for each user who has set daily_post_count > 0:
 *   1. Pull the user's business context (industry, services, voice, etc.)
 *   2. For each "slot" (1..daily_post_count), generate a unique topic + post copy
 *      via the LLM (GENERATE_SOCIAL_CONTENT task). The LLM picks topics it
 *      hasn't covered recently and rotates through formats (post, story).
 *   3. Generate a matching image via the image-generator (Cloudflare Worker).
 *   4. Save to social_posts as DRAFT, approval_status='pending'.
 *   5. Push to the user's personal assistant WhatsApp number for approval.
 *
 * Approval happens via WhatsApp replies:
 *   "yes" / "ok" / "done"    → approval_status = 'approved', ready to publish
 *   "no" / "cancel"          → approval_status = 'rejected'
 *   "edit: <text>"           → approval_status = 'edited', edit_suggestion set
 *   "schedule: <time>"       → approval_status = 'approved', scheduled_at set
 * Approval flow is handled by the WhatsApp engine itself; this module only
 * generates and asks.
 */

export interface DailyPost {
  id: string;
  topic: string;
  caption: string;
  hashtags: string[];
  cta: string | null;
  image_url: string | null;
  image_prompt: string | null;
  content_type: string;
  status: string;
}

export interface DailyPostResult {
  userId: string;
  phone: string | null;
  count: number;
  posts: DailyPost[];
  errors: string[];
}

interface ProfilePrefs {
  id: string;
  phone: string | null;
  daily_post_count: number;
  post_preferences: {
    avoid_topics?: string[];
    preferred_topics?: string[];
    style_overrides?: string;
    post_count_today_override?: number;
  };
}

/**
 * Run the daily generator for one user. Returns the generated drafts and any
 * per-post errors. The caller is responsible for the WhatsApp push.
 */
export async function generateDailyPostsForUser(
  supabase: any,
  userId: string,
  options: { maxPosts?: number; overrideTopics?: string[] } = {}
): Promise<DailyPostResult> {
  const result: DailyPostResult = {
    userId,
    phone: null,
    count: 0,
    posts: [],
    errors: [],
  };

  // 1. Profile + preferences
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone, daily_post_count, post_preferences")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    result.errors.push("profile not found");
    return result;
  }
  const prefs = profile as ProfilePrefs;
  result.phone = prefs.phone ?? null;
  const overrideCount = prefs.post_preferences?.post_count_today_override;
  const count = Math.max(
    0,
    Math.min(
      10,
      options.maxPosts ?? overrideCount ?? prefs.daily_post_count ?? 0
    )
  );
  if (count === 0) {
    return result; // user opted out
  }

  // 2. Business context
  const business = await buildBusinessContext(supabase, userId);
  if (!business.business_name) {
    result.errors.push("business context missing");
    return result;
  }

  // 3. Recent topics to avoid repetition
  const { data: recent } = await supabase
    .from("social_posts")
    .select("topic")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const recentTopics = (recent ?? []).map((r: any) => r.topic).filter(Boolean);

  const userTopics = prefs.post_preferences?.preferred_topics ?? [];
  const avoid = prefs.post_preferences?.avoid_topics ?? [];
  const topicPool = [
    ...userTopics,
    ...(business.services ?? []).map((s: any) => s.name),
    ...(business.industries ?? []),
    ...recentTopics.filter((t: string) => !avoid.includes(t)).slice(0, 3),
  ].filter(Boolean);

  if (topicPool.length === 0) {
    result.errors.push("no topics to generate from");
    return result;
  }

  // 4. Generate each post (sequentially for now; parallel later if needed)
  for (let i = 0; i < count; i++) {
    const seedTopic = topicPool[i % topicPool.length];
    const variant = ["post", "story", "post", "reel"][i % 4];
    try {
      const post = await generateOnePost(supabase, userId, business, seedTopic, variant, prefs);
      result.posts.push(post);
      result.count += 1;
    } catch (err: any) {
      result.errors.push(`post ${i + 1}: ${err?.message ?? "unknown"}`);
    }
  }

  return result;
}

interface BizShape {
  business_name: string | null;
  description: string | null;
  services: Record<string, unknown>[];
  target_audience: Record<string, unknown>[];
  industries: string[];
  brand_voice: string[];
  tone: string | null;
}

async function generateOnePost(
  supabase: any,
  userId: string,
  business: BizShape,
  topic: string,
  contentType: string,
  prefs: ProfilePrefs
): Promise<DailyPost> {
  // Build a context for the LLM
  const ctx = {
    business,
    lead: null,
    intelligence: null,
    conversation: null,
    messages: [],
    conversationSummary: null,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
    contentRequest: { topic, content_type: contentType },
  } as any;

  const result = await runAiTask(supabase, {
    userId,
    taskType: "GENERATE_SOCIAL_CONTENT",
    payload: { topic, content_type: contentType },
    prebuiltContext: ctx,
  });

  if (result.status !== "COMPLETED" || !result.output) {
    throw new Error(`LLM did not return a draft: ${result.status}`);
  }

  const out: any = result.output;

  // Image generation (best-effort, never blocks)
  let imageUrl: string | null = null;
  let imagePrompt: string | null = null;
  try {
    const prompt = buildImagePrompt(topic, out.caption);
    const img = await generateImage(prompt);
    imageUrl = img.url;
    imagePrompt = prompt;
  } catch {
    // ignore — image is optional
  }

  // Persist as DRAFT (approval_status='pending' so the WhatsApp reply loop
  // can recognize the user's decision later).
  const { data: row, error } = await supabase
    .from("social_posts")
    .insert({
      user_id: userId,
      provider: "instagram", // default; user picks platform at publish time
      content_type: contentType,
      topic,
      draft: out.hook ?? null,
      caption: out.caption ?? null,
      hashtags: Array.isArray(out.hashtags) ? out.hashtags : [],
      cta: out.cta ?? null,
      image_url: imageUrl,
      image_prompt: imagePrompt,
      status: "DRAFT",
      approval_status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(`db insert failed: ${error.message}`);

  return {
    id: row.id,
    topic,
    caption: out.caption ?? "",
    hashtags: Array.isArray(out.hashtags) ? out.hashtags : [],
    cta: out.cta ?? null,
    image_url: imageUrl,
    image_prompt: imagePrompt,
    content_type: contentType,
    status: "DRAFT",
  };
}
