import moment from "moment";
import { formatDayLabel, formatListTime, formatName, getInitials, otherMember } from "./format";

test("formatName capitalises first and last name", () => {
  expect(formatName({ firstname: "aDA", lastname: "lovelace" })).toBe("Ada Lovelace");
  expect(formatName(null)).toBe("");
  expect(formatName({ firstname: "Solo" })).toBe("Solo");
});

test("getInitials handles missing names", () => {
  expect(getInitials({ firstname: "ada", lastname: "lovelace" })).toBe("AL");
  expect(getInitials({ firstname: "ada" })).toBe("A");
  expect(getInitials(undefined)).toBe("");
});

test("formatListTime uses relative labels", () => {
  const now = moment("2026-03-10T15:00:00");
  expect(formatListTime(null, now)).toBe("");
  expect(formatListTime("2026-03-10T09:05:00", now)).toBe("9:05 AM");
  expect(formatListTime("2026-03-09T09:05:00", now)).toBe("Yesterday");
  expect(formatListTime("2026-01-02T09:05:00", now)).toBe("Jan 2");
  expect(formatListTime("2025-01-02T09:05:00", now)).toBe("Jan 2, 2025");
});

test("formatDayLabel", () => {
  const now = moment("2026-03-10T15:00:00");
  expect(formatDayLabel("2026-03-10T01:00:00", now)).toBe("Today");
  expect(formatDayLabel("2026-03-09T01:00:00", now)).toBe("Yesterday");
});

test("otherMember returns the member that is not the current user", () => {
  const chat = { members: [{ _id: "a" }, { _id: "b" }] };
  expect(otherMember(chat, "a")._id).toBe("b");
  expect(otherMember(null, "a")).toBeNull();
});
