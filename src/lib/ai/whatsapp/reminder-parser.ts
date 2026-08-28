/**
 * Parse a reminder time from natural language.
 *
 * Supports:
 *   - Relative: "in 5 min", "in 1 hour", "in 2 days", "after 10 min"
 *   - Tomorrow: "tomorrow", "tomorrow at 5pm", "kal 5 baje"
 *   - Today: "at 5pm", "5 pm today", "shaam 6 baje"
 *   - Hindi: "5 min baad", "1 ghante me", "kal subah"
 *
 * Returns { sendAt: Date, message?: string } or null if no time found.
 */
export interface ParsedReminder {
  sendAt: Date;
  message?: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function parseReminderTime(
  text: string,
  now: Date = new Date()
): ParsedReminder | null {
  const lower = text.toLowerCase().trim();
  let sendAt: Date | null = null;

  // "in N (min|mins|minute|hour|hours|day|days) ..." / "N min baad" / "N ghante me"
  const relMatch = lower.match(
    /\b(?:in|after|baad|me|ke\s*baad)\s+(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|mins?|hour(?:s)?|hr?s?|ghant(?:a|e|ey)?|day(?:s)?|din|hafta|week(?:s)?)\b/
  );
  if (relMatch) {
    const n = parseFloat(relMatch[1]);
    const unit = relMatch[2];
    let ms = 0;
    if (unit.startsWith("min") || unit === "mins" || unit === "din") ms = n * MIN;
    else if (unit.startsWith("hour") || unit.startsWith("hr") || unit.startsWith("ghant")) ms = n * HOUR;
    else if (unit.startsWith("day") || unit.startsWith("hafta") || unit.startsWith("week")) ms = n * DAY;
    if (ms > 0) sendAt = new Date(now.getTime() + ms);
  }

  // "N min" / "N ghante" without "in" prefix (Hindi variant)
  if (!sendAt) {
    const relMatch2 = lower.match(/\b(\d+(?:\.\d+)?)\s*(min|mins|minute(?:s)?|ghant(?:a|e|ey)?|hour(?:s)?|hr?s?|day(?:s)?|din|hafta|week(?:s)?)\s*(baad|me|ke\s*baad|later|after)\b/);
    if (relMatch2) {
      const n = parseFloat(relMatch2[1]);
      const unit = relMatch2[2];
      let ms = 0;
      if (unit.startsWith("min") || unit === "mins" || unit === "din") ms = n * MIN;
      else if (unit.startsWith("hour") || unit.startsWith("hr") || unit.startsWith("ghant")) ms = n * HOUR;
      else if (unit.startsWith("day") || unit.startsWith("hafta") || unit.startsWith("week")) ms = n * DAY;
      if (ms > 0) sendAt = new Date(now.getTime() + ms);
    }
  }

  // "tomorrow at HH:MM" / "kal X baje"
  if (!sendAt && /\b(tomorrow|kal)\b/.test(lower)) {
    const t = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baaje?|baje)?/);
    if (t) {
      let h = parseInt(t[1]);
      const m = t[2] ? parseInt(t[2]) : 0;
      const ampm = t[3]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(h, m, 0, 0);
      sendAt = d;
    } else {
      // "tomorrow" without time → 24h later at 9am (sensible default)
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      sendAt = d;
    }
  }

  // "at HH:MM" / "X baje" today
  if (!sendAt) {
    const t = lower.match(/\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|baaje?|baje)?\b/);
    if (!t) {
      t; // dummy to satisfy ts
      const t2 = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baaje?)\b/);
      if (t2) {
        const h = parseInt(t2[1]);
        const m = t2[2] ? parseInt(t2[2]) : 0;
        const ampm = t2[3]?.toLowerCase();
        let hh = h;
        if (ampm === "pm" && h < 12) hh += 12;
        if (ampm === "am" && h === 12) hh = 0;
        const d = new Date(now);
        d.setHours(hh, m, 0, 0);
        // If the time already passed today, schedule for tomorrow
        if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
        sendAt = d;
      }
    } else {
      let h = parseInt(t[1]);
      const m = t[2] ? parseInt(t[2]) : 0;
      const ampm = t[3]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
      sendAt = d;
    }
  }

  if (!sendAt) return null;
  return { sendAt, message: undefined };
}

/** Quick check: does this text look like a reminder request? */
export function looksLikeReminderRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(remind|reminder|ping|buzz|text\s+me|message\s+me|follow\s*up|remind\s*karna|yaad\s*dila|yaad\s*karna|ping\s*karna)\b/.test(t)) return true;
  if (/\b(in|baad|me|after|later)\s+\d+\s*(min|mins|minute|hour|hr|ghant|day|din|hafta|week)/.test(t)) return true;
  if (/\b\d+\s*(min|mins|minute|hour|hr|ghant|day|din|hafta|week)\s*(baad|me|ke\s*baad|later|after)/.test(t)) return true;
  if (/\b(tomorrow|kal|tonight|aj\s*raat|aaj\s*raat)\b/.test(t) && /\b(\d{1,2}|subah|shaam|dopahar|raat|baje)/.test(t)) return true;
  return false;
}
