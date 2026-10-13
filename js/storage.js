const EVENTS_KEY = "chronox.events.v1";
const SETTINGS_KEY = "chronox.settings.v1";

const DEFAULT_SETTINGS = {
  theme: "light",
  notifications: false,
  sound: false,
  use24Hour: true
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`ChronoX: read error for "${key}"`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`ChronoX: write error for "${key}"`, err);
    return false;
  }
}

export function loadEvents() {
  const events = readJSON(EVENTS_KEY, []);
  return Array.isArray(events) ? events : [];
}

export function saveEvents(events) {
  if (!Array.isArray(events)) throw new TypeError("Events must be an array.");
  return writeJSON(EVENTS_KEY, events);
}

export function loadSettings() {
  const settings = readJSON(SETTINGS_KEY, {});
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function saveSettings(settings) {
  if (!settings || typeof settings !== "object") throw new TypeError("Settings must be an object.");
  return writeJSON(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...settings });
}

export function exportBackup() {
  return JSON.stringify(
    {
      app: "ChronoX",
      version: 1,
      exportedAt: new Date().toISOString(),
      events: loadEvents(),
      settings: loadSettings()
    },
    null,
    2
  );
}

export function importBackup(jsonString) {
  let backup;
  try {
    backup = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  if (
    !backup || typeof backup !== "object" || Array.isArray(backup) ||
    backup.app !== "ChronoX" || backup.version !== 1 || !Array.isArray(backup.events)
  ) {
    throw new Error("Not a valid ChronoX backup.");
  }

  return {
    events: backup.events,
    settings: { ...DEFAULT_SETTINGS, ...(backup.settings || {}) }
  };
}