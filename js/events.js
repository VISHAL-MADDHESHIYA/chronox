import { getTargetTimestamp } from "./countdown.js";

function generateId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateEvent(data) {
  const errors = {};

  if (!data.title || !data.title.trim()) {
    errors.title = "Event title is required.";
  }

  if (!data.date || !data.time) {
    errors.date = "Target date and time are required.";
  } else {
    const target = getTargetTimestamp(data);
    if (!Number.isFinite(target)) {
      errors.date = "Please enter a valid date and time.";
    } else if (target <= Date.now()) {
      errors.date = "Target date must be in the future.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function createEvent(data, existingEvents = []) {
  const v = validateEvent(data);
  if (!v.valid) return { success: false, errors: v.errors, event: null };

  const now = Date.now();
  const event = {
    id: generateId(),
    title: data.title.trim(),
    description: (data.description ?? "").trim(),
    date: data.date,
    time: data.time,
    category: data.category || "Personal",
    color: data.color || "purple",
    featured: Boolean(data.featured),
    createdAt: now,
    updatedAt: now
  };

  const updated = existingEvents.map((item) => ({
    ...item,
    featured: event.featured ? false : Boolean(item.featured)
  }));
  updated.push(event);

  return { success: true, errors: {}, event, events: updated };
}

export function updateEvent(id, data, existingEvents = []) {
  const existing = existingEvents.find((e) => e.id === id);
  if (!existing) return { success: false, errors: { general: "Not found." }, event: null };

  const v = validateEvent(data);
  if (!v.valid) return { success: false, errors: v.errors, event: null };

  const updated = {
    ...existing,
    title: data.title.trim(),
    description: (data.description ?? "").trim(),
    date: data.date,
    time: data.time,
    category: data.category || "Personal",
    color: data.color || "purple",
    featured: Boolean(data.featured),
    updatedAt: Date.now()
  };

  const list = existingEvents.map((e) =>
    e.id === id ? updated : { ...e, featured: updated.featured ? false : Boolean(e.featured) }
  );

  return { success: true, errors: {}, event: updated, events: list };
}

export function deleteEvent(id, existingEvents = []) {
  const exists = existingEvents.some((e) => e.id === id);
  if (!exists) return { success: false, events: existingEvents };
  return { success: true, events: existingEvents.filter((e) => e.id !== id) };
}

export function searchEvents(events, query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return [...events];
  return events.filter((e) => {
    const text = [e.title, e.description, e.category].filter(Boolean).join(" ").toLowerCase();
    return text.includes(q);
  });
}

export function filterEvents(events, filter = "all", now = Date.now()) {
  if (filter === "all") return [...events];
  if (filter === "upcoming") return events.filter((e) => getTargetTimestamp(e) > now);
  if (filter === "completed") return events.filter((e) => getTargetTimestamp(e) <= now);
  return events.filter((e) => e.category?.toLowerCase() === filter.toLowerCase());
}

export function sortEvents(events, sortBy = "date") {
  const list = [...events];
  switch (sortBy) {
    case "date":
      return list.sort((a, b) => getTargetTimestamp(a) - getTargetTimestamp(b));
    case "date-desc":
      return list.sort((a, b) => getTargetTimestamp(b) - getTargetTimestamp(a));
    case "name":
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case "created":
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    default:
      return list;
  }
}

export function getEventStats(events, now = Date.now()) {
  let upcoming = 0, completed = 0, invalid = 0;
  for (const e of events) {
    const ts = getTargetTimestamp(e);
    if (!Number.isFinite(ts)) invalid++;
    else if (ts <= now) completed++;
    else upcoming++;
  }
  return { total: events.length, upcoming, completed, invalid };
}

export function findEventById(id, events = []) {
  return events.find((e) => e.id === id) ?? null;
}

export function getFeaturedEvent(events, now = Date.now()) {
  const featured = events.find((e) => e.featured && getTargetTimestamp(e) > now);
  if (featured) return featured;
  return sortEvents(filterEvents(events, "upcoming", now), "date")[0] ?? null;
}

export function createPresetEvent(durationMs, existingEvents = [], title = "Quick countdown") {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { success: false, errors: { general: "Invalid duration." }, event: null };
  }

  const targetAt = Date.now() + durationMs;
  const d = new Date(targetAt);
  const pad = (v) => String(v).padStart(2, "0");

  return createEvent(
    {
      title,
      description: "Created using a quick preset.",
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      category: "Personal",
      color: "purple",
      featured: false
    },
    existingEvents
  );
}