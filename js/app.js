/* ========================================
   ChronoX — Application Controller
   File: js/app.js

   Wires together:
   - countdown.js (time math)
   - events.js    (CRUD + filtering)
   - storage.js   (localStorage + backup)
   - ui.js        (rendering)
======================================== */

import {
  getEventStatus,
  getTargetTimestamp,
  padNumber
} from "./countdown.js";

import {
  createEvent,
  updateEvent,
  deleteEvent,
  createPresetEvent,
  findEventById
} from "./events.js";

import {
  loadEvents,
  saveEvents,
  loadSettings,
  saveSettings,
  exportBackup,
  importBackup
} from "./storage.js";

import {
  renderDashboard,
  renderEvents,
  renderStats,
  updateLiveCountdowns,
  updateClock,
  showToast
} from "./ui.js";

/* ----------------------------------------
   Constants
---------------------------------------- */

const NOTIFIED_KEY = "chronox.notified.v1";

const PRESET_TITLES = {
  3600000: "1 hour countdown",
  86400000: "24 hour countdown",
  604800000: "7 day countdown",
  2592000000: "30 day countdown"
};

const COLOR_NAMES = ["purple", "blue", "green", "orange", "pink"];

/* ----------------------------------------
   Application state
---------------------------------------- */

const state = {
  events: [],
  settings: {
    theme: "light",
    notifications: false,
    sound: false,
    use24Hour: true
  },
  filter: "all",
  query: "",
  sortBy: "date",
  editingId: null,
  notifiedIds: new Set(),
  previousStatuses: new Map()
};

/* Cached DOM references */
const dom = {};

let tickHandle = null;
let searchTimer = null;
let audioContext = null;

/* ----------------------------------------
   Small utilities
---------------------------------------- */

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${padNumber(now.getMonth() + 1)}-${padNumber(
    now.getDate()
  )}`;
}

function timestampToDateInput(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(
    date.getDate()
  )}`;
}

function timestampToTimeInput(timestamp) {
  const date = new Date(timestamp);
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

/* ----------------------------------------
   DOM caching
---------------------------------------- */

function cacheDom() {
  dom.sidebar = document.getElementById("sidebar");
  dom.menuButton = document.getElementById("menuButton");
  dom.themeButton = document.getElementById("themeButton");
  dom.createButton = document.getElementById("createButton");
  dom.settingsButton = document.getElementById("settingsButton");

  dom.navLinks = Array.from(document.querySelectorAll(".nav-link[data-filter]"));
  dom.presetButtons = Array.from(document.querySelectorAll(".preset-button"));

  dom.searchInput = document.getElementById("searchInput");
  dom.sortSelect = document.getElementById("sortSelect");
  dom.eventsGrid = document.getElementById("eventsGrid");
  dom.exportButton = document.getElementById("exportButton");
  dom.importButton = document.getElementById("importButton");
  dom.importFile = document.getElementById("importFile");

  dom.countdownModal = document.getElementById("countdownModal");
  dom.countdownForm = document.getElementById("countdownForm");
  dom.modalTitle = document.getElementById("modalTitle");
  dom.closeModalButton = document.getElementById("closeModalButton");
  dom.cancelModalButton = document.getElementById("cancelModalButton");
  dom.saveEventButton = document.getElementById("saveEventButton");

  dom.eventId = document.getElementById("eventId");
  dom.eventTitle = document.getElementById("eventTitle");
  dom.eventDescription = document.getElementById("eventDescription");
  dom.eventDate = document.getElementById("eventDate");
  dom.eventTime = document.getElementById("eventTime");
  dom.eventCategory = document.getElementById("eventCategory");
  dom.eventColor = document.getElementById("eventColor");
  dom.featuredCheckbox = document.getElementById("featuredCheckbox");

  dom.settingsModal = document.getElementById("settingsModal");
  dom.closeSettingsButton = document.getElementById("closeSettingsButton");
  dom.notificationToggle = document.getElementById("notificationToggle");
  dom.soundToggle = document.getElementById("soundToggle");
  dom.formatToggle = document.getElementById("formatToggle");
  dom.clearCompletedButton = document.getElementById("clearCompletedButton");
}

/* ----------------------------------------
   Persistence helpers
---------------------------------------- */

function persistEvents() {
  const saved = saveEvents(state.events);

  if (!saved) {
    showToast("Unable to save your countdowns in this browser.");
  }

  return saved;
}

function persistSettings() {
  const saved = saveSettings(state.settings);

  if (!saved) {
    showToast("Unable to save your settings in this browser.");
  }

  return saved;
}

/* Remember which countdowns already triggered a completion alert */
function loadNotifiedIds() {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    state.notifiedIds = new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    console.error("ChronoX: unable to read notification history.", error);
    state.notifiedIds = new Set();
  }
}

function saveNotifiedIds() {
  try {
    localStorage.setItem(
      NOTIFIED_KEY,
      JSON.stringify([...state.notifiedIds])
    );
  } catch (error) {
    console.error("ChronoX: unable to save notification history.", error);
  }
}

/* ----------------------------------------
   Bootstrapping
---------------------------------------- */

function loadState() {
  state.events = loadEvents();
  state.settings = loadSettings();
  loadNotifiedIds();
}

/**
 * Snapshot the current status of every event.
 * This prevents "completed" alerts from firing
 * for events that finished while the app was closed.
 */
function syncStatuses(now = Date.now()) {
  state.previousStatuses.clear();

  const activeIds = new Set();

  for (const event of state.events) {
    const status = getEventStatus(event, now);

    state.previousStatuses.set(event.id, status);
    activeIds.add(event.id);

    if (status === "completed") {
      state.notifiedIds.add(event.id);
    }
  }

  // Drop bookkeeping for events that no longer exist.
  for (const id of [...state.notifiedIds]) {
    if (!activeIds.has(id)) {
      state.notifiedIds.delete(id);
    }
  }

  saveNotifiedIds();
}

/* ----------------------------------------
   Theme + settings
---------------------------------------- */

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark-theme", isDark);

  if (dom.themeButton) {
    dom.themeButton.textContent = isDark ? "☼" : "☾";
    dom.themeButton.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
    dom.themeButton.title = isDark
      ? "Switch to light theme"
      : "Switch to dark theme";
  }

  const meta = document.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute("content", isDark ? "#121522" : "#f5f7fb");
  }
}

function applySettingsToUI() {
  if (dom.notificationToggle) {
    dom.notificationToggle.checked = Boolean(state.settings.notifications);
  }

  if (dom.soundToggle) {
    dom.soundToggle.checked = Boolean(state.settings.sound);
  }

  if (dom.formatToggle) {
    dom.formatToggle.checked = Boolean(state.settings.use24Hour);
  }

  if (dom.sortSelect) {
    dom.sortSelect.value = state.sortBy;
  }

  if (dom.searchInput) {
    dom.searchInput.value = state.query;
  }
}

/* ----------------------------------------
   Rendering helpers
---------------------------------------- */

function renderEventList() {
  renderEvents(state.events, state.filter, state.query, state.sortBy);
}

function renderAll() {
  renderDashboard({
    events: state.events,
    filter: state.filter,
    query: state.query,
    sortBy: state.sortBy
  });
}

/* ----------------------------------------
   Ticker
---------------------------------------- */

function tick() {
  const now = Date.now();

  updateClock(state.settings.use24Hour);
  updateLiveCountdowns(state.events);
  detectCompletions(now);
}

function startTicker() {
  if (tickHandle !== null) {
    window.clearInterval(tickHandle);
  }

  tick();
  tickHandle = window.setInterval(tick, 1000);
}

/**
 * Compare each event's status with the previous tick.
 * When something flips from upcoming → completed we
 * refresh the stats and fire the user's alerts.
 */
function detectCompletions(now) {
  let statsChanged = false;

  for (const event of state.events) {
    const status = getEventStatus(event, now);
    const previous = state.previousStatuses.get(event.id);

    if (status === "completed" && previous === "upcoming") {
      handleCompletion(event);
      statsChanged = true;
    }

    state.previousStatuses.set(event.id, status);
  }

  if (statsChanged) {
    renderStats(state.events);
  }
}

function handleCompletion(event) {
  const alreadyNotified = state.notifiedIds.has(event.id);

  if (!alreadyNotified) {
    state.notifiedIds.add(event.id);
    saveNotifiedIds();

    showToast(`"${event.title}" has arrived.`, "success");

    if (state.settings.sound) {
      playCompletionSound();
    }

    if (state.settings.notifications) {
      sendCompletionNotification(event);
    }
  }
}

/* ----------------------------------------
   Completion alerts
---------------------------------------- */

function sendCompletionNotification(event) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification("ChronoX — countdown complete", {
      body: `${event.title} has arrived.`,
      tag: event.id
    });
  } catch (error) {
    console.error("ChronoX: unable to show a notification.", error);
  }
}

function playCompletionSound() {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioCtor) return;

    audioContext = audioContext || new AudioCtor();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const start = audioContext.currentTime;
    const notes = [660, 880];

    notes.forEach((frequency, index) => {
      const offset = index * 0.18;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.2);
    });
  } catch (error) {
    console.error("ChronoX: unable to play the completion sound.", error);
  }
}

/* ----------------------------------------
   Modal: create / edit countdown
---------------------------------------- */

function openCountdownModal(event = null) {
  if (!dom.countdownModal) return;

  dom.countdownForm.reset();
  clearFieldErrors();

  dom.eventDate.min = todayISO();

  if (event) {
    state.editingId = event.id;

    dom.modalTitle.textContent = "Edit countdown";
    dom.saveEventButton.textContent = "Update countdown";

    dom.eventId.value = event.id;
    dom.eventTitle.value = event.title ?? "";
    dom.eventDescription.value = event.description ?? "";

    const timestamp = getTargetTimestamp(event);

    dom.eventDate.value = Number.isFinite(timestamp)
      ? timestampToDateInput(timestamp)
      : event.date ?? todayISO();

    dom.eventTime.value = event.time || (Number.isFinite(timestamp)
      ? timestampToTimeInput(timestamp)
      : "12:00");

    dom.eventCategory.value = event.category || "Personal";
    dom.eventColor.value = COLOR_NAMES.includes(event.color)
      ? event.color
      : "purple";
    dom.featuredCheckbox.checked = Boolean(event.featured);
  } else {
    state.editingId = null;

    dom.modalTitle.textContent = "Create countdown";
    dom.saveEventButton.textContent = "Save countdown";

    dom.eventId.value = "";
    dom.eventDate.value = todayISO();
    dom.eventTime.value = "12:00";
    dom.eventCategory.value = "Personal";
    dom.eventColor.value = "purple";
    dom.featuredCheckbox.checked = false;
  }

  if (typeof dom.countdownModal.showModal === "function") {
    if (!dom.countdownModal.open) {
      dom.countdownModal.showModal();
    }
  } else {
    dom.countdownModal.setAttribute("open", "");
  }

  window.setTimeout(() => dom.eventTitle.focus(), 40);
}

function closeCountdownModal() {
  state.editingId = null;

  if (typeof dom.countdownModal.close === "function") {
    dom.countdownModal.close();
  } else {
    dom.countdownModal.removeAttribute("open");
  }
}

function clearFieldErrors() {
  [dom.eventTitle, dom.eventDate, dom.eventTime, dom.eventDescription].forEach(
    (field) => {
      if (field) field.setCustomValidity("");
    }
  );
}

/**
 * Map validation errors returned by events.js
 * onto the matching form field.
 */
function showFormErrors(errors = {}) {
  const fieldMap = {
    title: dom.eventTitle,
    date: dom.eventDate,
    time: dom.eventTime,
    description: dom.eventDescription
  };

  const keys = Object.keys(errors);

  if (keys.length === 0) {
    showToast("Please check the form and try again.");
    return;
  }

  keys.forEach((key) => {
    const field = fieldMap[key];

    if (field && !field.validationMessage) {
      field.setCustomValidity(errors[key]);
    }
  });

  const firstField = fieldMap[keys[0]];

  if (firstField) {
    firstField.reportValidity();
    firstField.focus();
  }

  showToast(errors[keys[0]]);
}

function handleFormSubmit(formEvent) {
  formEvent.preventDefault();

  clearFieldErrors();

  const data = {
    title: dom.eventTitle.value,
    description: dom.eventDescription.value,
    date: dom.eventDate.value,
    time: dom.eventTime.value,
    category: dom.eventCategory.value,
    color: dom.eventColor.value,
    featured: dom.featuredCheckbox.checked
  };

  const editingId = dom.eventId.value;
  const result = editingId
    ? updateEvent(editingId, data, state.events)
    : createEvent(data, state.events);

  if (!result.success) {
    showFormErrors(result.errors);
    return;
  }

  state.events = result.events;

  if (!persistEvents()) return;

  closeCountdownModal();
  syncStatuses();
  renderAll();

  showToast(
    editingId ? "Countdown updated." : "Countdown created.",
    "success"
  );
}

/* ----------------------------------------
   Delete
---------------------------------------- */

function handleDelete(id) {
  const event = findEventById(id, state.events);

  if (!event) return;

  const confirmed = window.confirm(
    `Delete "${event.title}"? This cannot be undone.`
  );

  if (!confirmed) return;

  const result = deleteEvent(id, state.events);

  if (!result.success) {
    showToast("That countdown could not be found.");
    return;
  }

  state.events = result.events;

  if (!persistEvents()) return;

  state.previousStatuses.delete(id);
  state.notifiedIds.delete(id);
  saveNotifiedIds();

  renderAll();
  showToast("Countdown deleted.");
}

/* ----------------------------------------
   Presets
---------------------------------------- */

function handlePreset(durationMs) {
  const title = PRESET_TITLES[durationMs] || "Quick countdown";
  const result = createPresetEvent(durationMs, state.events, title);

  if (!result.success) {
    showToast(result.errors.general || "Unable to create that preset.");
    return;
  }

  state.events = result.events;

  if (!persistEvents()) return;

  syncStatuses();
  renderAll();
  showToast(`"${title}" created.`, "success");
}

/* ----------------------------------------
   Filtering, search and sorting
---------------------------------------- */

function setFilter(filter) {
  state.filter = filter;

  dom.navLinks.forEach((link) => {
    const isActive = link.dataset.filter === filter;

    link.classList.toggle("active", isActive);
    link.setAttribute("aria-current", isActive ? "true" : "false");
  });

  renderEventList();
  closeSidebarOnMobile();
}

/* ----------------------------------------
   Export / import
---------------------------------------- */

function handleExport() {
  // Make sure the latest state is what gets exported.
  persistEvents();
  persistSettings();

  try {
    const json = exportBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `chronox-backup-${todayISO()}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast("Backup downloaded.", "success");
  } catch (error) {
    console.error("ChronoX: export failed.", error);
    showToast("Unable to export your data.");
  }
}

function handleImportFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const backup = importBackup(String(reader.result));

      const confirmed = window.confirm(
        `Import ${backup.events.length} countdown(s)? ` +
          "This will replace your current events and settings."
      );

      if (!confirmed) return;

      state.events = backup.events;
      state.settings = { ...state.settings, ...backup.settings };

      if (!persistEvents() || !persistSettings()) return;

      applyTheme(state.settings.theme);
      applySettingsToUI();
      syncStatuses();
      renderAll();

      showToast("Backup imported successfully.", "success");
    } catch (error) {
      showToast(error.message || "That backup file could not be read.");
    } finally {
      if (dom.importFile) dom.importFile.value = "";
    }
  });

  reader.addEventListener("error", () => {
    showToast("Unable to read that file.");
    if (dom.importFile) dom.importFile.value = "";
  });

  reader.readAsText(file);
}

/* ----------------------------------------
   Settings
---------------------------------------- */

function openSettingsModal() {
  applySettingsToUI();

  if (typeof dom.settingsModal.showModal === "function") {
    if (!dom.settingsModal.open) dom.settingsModal.showModal();
  } else {
    dom.settingsModal.setAttribute("open", "");
  }
}

function closeSettingsModal() {
  if (typeof dom.settingsModal.close === "function") {
    dom.settingsModal.close();
  } else {
    dom.settingsModal.removeAttribute("open");
  }
}

async function handleNotificationToggle(event) {
  const enabled = event.target.checked;

  if (!enabled) {
    state.settings.notifications = false;
    persistSettings();
    return;
  }

  if (!("Notification" in window)) {
    event.target.checked = false;
    state.settings.notifications = false;
    persistSettings();
    showToast("This browser does not support notifications.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      event.target.checked = false;
      state.settings.notifications = false;
      persistSettings();
      showToast("Notification permission was not granted.");
      return;
    }

    state.settings.notifications = true;
    persistSettings();
    showToast("Notifications enabled.", "success");
  } catch (error) {
    console.error("ChronoX: notification permission failed.", error);
    event.target.checked = false;
    state.settings.notifications = false;
    persistSettings();
  }
}

/**
 * Remove every countdown whose target moment has passed.
 *
 * Note: storage.clearCompletedEvents() relies on an
 * "event.status" field that our event objects do not
 * carry, so the filtering happens here instead.
 */
function clearCompletedEvents() {
  const now = Date.now();

  const remaining = state.events.filter(
    (event) => getEventStatus(event, now) !== "completed"
  );

  const removed = state.events.length - remaining.length;

  if (removed === 0) {
    showToast("There are no completed countdowns to clear.");
    return;
  }

  const confirmed = window.confirm(
    `Remove ${removed} completed countdown${removed === 1 ? "" : "s"}?`
  );

  if (!confirmed) return;

  state.events = remaining;

  if (!persistEvents()) return;

  syncStatuses();
  renderAll();
  showToast(
    `${removed} completed countdown${removed === 1 ? "" : "s"} removed.`
  );
}

/* ----------------------------------------
   Sidebar (mobile)
---------------------------------------- */

function toggleSidebar() {
  const isOpen = dom.sidebar.classList.toggle("open");

  dom.menuButton.setAttribute("aria-expanded", String(isOpen));
}

function closeSidebarOnMobile() {
  if (window.matchMedia("(max-width: 900px)").matches) {
    dom.sidebar.classList.remove("open");
    dom.menuButton.setAttribute("aria-expanded", "false");
  }
}

/* ----------------------------------------
   Theme toggle
---------------------------------------- */

function handleThemeToggle() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";

  applyTheme(state.settings.theme);
  persistSettings();
}

/* ----------------------------------------
   Keyboard shortcuts
---------------------------------------- */

function isTypingTarget(target) {
  if (!target) return false;

  const tag = target.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function handleKeydown(event) {
  // "/" focuses the search field
  if (event.key === "/" && !isTypingTarget(event.target)) {
    const modalOpen =
      dom.countdownModal?.open || dom.settingsModal?.open;

    if (!modalOpen) {
      event.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
    }

    return;
  }

  // Escape closes the mobile sidebar
  if (event.key === "Escape" && dom.sidebar.classList.contains("open")) {
    closeSidebarOnMobile();
  }
}

/* ----------------------------------------
   Event binding
---------------------------------------- */

function bindEvents() {
  /* Sidebar + top bar */
  dom.menuButton?.addEventListener("click", toggleSidebar);
  dom.themeButton?.addEventListener("click", handleThemeToggle);
  dom.createButton?.addEventListener("click", () => openCountdownModal());
  dom.settingsButton?.addEventListener("click", openSettingsModal);

  /* Navigation filters */
  dom.navLinks.forEach((link) => {
    link.addEventListener("click", () => setFilter(link.dataset.filter));
  });

  /* Quick presets */
  dom.presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handlePreset(Number(button.dataset.preset));
      closeSidebarOnMobile();
    });
  });

  /* Search + sort */
  dom.searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value;

    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderEventList, 150);
  });

  dom.searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      state.query = "";
      dom.searchInput.value = "";
      renderEventList();
    }
  });

  dom.sortSelect?.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    renderEventList();
  });

  /* Event card actions (edit / delete / empty-state create) */
  dom.eventsGrid?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      const id = actionButton.dataset.id;

      if (actionButton.dataset.action === "edit") {
        const target = findEventById(id, state.events);
        if (target) openCountdownModal(target);
      } else if (actionButton.dataset.action === "delete") {
        handleDelete(id);
      }

      return;
    }

    if (event.target.closest("#emptyCreateButton")) {
      openCountdownModal();
    }
  });

  /* Export / import */
  dom.exportButton?.addEventListener("click", handleExport);
  dom.importButton?.addEventListener("click", () => dom.importFile?.click());
  dom.importFile?.addEventListener("change", (event) => {
    handleImportFile(event.target.files?.[0]);
  });

  /* Countdown modal */
  dom.countdownForm?.addEventListener("submit", handleFormSubmit);
  dom.closeModalButton?.addEventListener("click", closeCountdownModal);
  dom.cancelModalButton?.addEventListener("click", closeCountdownModal);

  dom.countdownModal?.addEventListener("click", (event) => {
    if (event.target === dom.countdownModal) closeCountdownModal();
  });

  dom.countdownModal?.addEventListener("close", () => {
    state.editingId = null;
    clearFieldErrors();
  });

  // Clear a field-level error as soon as the user edits it.
  [dom.eventTitle, dom.eventDate, dom.eventTime, dom.eventDescription].forEach(
    (field) => {
      field?.addEventListener("input", () => field.setCustomValidity(""));
      field?.addEventListener("change", () => field.setCustomValidity(""));
    }
  );

  /* Settings modal */
  dom.closeSettingsButton?.addEventListener("click", closeSettingsModal);

  dom.settingsModal?.addEventListener("click", (event) => {
    if (event.target === dom.settingsModal) closeSettingsModal();
  });

  dom.notificationToggle?.addEventListener("change", handleNotificationToggle);

  dom.soundToggle?.addEventListener("change", (event) => {
    state.settings.sound = event.target.checked;
    persistSettings();

    if (state.settings.sound) {
      // Unlock audio on a user gesture so later alerts can play.
      playCompletionSound();
    }
  });

  dom.formatToggle?.addEventListener("change", (event) => {
    state.settings.use24Hour = event.target.checked;
    persistSettings();
    updateClock(state.settings.use24Hour);
  });

  dom.clearCompletedButton?.addEventListener("click", clearCompletedEvents);

  /* Global keyboard shortcuts */
  document.addEventListener("keydown", handleKeydown);

  /* Re-sync when the tab becomes visible again */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tick();
    }
  });

  /* Keep multiple tabs in sync */
  window.addEventListener("storage", (event) => {
    if (event.key === "chronox.events.v1") {
      state.events = loadEvents();
      syncStatuses();
      renderAll();
    }
  });

  /* Close the sidebar when resizing back to desktop */
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 900px)").matches) {
      dom.sidebar.classList.remove("open");
      dom.menuButton?.setAttribute("aria-expanded", "false");
    }
  });
}

/* ----------------------------------------
   Start the application
---------------------------------------- */

function init() {
  cacheDom();
  loadState();

  applyTheme(state.settings.theme);
  applySettingsToUI();

  bindEvents();

  syncStatuses();
  renderAll();
  updateClock(state.settings.use24Hour);

  startTicker();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}