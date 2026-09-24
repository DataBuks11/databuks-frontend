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
  'DataBuks provides website development, web and mobile application development, business automation, WhatsApp AI automation, AI sales agents and custom software solutions to small and medium businesses with real digital presence, automation or sales automation needs. First goal: acquire paying clients starting Nagpur, then Maharashtra, then India, then global.',
  '["Website Development", "Web Application Development", "Mobile Application Development", "Business Automation", "WhatsApp AI Automation", "AI Sales Agent", "Custom Software Solutions", "API and Third-party Integrations", "AI-powered Business Solutions"]'::jsonb,
  '["WhatsApp AI Sales Agent"]'::jsonb,
  '[
    {"segment": "Jewellery stores in Nagpur", "description": "Instagram active with product photos but no website catalogue or WhatsApp enquiry flow"},
    {"segment": "Real estate builders in Nagpur", "description": "Site-visit enquiries on phone only, no project website with lead capture or WhatsApp follow-up"},
    {"segment": "Restaurants in Nagpur", "description": "No proper website or online ordering, active Google profile, takes orders on phone or WhatsApp"},
    {"segment": "Hotels in Nagpur", "description": "No direct booking website, depends on walk-ins or aggregators, no guest follow-up automation"},
    {"segment": "Clinics and hospitals in Nagpur", "description": "Appointment booking on phone only, no online booking system or patient follow-up automation"},
    {"segment": "Coaching institutes in Nagpur", "description": "Enquiries on phone or walk-in only, no lead capture website or follow-up system"},
    {"segment": "Salons and spas in Nagpur", "description": "Appointments on phone or walk-in, Instagram active but no online booking or reminder automation"},
    {"segment": "Travel agencies in Nagpur", "description": "Packages shared on WhatsApp manually, no website with package catalogue or enquiry capture"},
    {"segment": "Manufacturers in Nagpur MIDC", "description": "No product catalogue website, quotation process manual on phone or email"},
    {"segment": "Distributors in Nagpur", "description": "Order taking on phone or WhatsApp manually, no dealer portal or order tracking system"},
    {"segment": "Retail shops in Nagpur", "description": "Walk-in only sales, no online catalogue or customer re-engagement system"},
    {"segment": "Professional services in Nagpur (CA, lawyers, consultants)", "description": "Client intake on phone, no website with service details or appointment booking"},
    {"segment": "Logistics and transporters in Nagpur", "description": "Booking coordination on phone, no tracking system or customer notification automation"},
    {"segment": "E-commerce sellers in Nagpur", "description": "Selling only on marketplaces, no own website, no customer retention automation"},
    {"segment": "B2B service businesses in Nagpur", "description": "Lead handling manual, no CRM, no follow-up automation, quotations over phone"}
  ]'::jsonb,
  '{"business_size": "Small and medium businesses", "budget_min_inr": 10000, "decision_makers": ["Founder", "Owner", "Marketing Head"], "website_status": "Missing, outdated, or no automation", "need_basis": "Category alone is never the reason — visible digital or sales gap required", "geography": "Nagpur first, then Maharashtra, then India, then global"}'::jsonb,
  '["Nagpur, Maharashtra, India"]'::jsonb,
  '["hospitality", "retail", "healthcare", "education", "real estate", "manufacturing", "professional services", "logistics", "ecommerce"]'::jsonb,
  '{"primary": "Website plus WhatsApp AI automation", "pitch": "Customers already find you on Google and Instagram — we turn that attention into enquiries and meetings"}'::jsonb,
  -- Full phrases only (substring match hota hai): agency-line businesses
  -- filter hongi, prospects (hospital, restaurant) safe rahenge.
  -- NOTE: SaaS ko hard-exclude nahi kiya — AI verdict (classifyIndustryFit)
  -- case-by-case decide karta hai; clear opportunity ho to prospect reh sakta hai.
  '["web design agency", "web development agency", "website development company", "software development agency", "digital marketing agency", "seo agency", "ai agency", "automation agency", "it services company"]'::jsonb,
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
--        jsonb_array_length(services) AS services, -- expect 9
--        jsonb_array_length(target_audience) AS audiences, -- expect 15
--        locations, excluded_industries
-- FROM public.business_context WHERE user_id = auth.uid();
