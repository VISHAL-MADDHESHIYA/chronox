/* Countdown time math */

export function getTargetTimestamp(event) {
  if (event.targetAt != null) {
    const ts = typeof event.targetAt === "number"
      ? event.targetAt
      : new Date(event.targetAt).getTime();
    return Number.isFinite(ts) ? ts : NaN;
  }
  if (!event.date || !event.time) return NaN;
  const ts = new Date(`${event.date}T${event.time}:00`).getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

export function getTimeRemaining(target, now = Date.now()) {
  const ts = (typeof target === "object" && target !== null)
    ? getTargetTimestamp(target)
    : new Date(target).getTime();

  if (!Number.isFinite(ts)) {
    return { valid: false, expired: false, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const ms = Math.max(0, ts - now);
  const totalSec = Math.floor(ms / 1000);

  return {
    valid: true,
    expired: ts <= now,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60
  };
}

export function padNumber(value) {
  return String(value).padStart(2, "0");
}

export function getEventStatus(event, now = Date.now()) {
  const ts = getTargetTimestamp(event);
  if (!Number.isFinite(ts)) return "invalid";
  return ts <= now ? "completed" : "upcoming";
}

export function calculateProgress(event, now = Date.now()) {
  const target = getTargetTimestamp(event);
  const start = new Date(event.createdAt ?? now).getTime();

  if (!Number.isFinite(target) || !Number.isFinite(start)) return 0;

  const duration = target - start;
  if (duration <= 0 || now >= target) return 100;
  if (now <= start) return 0;

  const percent = ((now - start) / duration) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function getNextEvent(events, now = Date.now()) {
  return events
    .filter((e) => getEventStatus(e, now) === "upcoming")
    .sort((a, b) => getTargetTimestamp(a) - getTargetTimestamp(b))[0] ?? null;
}

export function formatTargetDate(event) {
  const ts = getTargetTimestamp(event);
  if (!Number.isFinite(ts)) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(ts);
}