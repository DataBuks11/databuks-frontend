import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_PLAN = {
  name: "DataBuks Pro",
  price: 149,
  billingCycle: "monthly",
  features: [
    "5,000 automated DMs/month",
    "All platform connections",
    "Advanced AI lead scoring",
    "Unlimited content scheduling",
    "Analytics dashboard",
    "Priority support",
    "API access",
  ],
};

const DEFAULT_USAGE = {
  leads: { used: 0, limit: 10000 },
  content: { used: 0, limit: 5000 },
  automations: { used: 0, limit: 25 },
  storage: { used: 0, limit: 50, unit: "GB" },
};

const DEFAULT_PAYMENT_METHODS: Array<{
  id: string;
  type: "visa" | "mastercard" | "amex";
  lastFour: string;
  expiry: string;
  isDefault: boolean;
}> = [];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: invoiceRows, error: invError } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const plan = subscription
      ? {
          name: subscription.plan_name || DEFAULT_PLAN.name,
          price: subscription.plan_price ?? DEFAULT_PLAN.price,
          billingCycle: (subscription.billing_cycle as "monthly" | "annual") || DEFAULT_PLAN.billingCycle,
          features: DEFAULT_PLAN.features,
        }
      : DEFAULT_PLAN;

    const usage = DEFAULT_USAGE;

    const invoices = (invoiceRows || []).map((inv) => ({
      id: inv.id,
      date: inv.date,
      amount: inv.amount,
      status: inv.status,
      description: inv.description || "",
    }));

    const paymentMethods = DEFAULT_PAYMENT_METHODS;

    return NextResponse.json({ plan, usage, invoices, paymentMethods });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.plan_name !== undefined) updates.plan_name = body.plan_name;
    if (body.plan_price !== undefined) updates.plan_price = body.plan_price;
    if (body.billing_cycle !== undefined) updates.billing_cycle = body.billing_cycle;
    if (body.status !== undefined) updates.status = body.status;
    updates.updated_at = new Date().toISOString();

    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from("subscriptions")
        .update(updates)
        .eq("user_id", user.id)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("subscriptions")
        .insert({ user_id: user.id, ...updates })
        .select("*")
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const plan = {
      name: result.data.plan_name || DEFAULT_PLAN.name,
      price: result.data.plan_price ?? DEFAULT_PLAN.price,
      billingCycle: (result.data.billing_cycle as "monthly" | "annual") || DEFAULT_PLAN.billingCycle,
      features: DEFAULT_PLAN.features,
    };

    return NextResponse.json({ plan, usage: DEFAULT_USAGE, invoices: [], paymentMethods: DEFAULT_PAYMENT_METHODS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
