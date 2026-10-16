// Demo households live at the demo address (San Jose, CA).
// ponytail: one fixed zone; store a timezone per household if real users span zones.
export const HOUSEHOLD_TIMEZONE = "America/Los_Angeles";

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant of local midnight (in timeZone) for the day containing `now`.
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const { year, month, day } = localParts(now, timeZone);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  let instant = midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone);
  instant = midnightAsUtc - offsetMs(new Date(instant), timeZone); // settle DST-change days
  return new Date(instant);
}
