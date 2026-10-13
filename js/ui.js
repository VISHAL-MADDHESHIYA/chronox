import {
  getTimeRemaining,
  getTargetTimestamp,
  calculateProgress,
  formatTargetDate,
  getEventStatus,
  getNextEvent,
  padNumber
} from "./countdown.js";

import {
  getEventStats,
  getFeaturedEvent,
  searchEvents,
  filterEvents,
  sortEvents
} from "./events.js";

function escapeHTML(value = "") {
  const chars = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (c) => chars[c]);
}

export function renderStats(events) {
  const stats = getEventStats(events);
  const next = getNextEvent(events);

  const totalEl = document.getElementById("totalEvents");
  const upcomingEl = document.getElementById("upcomingEvents");
  const completedEl = document.getElementById("completedEvents");
  const allCountEl = document.getElementById("allCount");
  const nextEl = document.getElementById("nextMilestone");
  const nextDateEl = document.getElementById("nextMilestoneDate");

  if (totalEl) totalEl.textContent = stats.total;
  if (upcomingEl) upcomingEl.textContent = stats.upcoming;
  if (completedEl) completedEl.textContent = stats.completed;
  if (allCountEl) allCountEl.textContent = stats.total;

  if (next) {
    if (nextEl) nextEl.textContent = next.title;
    if (nextDateEl) nextDateEl.textContent = formatTargetDate(next);
  } else {
    if (nextEl) nextEl.textContent = "No events";
    if (nextDateEl) nextDateEl.textContent = "Create your first countdown";
  }
}

function createEventTimerHTML(event) {
  const r = getTimeRemaining(event);
  if (!r.valid) return `<p class="event-description">Invalid date</p>`;
  if (r.expired) return `<p class="event-description">✓ Countdown completed</p>`;

  return `
    <div class="event-timer" data-event-timer="${escapeHTML(event.id)}">
      <div class="event-time-unit"><strong data-unit="days">${padNumber(r.days)}</strong><span>DAYS</span></div>
      <div class="event-time-unit"><strong data-unit="hours">${padNumber(r.hours)}</strong><span>HOURS</span></div>
      <div class="event-time-unit"><strong data-unit="minutes">${padNumber(r.minutes)}</strong><span>MINUTES</span></div>
      <div class="event-time-unit"><strong data-unit="seconds">${padNumber(r.seconds)}</strong><span>SECONDS</span></div>
    </div>
  `;
}

function createEventCard(event) {
  const status = getEventStatus(event);
  const progress = calculateProgress(event);
  const id = escapeHTML(event.id);
  const title = escapeHTML(event.title);
  const description = escapeHTML(event.description || "No description added.");
  const category = escapeHTML(event.category || "Personal");
  const color = ["purple", "blue", "green", "orange", "pink"].includes(event.color)
    ? event.color
    : "purple";

  const statusLabel = status === "completed"
    ? "Completed"
    : status === "invalid" ? "Invalid date" : "Upcoming";

  return `
    <article class="event-card" data-card-id="${id}" style="--event-accent: var(--${color});">
      <div class="event-card-header">
        <span class="event-category">${category}</span>
        <div class="event-actions">
          <button type="button" data-action="edit" data-id="${id}" title="Edit">✎</button>
          <button type="button" data-action="delete" data-id="${id}" title="Delete">×</button>
        </div>
      </div>
      <h3>${title}</h3>
      <p class="event-description">${description}</p>
      <p class="event-date">◷ ${escapeHTML(formatTargetDate(event))}</p>
      <div class="event-timer-container">${createEventTimerHTML(event)}</div>
      <div class="event-progress">
        <div class="event-progress-fill" data-progress-id="${id}" style="width: ${progress}%; background: var(--event-accent);"></div>
      </div>
      <div class="event-card-footer">
        <span>${statusLabel}</span>
        <span>${Number(progress.toFixed(1))}% elapsed</span>
      </div>
    </article>
  `;
}

export function renderEvents(events, filter = "all", query = "", sortBy = "date") {
  const grid = document.getElementById("eventsGrid");
  const heading = document.getElementById("eventHeadingCount");
  const resultsLabel = document.getElementById("resultsLabel");

  if (!grid) return;

  const searched = searchEvents(events, query);
  const filtered = filterEvents(searched, filter);
  const sorted = sortEvents(filtered, sortBy);

  if (heading) heading.textContent = `(${filtered.length})`;
  if (resultsLabel) resultsLabel.textContent = `Showing ${filtered.length} of ${events.length} events`;

  if (sorted.length === 0) {
    const hasEvents = events.length > 0;
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◷</div>
        <h3>${hasEvents ? "No matching countdowns" : "Your timeline starts here"}</h3>
        <p>${hasEvents ? "Try changing your search or filter." : "Add an event, set your target date, and watch every second count."}</p>
        ${hasEvents ? "" : `<button type="button" class="primary-button" id="emptyCreateButton">＋ Create your first countdown</button>`}
      </div>
    `;
    return;
  }

  grid.innerHTML = sorted.map(createEventCard).join("");
  updateLiveCountdowns(events);
}

export function updateLiveCountdowns(events) {
  const now = Date.now();

  for (const event of events) {
    const r = getTimeRemaining(event, now);
    const card = document.querySelector(`[data-card-id="${CSS.escape(event.id)}"]`);
    if (!card) continue;

    const timer = card.querySelector(".event-timer");
    if (!r.valid || r.expired) {
      if (timer) {
        timer.outerHTML = `<p class="event-description">${r.valid ? "✓ Countdown completed" : "Invalid date"}</p>`;
      }
    } else if (timer) {
      ["days", "hours", "minutes", "seconds"].forEach((unit) => {
        const el = timer.querySelector(`[data-unit="${unit}"]`);
        if (el) el.textContent = padNumber(r[unit]);
      });
    }

    const progress = calculateProgress(event, now);
    const bar = card.querySelector("[data-progress-id]");
    if (bar) bar.style.width = `${progress}%`;

    const footer = card.querySelector(".event-card-footer");
    if (footer) {
      footer.firstElementChild.textContent = getEventStatus(event, now) === "completed" ? "Completed" : "Upcoming";
      footer.lastElementChild.textContent = `${Number(progress.toFixed(1))}% elapsed`;
    }
  }

  renderFeatured(events, now);
}

export function renderFeatured(events, now = Date.now()) {
  const event = getFeaturedEvent(events, now);

  const title = document.getElementById("featuredTitle");
  const description = document.getElementById("featuredDescription");
  const category = document.getElementById("featuredCategory");
  const date = document.getElementById("featuredDate");

  const timerEls = {
    days: document.getElementById("featuredDays"),
    hours: document.getElementById("featuredHours"),
    minutes: document.getElementById("featuredMinutes"),
    seconds: document.getElementById("featuredSeconds")
  };

  const progressText = document.getElementById("featuredProgressText");
  const progressFill = document.getElementById("featuredProgressFill");

  if (!event) {
    if (title) title.textContent = "Your next chapter starts here.";
    if (description) description.textContent = "Create a countdown and give your next goal a deadline.";
    if (category) category.textContent = "YOUR NEXT MILESTONE";
    if (date) date.textContent = "No target date selected";
    Object.values(timerEls).forEach((el) => el && (el.textContent = "00"));
    if (progressText) progressText.textContent = "0%";
    if (progressFill) progressFill.style.width = "0%";
    return;
  }

  const r = getTimeRemaining(event, now);
  const progress = calculateProgress(event, now);

  if (title) title.textContent = event.title;
  if (description) description.textContent = event.description || "Your next important milestone.";
  if (category) category.textContent = (event.category || "Personal").toUpperCase();
  if (date) date.textContent = formatTargetDate(event);

  Object.keys(timerEls).forEach((unit) => {
    if (timerEls[unit]) timerEls[unit].textContent = padNumber(r[unit] ?? 0);
  });

  if (progressText) progressText.textContent = `${progress.toFixed(1)}%`;
  if (progressFill) progressFill.style.width = `${progress}%`;
}

export function updateClock(use24Hour = true) {
  const timeEl = document.getElementById("currentTime");
  const dateEl = document.getElementById("currentDate");
  const yearEl = document.getElementById("footerYear");
  const now = new Date();

  if (timeEl) {
    timeEl.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: !use24Hour
    }).format(now);
  }
  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    }).format(now);
  }
  if (yearEl) yearEl.textContent = now.getFullYear();
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.dataset.type = type;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

export function renderDashboard({ events = [], filter = "all", query = "", sortBy = "date" } = {}) {
  renderStats(events);
  renderEvents(events, filter, query, sortBy);
  renderFeatured(events);
}