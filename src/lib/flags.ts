/**
 * Feature flags — UI visibility toggles.
 *
 * Default OFF hai. ON karne ke liye Vercel env me
 * NEXT_PUBLIC_SHOW_CONTENT_NAV=true / NEXT_PUBLIC_SHOW_TELEGRAM=true
 * set karke redeploy karo — code change ki zaroorat nahi.
 */
export const SHOW_CONTENT_NAV: boolean =
  process.env.NEXT_PUBLIC_SHOW_CONTENT_NAV === "true";

export const SHOW_TELEGRAM: boolean =
  process.env.NEXT_PUBLIC_SHOW_TELEGRAM === "true";
