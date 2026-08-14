const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

export interface ParsedSchedule {
  scheduledAt: string;
  durationMinutes: number;
}

function toDate(day: number, hour: number, minute: number, base: Date): Date {
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  const currentDay = base.getDay();
  let diff = (day - currentDay + 7) % 7;
  if (diff === 0 && date.getTime() <= base.getTime()) diff = 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function parseTimeExpression(text: string): { hour: number; minute: number } | null {
  const timePatterns = [
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\bat\s+(\d{1,2})\s*(am|pm)?\b/i,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3]?.toLowerCase();
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
    let normalizedHour = hour;
    if (meridiem === "pm" && hour < 12) normalizedHour = hour + 12;
    if (meridiem === "am" && hour === 12) normalizedHour = 0;
    return { hour: normalizedHour, minute };
  }
  return null;
}

export function parseScheduleFromText(text: string, baseDate: Date = new Date()): ParsedSchedule | null {
  if (!text || text.length > 500) return null;
  const lower = text.toLowerCase();

  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
  if (isoMatch) {
    const isoDate = new Date(`${isoMatch[1]}T${isoMatch[2]}:${isoMatch[3]}:00`);
    if (!Number.isNaN(isoDate.getTime())) {
      return { scheduledAt: isoDate.toISOString(), durationMinutes: 30 };
    }
  }

  const time = parseTimeExpression(text);
  if (!time) return null;

  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + 1);
    date.setHours(time.hour, time.minute, 0, 0);
    return { scheduledAt: date.toISOString(), durationMinutes: 30 };
  }

  if (/\btoday\b/.test(lower)) {
    const date = new Date(baseDate);
    date.setHours(time.hour, time.minute, 0, 0);
    if (date.getTime() <= baseDate.getTime()) date.setDate(date.getDate() + 1);
    return { scheduledAt: date.toISOString(), durationMinutes: 30 };
  }

  const weekdayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
  if (weekdayMatch) {
    const day = WEEKDAYS[weekdayMatch[2]];
    const isNext = !!weekdayMatch[1];
    const date = toDate(day, time.hour, time.minute, baseDate);
    if (isNext) date.setDate(date.getDate() + 7);
    return { scheduledAt: date.toISOString(), durationMinutes: 30 };
  }

  return null;
}
