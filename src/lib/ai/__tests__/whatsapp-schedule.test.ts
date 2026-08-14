import { describe, expect, it } from "vitest";
import { parseScheduleFromText } from "@/lib/ai/whatsapp/schedule";

const base = new Date("2026-08-15T10:00:00Z");
const tuesday = new Date("2026-08-18T10:00:00Z");

describe("parseScheduleFromText", () => {
  it("parses ISO datetime", () => {
    const parsed = parseScheduleFromText("Let's do 2026-08-20 15:00", base);
    expect(parsed).not.toBeNull();
    expect(new Date(parsed!.scheduledAt).getHours()).toBe(15);
    expect(parsed!.durationMinutes).toBe(30);
  });

  it("parses tomorrow with am/pm", () => {
    const parsed = parseScheduleFromText("Can we talk tomorrow at 3pm?", base);
    expect(parsed).not.toBeNull();
    const date = new Date(parsed!.scheduledAt);
    expect(date.getHours()).toBe(15);
  });

  it("parses weekday with time", () => {
    const parsed = parseScheduleFromText("Monday at 11:30 works for me", tuesday);
    expect(parsed).not.toBeNull();
    const date = new Date(parsed!.scheduledAt);
    expect(date.getDay()).toBe(1);
    expect(date.getHours()).toBe(11);
    expect(date.getMinutes()).toBe(30);
  });

  it("parses next-weekday", () => {
    const parsed = parseScheduleFromText("next friday at 2pm", tuesday);
    expect(parsed).not.toBeNull();
    const date = new Date(parsed!.scheduledAt);
    expect(date.getDay()).toBe(5);
    expect(date.getTime()).toBeGreaterThan(tuesday.getTime() + 6 * 24 * 3600 * 1000);
  });

  it("returns null for vague text without time", () => {
    expect(parseScheduleFromText("let's talk sometime", base)).toBeNull();
    expect(parseScheduleFromText("can we call?", base)).toBeNull();
    expect(parseScheduleFromText("", base)).toBeNull();
  });

  it("handles 24h time", () => {
    const parsed = parseScheduleFromText("tomorrow 14:30", base);
    expect(parsed).not.toBeNull();
    expect(new Date(parsed!.scheduledAt).getHours()).toBe(14);
  });
});
