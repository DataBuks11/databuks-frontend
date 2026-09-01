import { describe, it, expect } from "vitest";
import { parseApprovalReply } from "@/lib/ai/content/approval-handler";

describe("parseApprovalReply", () => {
  it("returns 'approved' for yes", () => {
    expect(parseApprovalReply("yes").decision).toBe("approved");
  });
  it("returns 'approved' for ok", () => {
    expect(parseApprovalReply("ok").decision).toBe("approved");
    expect(parseApprovalReply("done").decision).toBe("approved");
  });
  it("returns 'rejected' for no", () => {
    expect(parseApprovalReply("no").decision).toBe("rejected");
    expect(parseApprovalReply("nope").decision).toBe("rejected");
    expect(parseApprovalReply("cancel").decision).toBe("rejected");
  });
  it("returns 'edited' for edit: text", () => {
    const r = parseApprovalReply("edit: make it shorter");
    expect(r.decision).toBe("edited");
    expect(r.editText).toBe("make it shorter");
  });
  it("returns 'scheduled' for schedule: HH:MM", () => {
    const r = parseApprovalReply("schedule: 18:30");
    expect(r.decision).toBe("scheduled");
    expect(r.scheduleAt).toBe("18:30"); // raw input — ISO conversion happens in applyApproval
  });
  it("returns 'unknown' for random text", () => {
    expect(parseApprovalReply("hello world").decision).toBe("unknown");
  });
  it("extracts numeric prefix for index", () => {
    const r = parseApprovalReply("1 yes");
    expect(r.index).toBe(1);
    expect(r.decision).toBe("approved");
  });
  it("handles Hinglish no (nah)", () => {
    expect(parseApprovalReply("nah").decision).toBe("rejected");
  });
});
