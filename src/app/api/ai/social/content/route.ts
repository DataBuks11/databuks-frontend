import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/orchestrator";
import { buildBusinessContext } from "@/lib/ai/context/business-context";
import { buildWhatsAppReplyContext } from "@/lib/ai/context/whatsapp-context";
import { generateImage, buildImagePrompt } from "@/lib/ai/content/image-generator";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";

    let query = supabase
      .from("social_posts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (status && status !== "all") query = query.eq("status", status);

    const { data: posts, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ posts: posts ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (!body.provider || !body.content_type) {
      return NextResponse.json({ error: "provider and content_type required" }, { status: 400 });
    }

    const { data: connection } = await supabase
      .from("social_connections")
      .select("connection_id")
      .eq("user_id", user.id)
      .eq("platform", body.provider)
      .eq("status", "connected")
      .maybeSingle();

    const business = await buildBusinessContext(supabase, user.id);
    const context = {
      business,
      lead: null,
      intelligence: null,
      conversation: null,
      messages: [],
      conversationSummary: null,
      duplicateExists: false,
      lastOutreachAt: null,
      outreachCountInWindow: 0,
      contentRequest: { topic: body.topic ?? null, content_type: body.content_type },
    } as any;
    void buildWhatsAppReplyContext;

    const result = await runAiTask(supabase, {
      userId: user.id,
      taskType: "GENERATE_SOCIAL_CONTENT",
      payload: { topic: body.topic ?? null, content_type: body.content_type },
      idempotencyKey: body.idempotency_key ?? undefined,
      prebuiltContext: context,
    });

    if (result.status !== "COMPLETED" || !result.output) {
      return NextResponse.json(result, { status: 422 });
    }

    const output = result.output;

    // Generate the matching image (if Cloudflare Worker is configured).
    // We don't block the post on the image — if it fails, we still save
    // the text and the user can attach a manual image later.
    let imageUrl: string | null = null;
    let imagePrompt: string | null = null;
    try {
      const prompt = buildImagePrompt(
        String(output.topic ?? body.topic ?? ""),
        String(output.caption ?? "")
      );
      const img = await generateImage(prompt);
      imageUrl = img.url;
      imagePrompt = prompt;
    } catch (err: any) {
      console.warn(`[API:ai/social/content] image generation failed: ${err?.message}`);
    }

    const { data: post, error } = await supabase
      .from("social_posts")
      .insert({
        user_id: user.id,
        provider: body.provider,
        account_id: connection?.connection_id ?? null,
        content_type: output.content_type ?? body.content_type,
        topic: output.topic ?? body.topic ?? null,
        draft: output.hook ?? null,
        caption: output.caption ?? null,
        hashtags: output.hashtags ?? [],
        cta: output.cta ?? null,
        image_url: imageUrl,
        image_prompt: imagePrompt,
        status: body.status === "REVIEW" ? "REVIEW" : "DRAFT",
        ai_decision_id: result.taskId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post, generation: result }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
