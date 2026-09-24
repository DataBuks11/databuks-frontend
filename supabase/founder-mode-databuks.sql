-- ============================================================
-- DataBuks FOUNDER MODE preset (dogfooding: DataBuks apna
-- pehla customer khud acquire karega)
--
-- Ye file "First paying project" goal ka step 1 hai:
-- business_context me DataBuks ka preset bharna = Founder Mode.
-- Naya system/column kuch nahi — sirf 1 row.
--
-- KAISE APPLY KARNA HAI (2 minute):
-- 1. Supabase Dashboard > SQL Editor kholo (owner login me)
-- 2. Ye poori file paste karke RUN karo
-- 3. auth.uid() tumhara logged-in user uthayega; row nahi
--    hai to INSERT, hai to UPDATE (upsert — kuch delete nahi hoga)
--
-- AGAR ERROR AAYE: null value in column "user_id"
-- (matlab SQL Editor me auth.uid() NULL hai) to ye karo:
--   a. Pehle ye chalao:  SELECT id, email FROM auth.users;
--   b. Apni email wali id copy karo
--   c. Is file me auth.uid() ki JAGAH 'tumhari-id' likho
--      (2 jagah hai: VALUES me aur verify SELECT me)
--   d. Phir RUN karo
--
-- EFFECT (code me pehle se wired hai, kuch deploy nahi chahiye):
-- - runFindLeads (orchestrator.ts) isi row se queries banayega:
--   Nagpur LOCAL funnel -> NEARBY -> DISTRICT -> STATE -> COUNTRY
-- - detectCompetitor: services ke keywords (website, development,
--   whatsapp, automation, software...) + excluded_industries se
--   same-line agencies (WebCreata-type leads) filter hongi
-- - classifyIndustryFit AI verdict ko OUR SERVICES/INDUSTRIES milega
-- - monthly_meeting_target = 5 (north-star KPI)
-- ============================================================

INSERT INTO public.business_context (
  user_id,
  business_name,
  description,
  services,
  products,
  target_audience,
  ideal_customer_profile,
  locations,
  industries,
  offer,
  excluded_industries,
  excluded_lead_types,
  preferred_channels,
  monthly_meeting_target,
  updated_at
) VALUES (
  auth.uid(),
  'DataBuks',
  'DataBuks provides website development, website redesign, WhatsApp AI automation and custom software services to small and mid-size service businesses. First goal: acquire paying clients starting Nagpur, then Maharashtra, then India.',
  '["Website Development", "Website Redesign", "WhatsApp AI Chatbot and Automation", "AI Sales Agent", "Custom Software Development"]'::jsonb,
  '["WhatsApp AI Sales Agent"]'::jsonb,
  '[
    {"segment": "Restaurants in Nagpur", "description": "No proper website or online ordering, active Google profile, takes orders on phone or WhatsApp"},
    {"segment": "Jewellery stores in Nagpur", "description": "Instagram active with product photos but no website catalogue or WhatsApp enquiry flow"},
    {"segment": "Clinics and hospitals in Nagpur", "description": "Appointment booking on phone only, no online booking system or patient follow-up automation"},
    {"segment": "Coaching institutes in Nagpur", "description": "Enquiries on phone or walk-in only, no lead capture website or follow-up system"},
    {"segment": "Hotels in Nagpur", "description": "No direct booking website, depends on walk-ins or aggregators, no guest follow-up automation"},
    {"segment": "Real estate builders in Nagpur", "description": "Site-visit enquiries on phone only, no project website with lead capture or WhatsApp follow-up"},
    {"segment": "Manufacturers in Nagpur MIDC", "description": "No product catalogue website, quotation process manual on phone or email"},
    {"segment": "Local retailers in Nagpur", "description": "Walk-in only sales, no online catalogue or customer re-engagement system"}
  ]'::jsonb,
  '{"business_size": "Small to mid-size businesses", "budget_min_inr": 10000, "decision_makers": ["Founder", "Owner", "Marketing Head"], "website_status": "Missing, outdated, or no automation", "geography": "Nagpur first, then Maharashtra, then India"}'::jsonb,
  '["Nagpur, Maharashtra, India"]'::jsonb,
  '["hospitality", "retail", "healthcare", "education", "real estate", "manufacturing", "professional services"]'::jsonb,
  '{"primary": "Website plus WhatsApp AI automation", "pitch": "Customers already find you on Google and Instagram — we turn that attention into enquiries and meetings"}'::jsonb,
  -- Full phrases only (substring match hota hai): agency-line businesses
  -- filter hongi, prospects (hospital, restaurant) safe rahenge.
  '["web design agency", "web development agency", "website development company", "software development agency", "digital marketing agency", "it services company", "seo agency"]'::jsonb,
  '["competitor", "same-line agency"]'::jsonb,
  '["whatsapp", "instagram", "email"]'::jsonb,
  5,
  now()
)
ON CONFLICT (user_id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  description = EXCLUDED.description,
  services = EXCLUDED.services,
  products = EXCLUDED.products,
  target_audience = EXCLUDED.target_audience,
  ideal_customer_profile = EXCLUDED.ideal_customer_profile,
  locations = EXCLUDED.locations,
  industries = EXCLUDED.industries,
  offer = EXCLUDED.offer,
  excluded_industries = EXCLUDED.excluded_industries,
  excluded_lead_types = EXCLUDED.excluded_lead_types,
  preferred_channels = EXCLUDED.preferred_channels,
  monthly_meeting_target = EXCLUDED.monthly_meeting_target,
  updated_at = now();

-- Verify (1 row aani chahiye):
-- SELECT business_name, monthly_meeting_target,
--        jsonb_array_length(services) AS services,
--        jsonb_array_length(target_audience) AS audiences,
--        locations, excluded_industries
-- FROM public.business_context WHERE user_id = auth.uid();
