/* ============================================================
   Routine — Personal Routine & Task Management
   Single-file vanilla JS app. Local-first (localStorage).
   Data keys: rtm.tasks | rtm.categories | rtm.settings | rtm.history
   ============================================================ */

"use strict";

/* ----------------------------- Utilities ----------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const uid = () =>
  "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, "0");

/** Local-date string YYYY-MM-DD (no UTC shifting). */
const toDateStr = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse YYYY-MM-DD into a local Date at midnight. */
const parseDate = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const todayStr = () => toDateStr(new Date());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addMonths = (d, n) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const fmtLongDate = (d) =>
  `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
const fmtShortDate = (d) =>
  `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/** "18:00" -> minutes since midnight (or null). */
const timeToMinutes = (t) => {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
};

const minutesToTime = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

const fmtTime12 = (t) => {
  const m = timeToMinutes(t);
  if (m === null) return "";
  let h = Math.floor(m / 60),
    mi = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(mi)} ${ap}`;
};

/** ISO-ish week key, e.g. 2026-W40 */
const isoWeekKey = (d) => {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((x - yStart) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${pad(week)}`;
};

/** Monday of the week containing d. */
const weekStart = (d) => {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
};

/* ----------------------------- Defaults ----------------------------- */
const DEFAULT_CATEGORIES = [
  { id: "work", name: "Work", color: "#5B6CFF", icon: "💼" },
  { id: "study", name: "Study", color: "#8A5CF6", icon: "📚" },
  { id: "exercise", name: "Exercise", color: "#22B573", icon: "🏃" },
  { id: "personal", name: "Personal", color: "#F2A93B", icon: "🏠" },
  { id: "finance", name: "Finance", color: "#0EA5A5", icon: "💰" },
  { id: "projects", name: "Projects", color: "#EF4B5E", icon: "🚀" },
  { id: "health", name: "Health", color: "#F06292", icon: "❤️" },
  { id: "other", name: "Other", color: "#9AA0B4", icon: "◆" },
];

const DEFAULT_SETTINGS = {
  theme: "auto", // 'light' | 'dark' | 'auto'
  dailyGoalPct: 80,
  weeklyGoalPct: 70,
  notifications: false,
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/* ============================================================
   STORAGE LAYER
   ============================================================ */
const Storage = (() => {
  const K = {
    tasks: "rtm.tasks",
    categories: "rtm.categories",
    settings: "rtm.settings",
    history: "rtm.history",
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error("[storage] corrupt data for", key, e);
      // Preserve the corrupt payload for debugging, don't destroy it.
      try {
        localStorage.setItem(
          key + ".corrupt." + Date.now(),
          localStorage.getItem(key),
        );
      } catch {}
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("[storage] write failed", e);
      toast("Storage full — could not save.", null, 4000);
      return false;
    }
  }

  return {
    loadTasks: () => read(K.tasks, []),
    saveTasks: (t) => write(K.tasks, t),
    loadCategories: () => read(K.categories, null),
    saveCategories: (c) => write(K.categories, c),
    loadSettings: () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) }),
    saveSettings: (s) => write(K.settings, s),
    loadHistory: () => read(K.history, []),
    saveHistory: (h) => write(K.history, h),
    keys: K,
  };
})();

/* ============================================================
   APPLICATION STATE
   ============================================================ */
const State = {
  tasks: [],
  categories: [],
  settings: { ...DEFAULT_SETTINGS },
  history: [], // { type, payload, at }  — for undo
  view: "today",
  calMonth: new Date(), // currently displayed month in Month view
  filters: { q: "", category: "", priority: "", status: "" },
  sort: "time",
  editingId: null,
  charts: {}, // Chart.js instances
  notifiedIds: new Set(), // reminders already fired this session
};

/* ============================================================
   RECURRENCE ENGINE
   ============================================================ */

/**
 * Expand a recurring task into concrete occurrences between two dates.
 * Returns array of virtual task objects (same id, different `date`).
 * A task is only expanded for dates >= its own start date.
 */
function expandTask(task, rangeStart, rangeEnd) {
  const results = [];
  const start = parseDate(task.date);
  if (!start) return [task];

  const rec = task.recurrence || "none";
  if (rec === "none") {
    const d = parseDate(task.date);
    if (d >= rangeStart && d <= rangeEnd) results.push({ ...task });
    return results;
  }

  const end = rangeEnd;
  let cursor = new Date(start);

  // Fast-forward cursor so we don't loop over years of history.
  if (cursor < rangeStart) {
    if (rec === "daily") {
      const days = Math.ceil((rangeStart - cursor) / 86400000);
      cursor = addDays(cursor, Math.max(0, days));
    } else if (rec === "weekly" || rec === "custom" || rec === "weekdays") {
      // step week-by-week
      while (addDays(cursor, 7) <= rangeStart) cursor = addDays(cursor, 7);
    } else if (rec === "monthly") {
      while (addMonths(cursor, 1) <= rangeStart) cursor = addMonths(cursor, 1);
    } else if (rec === "yearly") {
      while (addMonths(cursor, 12) <= rangeStart)
        cursor = addMonths(cursor, 12);
    }
  }

  const customDays = Array.isArray(task.recurrenceDays)
    ? task.recurrenceDays.map(Number)
    : [];

  let guard = 0;
  while (cursor <= end && guard++ < 4000) {
    let include = false;

    if (rec === "daily") include = true;
    else if (rec === "weekly") include = cursor.getDay() === start.getDay();
    else if (rec === "monthly") include = cursor.getDate() === start.getDate();
    else if (rec === "yearly")
      include =
        cursor.getDate() === start.getDate() &&
        cursor.getMonth() === start.getMonth();
    else if (rec === "weekdays")
      include = cursor.getDay() >= 1 && cursor.getDay() <= 5;
    else if (rec === "custom") include = customDays.includes(cursor.getDay());

    if (include && cursor >= start) {
      results.push({ ...task, date: toDateStr(cursor), _virtual: true });
    }

    // advance
    if (rec === "monthly") cursor = addMonths(cursor, 1);
    else if (rec === "yearly") cursor = addMonths(cursor, 12);
    else cursor = addDays(cursor, 1);
  }

  return results;
}

/** Materialize all tasks (incl. recurring occurrences) within a range. */
function tasksInRange(rangeStart, rangeEnd, tasks = State.tasks) {
  const out = [];
  for (const t of tasks) {
    if (t.recurrence && t.recurrence !== "none") {
      out.push(...expandTask(t, rangeStart, rangeEnd));
    } else {
      const d = parseDate(t.date);
      if (d && d >= rangeStart && d <= rangeEnd) out.push({ ...t });
    }
  }
  return out;
}

/** Per-date completion record lives on the task: completions: { '2026-09-30': iso } */
function completionKey(task) {
  return task.date;
}

function isCompletedOn(task, dateStr) {
  if (task.completions && task.completions[dateStr]) return true;
  // Non-recurring legacy support
  if (!task.recurrence || task.recurrence === "none")
    return task.status === "completed";
  return false;
}
function isSkippedOn(task, dateStr) {
  return task.skips && task.skips[dateStr];
}
function isDone(task, dateStr) {
  return isCompletedOn(task, dateStr) || isSkippedOn(task, dateStr);
}

/* ============================================================
   TASK CRUD
   ============================================================ */
function createTask(data = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: (data.title || "Untitled task").trim(),
    description: data.description || "",
    date: data.date || todayStr(),
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    category: data.category || "other",
    priority: ["high", "medium", "low"].includes(data.priority)
      ? data.priority
      : "medium",
    status: data.status || "pending",
    recurrence: data.recurrence || "none",
    recurrenceDays: data.recurrenceDays || [],
    tags: Array.isArray(data.tags)
      ? data.tags
      : data.tags
        ? String(data.tags)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    reminder: !!data.reminder,
    remindMinutes: Number.isFinite(data.remindMinutes)
      ? data.remindMinutes
      : 10,
    createdAt: data.createdAt || now,
    updatedAt: now,
    completedAt: data.completedAt || null,
    completions: data.completions || {},
    skips: data.skips || {},
  };
}

function findTask(id) {
  return State.tasks.find((t) => t.id === id);
}

function saveTasks() {
  State.tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  Storage.saveTasks(State.tasks);
}

/** Push an undoable action. */
function pushHistory(entry) {
  State.history.unshift({ ...entry, at: Date.now() });
  State.history = State.history.slice(0, 30);
  Storage.saveHistory(State.history);
}

function undoLast() {
  const entry = State.history.shift();
  if (!entry) return toast("Nothing to undo.");
  Storage.saveHistory(State.history);

  switch (entry.type) {
    case "create":
      State.tasks = State.tasks.filter((t) => t.id !== entry.task.id);
      break;
    case "delete":
      State.tasks.push(entry.task);
      break;
    case "update":
      State.tasks = State.tasks.map((t) =>
        t.id === entry.before.id ? entry.before : t,
      );
      break;
    case "complete":
    case "uncomplete":
    case "skip":
    case "unskip":
      State.tasks = State.tasks.map((t) =>
        t.id === entry.after.id ? entry.before : t,
      );
      break;
    default:
      break;
  }
  saveTasks();
  render();
  toast("Undone.");
}

function snapshot(task) {
  return JSON.parse(JSON.stringify(task));
}

/* ============================================================
   COMPLETION
   ============================================================ */
function toggleComplete(taskId, dateStr) {
  const t = findTask(taskId);
  if (!t) return;
  const date = dateStr || t.date;
  const before = snapshot(t);

  t.completions = t.completions || {};
  t.skips = t.skips || {};

  if (t.completions[date]) {
    delete t.completions[date];
    t.status = "pending";
    t.completedAt = null;
  } else {
    t.completions[date] = new Date().toISOString();
    delete t.skips[date];
    t.status = "completed";
    t.completedAt = t.completions[date];
  }
  t.updatedAt = new Date().toISOString();

  pushHistory({
    type: t.completions[date] ? "complete" : "uncomplete",
    before,
    after: snapshot(t),
  });
  saveTasks();
  render();

  if (t.completions[date]) {
    const pct = todayProgress().pct;
    toast(`✓ ${t.title}`, null, 2200);
    if (pct >= State.settings.dailyGoalPct) {
      setTimeout(
        () => toast("🎯 Daily goal reached! Excellent work.", null, 3200),
        500,
      );
    }
  }
}

function toggleSkip(taskId, dateStr) {
  const t = findTask(taskId);
  if (!t) return;
  const date = dateStr || t.date;
  const before = snapshot(t);

  t.skips = t.skips || {};
  t.completions = t.completions || {};

  if (t.skips[date]) delete t.skips[date];
  else {
    t.skips[date] = true;
    delete t.completions[date];
  }
  t.updatedAt = new Date().toISOString();

  pushHistory({
    type: t.skips[date] ? "skip" : "unskip",
    before,
    after: snapshot(t),
  });
  saveTasks();
  render();
}

/* ============================================================
   STATISTICS
   ============================================================ */
function dayStats(dateStr) {
  const d = parseDate(dateStr);
  const list = tasksInRange(d, d);
  let total = 0,
    done = 0,
    skipped = 0;
  for (const t of list) {
    total++;
    if (isCompletedOn(t, dateStr)) done++;
    else if (isSkippedOn(t, dateStr)) skipped++;
  }
  const effective = total - skipped;
  return {
    total,
    done,
    skipped,
    pending: total - done - skipped,
    pct: effective ? Math.round((done / effective) * 100) : 0,
  };
}

function todayProgress() {
  return dayStats(todayStr());
}

function rangeStats(start, end) {
  let total = 0,
    done = 0,
    skipped = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = toDateStr(cursor);
    const s = dayStats(ds);
    total += s.total;
    done += s.done;
    skipped += s.skipped;
    cursor.setDate(cursor.getDate() + 1);
  }
  const effective = total - skipped;
  return {
    total,
    done,
    skipped,
    pending: total - done - skipped,
    pct: effective ? Math.round((done / effective) * 100) : 0,
  };
}

function allTimeStats() {
  let total = 0,
    done = 0,
    skipped = 0;
  const seen = new Set();

  for (const t of State.tasks) {
    const start = parseDate(t.date);
    if (!start) continue;
    const rec = t.recurrence && t.recurrence !== "none";
    const end = rec ? startOfDay(new Date()) : start;

    if (!rec) {
      total++;
      if (isCompletedOn(t, t.date)) done++;
      else if (isSkippedOn(t, t.date)) skipped++;
      continue;
    }
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= end && guard++ < 4000) {
      const ds = toDateStr(cursor);
      const key = t.id + "|" + ds;
      if (!seen.has(key)) {
        seen.add(key);
        total++;
        if (isCompletedOn(t, ds)) done++;
        else if (isSkippedOn(t, ds)) skipped++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const effective = total - skipped;
  return {
    total,
    done,
    skipped,
    pending: total - done - skipped,
    pct: effective ? Math.round((done / effective) * 100) : 0,
  };
}

/** Streak: consecutive days (ending today or yesterday) with >=1 completion. */
function computeStreaks() {
  const completedDays = new Set();
  for (const t of State.tasks) {
    for (const [dateStr, iso] of Object.entries(t.completions || {})) {
      if (iso) completedDays.add(dateStr);
    }
    if (
      (!t.recurrence || t.recurrence === "none") &&
      t.status === "completed" &&
      t.completedAt
    ) {
      completedDays.add(t.date);
    }
  }

  const sorted = [...completedDays].sort();
  let current = 0,
    longest = 0,
    run = 0,
    prev = null;

  for (const ds of sorted) {
    if (!prev) run = 1;
    else {
      const diff = Math.round((parseDate(ds) - parseDate(prev)) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prev = ds;
  }

  // current streak — count back from today (or yesterday)
  const today = startOfDay(new Date());
  let cursor = completedDays.has(toDateStr(today)) ? today : addDays(today, -1);
  while (completedDays.has(toDateStr(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, totalDays: completedDays.size };
}

function categoryBreakdown(start, end) {
  const map = new Map();
  for (const c of State.categories) map.set(c.id, { ...c, total: 0, done: 0 });

  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = toDateStr(cursor);
    for (const t of tasksInRange(cursor, cursor)) {
      const entry = map.get(t.category) || {
        id: t.category,
        name: t.category,
        color: "#9AA0B4",
        icon: "◆",
        total: 0,
        done: 0,
      };
      entry.total++;
      if (isCompletedOn(t, ds)) entry.done++;
      map.set(t.category, entry);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return [...map.values()].filter((c) => c.total > 0);
}

/* ============================================================
   QUICK-ADD PARSER
   "Study 19:00 2h #Study High"
   ============================================================ */
function parseQuickAdd(input) {
  const raw = input.trim();
  if (!raw) return null;

  const data = { title: raw, priority: "medium", tags: [], category: "" };
  let text = raw;

  // tags  #foo
  const tags = [...text.matchAll(/#(\w[\w-]*)/g)].map((m) => m[1]);
  if (tags.length) {
    data.tags = tags;
    text = text.replace(/#\w[\w-]*/g, "");
  }

  // priority keywords
  const prioMatch = text.match(/\b(high|medium|low|urgent)\b/i);
  if (prioMatch) {
    const p = prioMatch[1].toLowerCase();
    data.priority = p === "urgent" ? "high" : p;
    text = text.replace(prioMatch[0], "");
  }

  // start time HH:MM  (also 7pm / 7:30pm)
  let startTime = "";
  const t24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const t12 = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (t24) {
    startTime = `${pad(+t24[1])}:${t24[2]}`;
    text = text.replace(t24[0], "");
  } else if (t12) {
    let h = +t12[1] % 12;
    if (t12[3].toLowerCase() === "pm") h += 12;
    startTime = `${pad(h)}:${t12[2] || "00"}`;
    text = text.replace(t12[0], "");
  }
  data.startTime = startTime;

  // duration -> endTime
  const dur = text.match(
    /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins)\b/i,
  );
  if (dur && startTime) {
    const amount = parseFloat(dur[1]);
    const mins = /^h/i.test(dur[2])
      ? Math.round(amount * 60)
      : Math.round(amount);
    data.endTime = minutesToTime((timeToMinutes(startTime) + mins) % 1440);
    text = text.replace(dur[0], "");
  }

  // date words
  const lower = text.toLowerCase();
  if (/\btomorrow\b/.test(lower)) {
    data.date = toDateStr(addDays(new Date(), 1));
    text = text.replace(/\btomorrow\b/i, "");
  } else if (/\btoday\b/.test(lower)) {
    data.date = todayStr();
    text = text.replace(/\btoday\b/i, "");
  }

  // category keyword match against known categories
  for (const c of State.categories) {
    const re = new RegExp(
      "\\b" + c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "i",
    );
    if (re.test(text)) {
      data.category = c.id;
      text = text.replace(re, "");
      break;
    }
  }

  data.title = text.replace(/\s{2,}/g, " ").trim() || raw;
  return data;
}

/* ============================================================
   TOASTS
   ============================================================ */
function toast(message, actionLabel, duration = 2600, onAction) {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (actionLabel) {
    const b = document.createElement("button");
    b.textContent = actionLabel;
    b.onclick = () => {
      onAction?.();
      dismiss();
    };
    el.appendChild(b);
  }
  stack.appendChild(el);
  const timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  }
  return dismiss;
}

function toastUndo(message) {
  toast(message, "Undo", 4500, undoLast);
}

/* ============================================================
   THEME
   ============================================================ */
function applyTheme() {
  const pref = State.settings.theme;
  const dark =
    pref === "dark" ||
    (pref === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const labels = { light: "☀ Light", dark: "☾ Dark", auto: "◑ Auto" };
  $("#themeLabel").textContent = pref[0].toUpperCase() + pref.slice(1);
  $("#themeIcon").textContent = labels[pref].split(" ")[0];

  // Re-render charts so they pick up new colors
  if (Object.keys(State.charts).length) setTimeout(renderCharts, 50);
}

function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const idx = order.indexOf(State.settings.theme);
  State.settings.theme = order[(idx + 1) % order.length];
  Storage.saveSettings(State.settings);
  applyTheme();
}

/* ============================================================
   FILTERING & SORTING
   ============================================================ */
function applyFilters(list) {
  const { q, category, priority, status } = State.filters;
  const query = q.trim().toLowerCase();

  let out = list.filter((t) => {
    if (category && t.category !== category) return false;
    if (priority && t.priority !== priority) return false;
    if (status) {
      const done = isCompletedOn(t, t.date);
      const skip = isSkippedOn(t, t.date);
      if (status === "completed" && !done) return false;
      if (status === "pending" && (done || skip)) return false;
      if (status === "skipped" && !skip) return false;
    }
    if (query) {
      const hay = [t.title, t.description, t.category, ...(t.tags || [])]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const sorters = {
    time: (a, b) =>
      (timeToMinutes(a.startTime) ?? 9999) -
      (timeToMinutes(b.startTime) ?? 9999),
    priority: (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    created: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
    status: (a, b) =>
      Number(isCompletedOn(a, a.date)) - Number(isCompletedOn(b, b.date)),
  };
  out.sort(sorters[State.sort] || sorters.time);

  // Always float overdue/pending above completed? No — keep stable, but
  // for "time" sort put completed last within same time bracket.
  return out;
}

/* ============================================================
   RENDERING — shared bits
   ============================================================ */
function categoryOf(id) {
  return (
    State.categories.find((c) => c.id === id) || {
      id,
      name: id || "Other",
      color: "#9AA0B4",
      icon: "◆",
    }
  );
}

function priorityPill(p) {
  const map = {
    high: ["pri-high", "High"],
    medium: ["pri-medium", "Medium"],
    low: ["pri-low", "Low"],
  };
  const [cls, label] = map[p] || map.medium;
  return `<span class="pill ${cls}">${label}</span>`;
}

function taskMetaHtml(t) {
  const cat = categoryOf(t.category);
  const bits = [];
  bits.push(
    `<span class="pill cat" style="color:${cat.color}">${escapeHtml(cat.icon)} ${escapeHtml(cat.name)}</span>`,
  );
  bits.push(priorityPill(t.priority));
  if (t.recurrence && t.recurrence !== "none") {
    const labels = {
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      yearly: "Yearly",
      weekdays: "Mon–Fri",
      custom: "Custom",
    };
    bits.push(
      `<span class="pill recur">↻ ${labels[t.recurrence] || t.recurrence}</span>`,
    );
  }
  for (const tag of (t.tags || []).slice(0, 4)) {
    bits.push(`<span class="pill tag">#${escapeHtml(tag)}</span>`);
  }
  return bits.join("");
}

/**
 * Render a single task row.
 * @param task  materialized task (has .date = the occurrence date)
 */
function taskRowHtml(t, opts = {}) {
  const dateStr = t.date;
  const done = isCompletedOn(t, dateStr);
  const skipped = isSkippedOn(t, dateStr);

  const now = new Date();
  const isToday = dateStr === todayStr();
  const startMin = timeToMinutes(t.startTime);
  const endMin = timeToMinutes(t.endTime);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let overdue = false,
    active = false;
  if (!done && !skipped && isToday) {
    if (endMin !== null && nowMin > endMin) overdue = true;
    else if (
      startMin !== null &&
      endMin !== null &&
      nowMin >= startMin &&
      nowMin <= endMin
    )
      active = true;
  } else if (!done && !skipped && parseDate(dateStr) < startOfDay(now)) {
    overdue = true;
  }

  const cls = [
    "task",
    done ? "is-completed" : "",
    skipped ? "is-skipped" : "",
    overdue ? "is-overdue" : "",
    active ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const timeLabel = t.startTime
    ? t.endTime
      ? `${fmtTime12(t.startTime)} – ${fmtTime12(t.endTime)}`
      : fmtTime12(t.startTime)
    : opts.showDate
      ? fmtShortDate(parseDate(dateStr))
      : "Any time";

  const checkTitle = done ? "Mark incomplete" : "Mark complete";

  return `
  <article class="${cls}" data-id="${t.id}" data-date="${dateStr}">
    <button class="checkbox" data-action="toggle" title="${checkTitle}" aria-label="${checkTitle}">
      <svg viewBox="0 0 24 24"><path d="${skipped ? "M6 12h12" : "M20 6L9 17l-5-5"}"/></svg>
    </button>
    <div class="task-main">
      <div class="task-top">
        <span class="task-time">${escapeHtml(timeLabel)}</span>
        <span class="task-title">${escapeHtml(t.title)}</span>
      </div>
      ${t.description ? `<p class="task-desc">${escapeHtml(t.description)}</p>` : ""}
      <div class="task-meta">
        ${opts.showDate && t.startTime ? `<span class="pill cat">${fmtShortDate(parseDate(dateStr))}</span>` : ""}
        ${taskMetaHtml(t)}
        ${skipped ? '<span class="pill status-skipped">Skipped</span>' : ""}
      </div>
    </div>
    <div class="task-actions">
      ${active ? `<button data-action="focus" title="Focus mode">◎</button>` : ""}
      <button data-action="skip" title="${skipped ? "Unskip" : "Skip"}">⊘</button>
      <button data-action="dup" title="Duplicate">⧉</button>
      <button data-action="edit" title="Edit">✎</button>
      <button class="del" data-action="del" title="Delete">🗑</button>
    </div>
  </article>`;
}

function emptyState(emoji, title, text) {
  return `<div class="empty"><div class="emoji">${emoji}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
}

/* ============================================================
   VIEW: TODAY
   ============================================================ */
function renderToday(root) {
  const t = todayStr();
  const d = new Date();

  const all = tasksInRange(
    startOfDay(addDays(d, -30)),
    startOfDay(addDays(d, 30)),
  );

  // Split: today's + overdue
  const overdue = all.filter((x) => {
    if (x.date >= t) return false;
    return !isDone(x, x.date);
  });

  const today = all.filter((x) => x.date === t);

  const todayPending = applyFilters(today.filter((x) => !isDone(x, x.date)));
  const todayDone = applyFilters(today.filter((x) => isDone(x, x.date)));
  const overdueList = applyFilters(overdue);

  const s = dayStats(t);

  let html = "";

  if (overdueList.length) {
    html += `
    <div class="section-head">
      <h2>⚠ Overdue</h2><span class="count">${overdueList.length}</span>
      <div class="spacer"></div>
      <button class="ghost-btn" id="rescheduleAll">Move all to today</button>
    </div>
    <div class="task-list">${overdueList.map((x) => taskRowHtml(x, { showDate: true })).join("")}</div>`;
  }

  html += `
  <div class="section-head">
    <h2>Today's Tasks</h2><span class="count">${todayPending.length}</span>
  </div>`;

  if (!todayPending.length) {
    html += emptyState(
      s.total && s.done === s.total ? "🎉" : "☀️",
      s.total && s.done === s.total
        ? "All done for today!"
        : "Nothing scheduled",
      s.total && s.done === s.total
        ? `You completed ${s.done} task${s.done === 1 ? "" : "s"}. Enjoy the rest of your day.`
        : "Add a task with the button above, or use quick add.",
    );
  } else {
    html += `<div class="task-list">${todayPending.map((x) => taskRowHtml(x)).join("")}</div>`;
  }

  if (todayDone.length) {
    html += `
    <div class="section-head" style="margin-top:14px">
      <h2>Completed</h2><span class="count">${todayDone.length}</span>
      <div class="spacer"></div>
      <button class="ghost-btn" id="collapseDone">Hide</button>
    </div>
    <div class="task-list" id="doneList">${todayDone.map((x) => taskRowHtml(x)).join("")}</div>`;
  }

  // Tomorrow preview
  const tomorrowStr = toDateStr(addDays(d, 1));
  const tomorrow = applyFilters(
    tasksInRange(addDays(d, 1), addDays(d, 1)).filter(
      (x) => !isDone(x, x.date),
    ),
  );
  if (tomorrow.length) {
    html += `
    <div class="section-head" style="margin-top:16px">
      <h2>Tomorrow</h2><span class="count">${tomorrow.length}</span>
    </div>
    <div class="task-list">${tomorrow
      .slice(0, 4)
      .map((x) => taskRowHtml(x, { showDate: true }))
      .join("")}</div>`;
  }

  root.innerHTML = html;

  // bind extras
  $("#collapseDone", root)?.addEventListener("click", (e) => {
    const list = $("#doneList", root);
    const hidden = (list.hidden = !list.hidden);
    e.target.textContent = hidden ? "Show" : "Hide";
  });

  $("#rescheduleAll", root)?.addEventListener("click", () => {
    const before = JSON.parse(JSON.stringify(State.tasks));
    const ids = overdueList.map((x) => x.id);
    for (const id of new Set(ids)) {
      const task = findTask(id);
      if (task) {
        task.date = t;
        task.updatedAt = new Date().toISOString();
      }
    }
    pushHistory({ type: "bulk-update", before, after: snapshot(State.tasks) });
    saveTasks();
    render();
    toast(
      `Moved ${overdueList.length} overdue task(s) to today.`,
      "Undo",
      4500,
      () => {
        State.tasks = before;
        saveTasks();
        render();
      },
    );
  });
}

/* ============================================================
   VIEW: WEEK
   ============================================================ */
function renderWeek(root) {
  const ws = weekStart(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const t = todayStr();

  const all = tasksInRange(ws, addDays(ws, 6));
  const filtered = applyFilters(all);

  const byDay = new Map();
  for (const d of days) byDay.set(toDateStr(d), []);
  for (const x of filtered) byDay.get(x.date)?.push(x);

  const html = `
  <div class="section-head">
    <h2>${fmtShortDate(ws)} – ${fmtShortDate(addDays(ws, 6))}</h2>
    <div class="spacer"></div>
    <span class="muted" style="font-size:12px;font-weight:600">${filtered.length} task${filtered.length === 1 ? "" : "s"} this week</span>
  </div>
  <div class="week-grid">
    ${days
      .map((d) => {
        const ds = toDateStr(d);
        const list = byDay.get(ds) || [];
        list.sort(
          (a, b) =>
            (timeToMinutes(a.startTime) ?? 9999) -
            (timeToMinutes(b.startTime) ?? 9999),
        );
        const isToday = ds === t;
        return `
      <div class="week-col ${isToday ? "today" : ""}" data-date="${ds}">
        <div class="week-col-head">
          <span class="dow">${DAY_NAMES[d.getDay()].slice(0, 3)}</span>
          <span class="dom">${d.getDate()}</span>
        </div>
        ${
          list.length
            ? list
                .map((x) => {
                  const cat = categoryOf(x.category);
                  const done = isDone(x, ds);
                  return `
          <div class="week-mini ${done ? "done" : ""}" data-id="${x.id}" data-date="${ds}" title="${escapeHtml(x.title)}">
            <span class="dot" style="background:${cat.color}"></span>
            <span class="t">
              <span class="tt">${escapeHtml(x.title)}</span>
              <span class="ts">${x.startTime ? fmtTime12(x.startTime) : ""}</span>
            </span>
          </div>`;
                })
                .join("")
            : '<div class="week-empty">—</div>'
        }
      </div>`;
      })
      .join("")}
  </div>`;

  root.innerHTML = html;

  root.querySelectorAll(".week-mini").forEach((el) => {
    el.addEventListener("click", () =>
      openTaskModal(el.dataset.id, el.dataset.date),
    );
  });
}

/* ============================================================
   VIEW: MONTH
   ============================================================ */
function renderMonth(root) {
  const base = State.calMonth;
  const year = base.getFullYear();
  const month = base.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);

  const all = applyFilters(tasksInRange(gridStart, gridEnd));

  const byDay = new Map();
  for (const x of all) {
    if (!byDay.has(x.date)) byDay.set(x.date, []);
    byDay.get(x.date).push(x);
  }

  const t = todayStr();
  const monthStats = rangeStats(first, last);

  let cells = "";
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const ds = toDateStr(cursor);
    const inMonth = cursor.getMonth() === month;
    const list = byDay.get(ds) || [];
    const doneCount = list.filter((x) => isDone(x, ds)).length;
    const pendingCount = list.length - doneCount;

    const dots = list
      .slice(0, 6)
      .map((x) => {
        const cat = categoryOf(x.category);
        return `<span class="d" style="background:${isDone(x, ds) ? "var(--border)" : cat.color}"></span>`;
      })
      .join("");

    cells += `
    <div class="cal-cell ${inMonth ? "" : "out"} ${ds === t ? "today" : ""}" data-date="${ds}">
      <div class="cal-cell-head">
        <span class="cal-dom">${cursor.getDate()}</span>
        ${list.length ? `<span class="cal-badge ${pendingCount ? "has-pending" : ""}">${doneCount}/${list.length}</span>` : ""}
      </div>
      <div class="cal-dots">${dots}${list.length > 6 ? `<span class="cal-more">+${list.length - 6}</span>` : ""}</div>
    </div>`;

    cursor.setDate(cursor.getDate() + 1);
  }

  root.innerHTML = `
  <div class="cal-head">
    <button class="icon-btn" id="calPrev">‹</button>
    <h2>${MONTH_NAMES[month]} ${year}</h2>
    <button class="icon-btn" id="calNext">›</button>
    <button class="ghost-btn" id="calToday">Today</button>
    <div class="spacer"></div>
    <span class="muted" style="font-size:12px;font-weight:600">
      ${monthStats.done}/${monthStats.total} completed · ${monthStats.pct}%
    </span>
  </div>
  <div class="cal-grid">
    ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
    ${cells}
  </div>`;

  $("#calPrev").onclick = () => {
    State.calMonth = addMonths(State.calMonth, -1);
    render();
  };
  $("#calNext").onclick = () => {
    State.calMonth = addMonths(State.calMonth, 1);
    render();
  };
  $("#calToday").onclick = () => {
    State.calMonth = new Date();
    render();
  };

  root.querySelectorAll(".cal-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dateStr = cell.dataset.date;
      State.view = "today";
      // Jump to that date's tasks via a lightweight day-detail
      openDayDetail(dateStr);
    });
  });
}

/** Simple day detail overlay reusing the today list style. */
function openDayDetail(dateStr) {
  const d = parseDate(dateStr);
  const list = applyFilters(tasksInRange(d, d));
  const root = $("#viewRoot");

  const prevView = State.view;
  const restore = () => {
    State.view = prevView;
    render();
  };

  root.innerHTML = `
  <div class="section-head">
    <button class="icon-btn" id="backFromDay">‹</button>
    <h2>${fmtLongDate(d)}</h2>
    <div class="spacer"></div>
    <button class="ghost-btn" id="addOnDay">＋ Add</button>
  </div>
  ${
    list.length
      ? `<div class="task-list">${list.map((x) => taskRowHtml(x)).join("")}</div>`
      : emptyState("🗓️", "Nothing on this day", "Add a task to get started.")
  }`;

  $("#backFromDay").onclick = restore;
  $("#addOnDay").onclick = () => openTaskModal(null, dateStr);
  bindTaskList(root);
}

/* ============================================================
   VIEW: YEAR
   ============================================================ */
function renderYear(root) {
  const year = new Date().getFullYear();
  const months = [];

  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    const stats = rangeStats(start, end);
    months.push({ m, start, end, ...stats });
  }

  const yearStats = rangeStats(new Date(year, 0, 1), new Date(year, 11, 31));
  const streaks = computeStreaks();

  // Heatmap: last 365 days
  const heatDays = [];
  const heatStart = addDays(startOfDay(new Date()), -364);
  for (let i = 0; i < 365; i++) {
    const d = addDays(heatStart, i);
    const ds = toDateStr(d);
    const s = dayStats(ds);
    heatDays.push({ ds, count: s.done, pct: s.pct, total: s.total });
  }
  const maxHeat = Math.max(1, ...heatDays.map((h) => h.count));

  root.innerHTML = `
  <div class="section-head">
    <h2>${year} Overview</h2>
    <div class="spacer"></div>
    <span class="muted" style="font-size:12px;font-weight:600">
      ${yearStats.done} completed · ${yearStats.pct}% overall
    </span>
  </div>

  <div class="year-grid">
    ${months
      .map(
        (mo) => `
      <div class="year-card ${mo.m === new Date().getMonth() ? "now" : ""}" data-month="${mo.m}">
        <div class="yc-head">
          <strong>${MONTH_NAMES[mo.m]}</strong>
          <span>${mo.total ? mo.pct + "%" : "—"}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${mo.pct}%"></div></div>
        <div class="yc-foot">
          <span>${mo.done}/${mo.total} done</span>
          <span>${mo.pending} left</span>
        </div>
      </div>`,
      )
      .join("")}
  </div>

  <div class="panel" style="margin-top:6px">
    <div class="panel-head">
      <h3>Activity heatmap</h3>
      <span class="muted">Last 365 days · ${streaks.current}-day streak 🔥</span>
    </div>
    <div class="heatmap" id="heatmap">
      ${heatDays
        .map((h) => {
          const intensity = h.count ? 0.2 + (h.count / maxHeat) * 0.8 : 0;
          const bg = h.count
            ? `rgba(91,108,255,${intensity.toFixed(2)})`
            : "var(--bg-sunken)";
          return `<div class="hm-cell" style="background:${bg}" title="${h.ds} · ${h.count} completed"></div>`;
        })
        .join("")}
    </div>
  </div>`;

  root.querySelectorAll(".year-card").forEach((card) => {
    card.addEventListener("click", () => {
      State.calMonth = new Date(year, +card.dataset.month, 1);
      State.view = "month";
      render();
    });
  });
}

/* ============================================================
   VIEW: DASHBOARD
   ============================================================ */
function renderDashboard() {
  const dash = $("#dashRoot");
  dash.hidden = false;

  const today = todayStr();
  const now = new Date();
  const ws = weekStart(now);
  const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  const me = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const ys = new Date(now.getFullYear(), 0, 1);
  const ye = new Date(now.getFullYear(), 11, 31);

  const tStats = dayStats(today);
  const wStats = rangeStats(ws, addDays(ws, 6));
  const mStats = rangeStats(ms, me);
  const yStats = rangeStats(ys, ye);
  const allTime = allTimeStats();
  const streaks = computeStreaks();
  const cats = categoryBreakdown(addDays(now, -30), now);

  const badges = [
    { id: "first", ico: "🌱", name: "First Step", earned: allTime.done >= 1 },
    { id: "ten", ico: "🔟", name: "10 Done", earned: allTime.done >= 10 },
    { id: "fifty", ico: "⭐", name: "50 Done", earned: allTime.done >= 50 },
    { id: "hundred", ico: "💯", name: "100 Done", earned: allTime.done >= 100 },
    {
      id: "streak3",
      ico: "🔥",
      name: "3-Day Streak",
      earned: streaks.longest >= 3,
    },
    {
      id: "streak7",
      ico: "🚀",
      name: "7-Day Streak",
      earned: streaks.longest >= 7,
    },
    {
      id: "streak30",
      ico: "👑",
      name: "30-Day Streak",
      earned: streaks.longest >= 30,
    },
    {
      id: "perfect",
      ico: "🎯",
      name: "Perfect Day",
      earned: tStats.total > 0 && tStats.pct === 100,
    },
  ];

  dash.innerHTML = `
  <div class="dash-grid">
    <div class="panel span2">
      <div class="panel-head">
        <h3>Progress rings</h3>
        <span class="muted">Today · Week · Month · Year</span>
      </div>
      <div class="progress-rings">
        ${[
          {
            label: "Today",
            pct: tStats.pct,
            sub: `${tStats.done}/${tStats.total}`,
          },
          {
            label: "Week",
            pct: wStats.pct,
            sub: `${wStats.done}/${wStats.total}`,
          },
          {
            label: "Month",
            pct: mStats.pct,
            sub: `${mStats.done}/${mStats.total}`,
          },
          {
            label: "Year",
            pct: yStats.pct,
            sub: `${yStats.done}/${yStats.total}`,
          },
        ]
          .map(
            (r, i) => `
          <div class="progress-ring">
            <div class="ring">
              <svg viewBox="0 0 36 36">
                <circle class="ring-bg" cx="18" cy="18" r="15.9"/>
                <circle class="ring-fg" cx="18" cy="18" r="15.9"
                  stroke-dasharray="${r.pct} 100" stroke-dashoffset="0"/>
              </svg>
            </div>
            <span class="pr-val">${r.pct}%</span>
            <span class="pr-label">${r.label}</span>
            <span class="muted" style="font-size:11px;font-weight:600">${r.sub}</span>
          </div>`,
          )
          .join("")}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Daily completion</h3><span class="muted">Last 14 days</span></div>
      <div class="chart-wrap"><canvas id="chartDaily"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Category breakdown</h3><span class="muted">Last 30 days</span></div>
      <div class="chart-wrap"><canvas id="chartCategory"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Weekly progress</h3><span class="muted">Last 8 weeks</span></div>
      <div class="chart-wrap"><canvas id="chartWeekly"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Productivity trend</h3><span class="muted">Completion %</span></div>
      <div class="chart-wrap"><canvas id="chartTrend"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Category detail</h3><span class="muted">Completion rate</span></div>
      <div class="trend-list">
        ${
          cats.length
            ? cats
                .map((c) => {
                  const pct = c.total
                    ? Math.round((c.done / c.total) * 100)
                    : 0;
                  return `
          <div class="trend-row">
            <span class="tr-name" title="${escapeHtml(c.name)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.color}"></div></div>
            <span class="tr-val">${pct}%</span>
          </div>`;
                })
                .join("")
            : '<p class="muted" style="font-size:12.5px">No data yet.</p>'
        }
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Achievements</h3><span class="muted">${badges.filter((b) => b.earned).length}/${badges.length}</span></div>
      <div class="badge-grid">
        ${badges
          .map(
            (b) => `
          <div class="badge ${b.earned ? "earned" : ""}">
            <span class="b-ico">${b.ico}</span>
            <span class="b-name">${b.name}</span>
          </div>`,
          )
          .join("")}
      </div>
    </div>
  </div>`;

  setTimeout(renderCharts, 0);
}

/* -------------------- Chart rendering -------------------- */
function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function destroyCharts() {
  Object.values(State.charts).forEach((c) => {
    try {
      c.destroy();
    } catch {}
  });
  State.charts = {};
}

function renderCharts() {
  if (typeof Chart === "undefined") return;
  destroyCharts();

  const text = cssVar("--text-soft") || "#5A5F73";
  const grid = cssVar("--border") || "#E6E8F0";
  const accent = cssVar("--accent") || "#5B6CFF";

  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = text;

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: text } },
      y: {
        beginAtZero: true,
        grid: { color: grid },
        ticks: { color: text, maxTicksLimit: 5 },
      },
    },
  };

  // ---- Daily (14d) ----
  const dailyEl = $("#chartDaily");
  if (dailyEl) {
    const labels = [],
      done = [],
      pct = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const ds = toDateStr(d);
      const s = dayStats(ds);
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      done.push(s.done);
      pct.push(s.pct);
    }
    State.charts.daily = new Chart(dailyEl, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: done,
            borderColor: accent,
            backgroundColor: accent + "22",
            fill: true,
            tension: 0.38,
            pointRadius: 3,
            pointBackgroundColor: accent,
            borderWidth: 2,
          },
        ],
      },
      options: { ...baseOpts },
    });
  }

  // ---- Category doughnut ----
  const catEl = $("#chartCategory");
  if (catEl) {
    const now = new Date();
    const cats = categoryBreakdown(addDays(now, -30), now);
    State.charts.category = new Chart(catEl, {
      type: "doughnut",
      data: {
        labels: cats.length ? cats.map((c) => c.name) : ["No data"],
        datasets: [
          {
            data: cats.length ? cats.map((c) => c.done) : [1],
            backgroundColor: cats.length ? cats.map((c) => c.color) : [grid],
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            display: cats.length > 0,
            position: "bottom",
            labels: {
              boxWidth: 9,
              boxHeight: 9,
              padding: 12,
              usePointStyle: true,
              font: { size: 11 },
            },
          },
        },
      },
    });
  }

  // ---- Weekly bars (8 weeks) ----
  const weeklyEl = $("#chartWeekly");
  if (weeklyEl) {
    const labels = [],
      done = [],
      total = [];
    for (let i = 7; i >= 0; i--) {
      const ws = addDays(weekStart(new Date()), -7 * i);
      const we = addDays(ws, 6);
      const s = rangeStats(ws, we);
      labels.push(`${ws.getDate()}/${ws.getMonth() + 1}`);
      done.push(s.done);
      total.push(s.total);
    }
    State.charts.weekly = new Chart(weeklyEl, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Completed",
            data: done,
            backgroundColor: accent,
            borderRadius: 6,
            barPercentage: 0.7,
          },
          {
            label: "Total",
            data: total,
            backgroundColor: grid,
            borderRadius: 6,
            barPercentage: 0.7,
          },
        ],
      },
      options: {
        ...baseOpts,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              boxWidth: 9,
              boxHeight: 9,
              usePointStyle: true,
              font: { size: 11 },
            },
          },
        },
      },
    });
  }

  // ---- Trend line (30d completion %) ----
  const trendEl = $("#chartTrend");
  if (trendEl) {
    const labels = [],
      pct = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const s = dayStats(toDateStr(d));
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
      pct.push(s.pct);
    }
    const grad = trendEl.getContext("2d").createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, "rgba(138,92,246,.35)");
    grad.addColorStop(1, "rgba(138,92,246,0)");

    State.charts.trend = new Chart(trendEl, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: pct,
            borderColor: cssVar("--violet") || "#8A5CF6",
            backgroundColor: grad,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        ...baseOpts,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: text, maxTicksLimit: 6 },
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: grid },
            ticks: { color: text, callback: (v) => v + "%" },
          },
        },
      },
    });
  }
}

/* ============================================================
   VIEW: CATEGORIES
   ============================================================ */
function renderCategories() {
  const root = $("#catRoot");
  root.hidden = false;

  const counts = new Map();
  for (const t of State.tasks)
    counts.set(t.category, (counts.get(t.category) || 0) + 1);

  root.innerHTML = `
  <div class="section-head">
    <h2>Categories</h2>
    <span class="count">${State.categories.length}</span>
    <div class="spacer"></div>
    <button class="primary-btn" id="addCatBtn">＋ New category</button>
  </div>
  <div class="cat-grid">
    ${State.categories
      .map(
        (c) => `
      <div class="cat-card" data-id="${c.id}">
        <div class="cat-dot" style="background:${c.color}">${escapeHtml(c.icon)}</div>
        <div class="cat-info">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${counts.get(c.id) || 0} task${(counts.get(c.id) || 0) === 1 ? "" : "s"}</span>
        </div>
        <div class="cat-actions">
          <button data-act="edit" title="Edit">✎</button>
          <button data-act="del" title="Delete">🗑</button>
        </div>
      </div>`,
      )
      .join("")}
  </div>`;

  $("#addCatBtn").onclick = () => openCatModal();

  root.querySelectorAll(".cat-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "edit") openCatModal(card.dataset.id);
      else if (act === "del") deleteCategory(card.dataset.id);
      else {
        State.view = "today";
        State.filters.category = card.dataset.id;
        syncFilterUI();
        render();
      }
    });
  });
}

function openCatModal(id) {
  const modal = $("#catModal");
  const form = $("#catForm");
  form.reset();
  $("#catDeleteBtn").hidden = true;

  if (id) {
    const c = State.categories.find((x) => x.id === id);
    if (!c) return;
    $("#catModalTitle").textContent = "Edit Category";
    $("#c_id").value = c.id;
    $("#c_name").value = c.name;
    $("#c_color").value = c.color;
    $("#c_icon").value = c.icon;
    $("#catDeleteBtn").hidden = false;
  } else {
    $("#catModalTitle").textContent = "New Category";
    $("#c_id").value = "";
    $("#c_color").value =
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    $("#c_icon").value = "◆";
  }
  modal.hidden = false;
  setTimeout(() => $("#c_name").focus(), 60);
}

function deleteCategory(id) {
  const used = State.tasks.filter((t) => t.category === id).length;
  const cat = State.categories.find((c) => c.id === id);
  if (
    !confirm(
      `Delete category "${cat?.name}"?${used ? `\n\n${used} task(s) will be moved to "Other".` : ""}`,
    )
  )
    return;

  const before = JSON.parse(JSON.stringify(State.categories));
  State.categories = State.categories.filter((c) => c.id !== id);
  State.tasks.forEach((t) => {
    if (t.category === id) t.category = "other";
  });

  Storage.saveCategories(State.categories);
  saveTasks();
  pushHistory({
    type: "cat-delete",
    before,
    after: snapshot(State.categories),
  });
  refreshCategorySelects();
  render();
  toast("Category deleted.", "Undo", 4500, () => {
    State.categories = before;
    Storage.saveCategories(State.categories);
    refreshCategorySelects();
    render();
  });
}

/* ============================================================
   TASK MODAL
   ============================================================ */
function refreshCategorySelects() {
  const opts = State.categories
    .map(
      (c) =>
        `<option value="${c.id}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`,
    )
    .join("");
  $("#f_category").innerHTML = opts;
  $("#filterCategory").innerHTML =
    `<option value="">All categories</option>${opts}`;
}

function openTaskModal(id, dateStr) {
  const modal = $("#taskModal");
  const form = $("#taskForm");
  form.reset();
  State.editingId = id || null;

  $("#deleteBtn").hidden = !id;
  $("#dupBtn").hidden = !id;
  $("#modalTitle").textContent = id ? "Edit Task" : "New Task";

  if (id) {
    const t = findTask(id);
    if (!t) return;
    $("#f_id").value = t.id;
    $("#f_title").value = t.title;
    $("#f_desc").value = t.description;
    $("#f_date").value = dateStr || t.date;
    $("#f_start").value = t.startTime || "";
    $("#f_end").value = t.endTime || "";
    $("#f_category").value = t.category;
    $("#f_priority").value = t.priority;
    $("#f_recurrence").value = t.recurrence || "none";
    $("#f_tags").value = (t.tags || []).join(", ");
    $("#f_reminder").checked = !!t.reminder;
    $("#f_remindMinutes").value = t.remindMinutes ?? 10;
    $$("#dayChips input").forEach((cb) => {
      cb.checked = (t.recurrenceDays || []).includes(+cb.value);
    });
  } else {
    $("#f_id").value = "";
    $("#f_date").value = dateStr || todayStr();
    $("#f_priority").value = "medium";
    $("#f_recurrence").value = "none";
    $$("#dayChips input").forEach((cb) => {
      cb.checked = false;
    });
    // default category = last used or personal
    $("#f_category").value = State.tasks.at(-1)?.category || "personal";
  }

  syncRecurrenceUI();
  modal.hidden = false;
  setTimeout(() => $("#f_title").focus(), 60);
}

function closeTaskModal() {
  $("#taskModal").hidden = true;
  State.editingId = null;
}

function syncRecurrenceUI() {
  const rec = $("#f_recurrence").value;
  $("#customDaysWrap").hidden = rec !== "custom";
  const hasReminder = $("#f_reminder").checked;
  $("#remindMinutesWrap").hidden = !hasReminder;
  // monthly/yearly recurrence can't have custom days
}

function collectForm() {
  return {
    title: $("#f_title").value.trim(),
    description: $("#f_desc").value.trim(),
    date: $("#f_date").value || todayStr(),
    startTime: $("#f_start").value,
    endTime: $("#f_end").value,
    category: $("#f_category").value,
    priority: $("#f_priority").value,
    recurrence: $("#f_recurrence").value,
    recurrenceDays: $$("#dayChips input:checked").map((cb) => +cb.value),
    tags: $("#f_tags")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    reminder: $("#f_reminder").checked,
    remindMinutes: clamp(
      parseInt($("#f_remindMinutes").value, 10) || 10,
      0,
      1440,
    ),
  };
}

function saveTaskFromForm(e) {
  e.preventDefault();
  const data = collectForm();
  if (!data.title) {
    toast("Please enter a title.");
    return;
  }

  if (State.editingId) {
    const t = findTask(State.editingId);
    if (!t) return;
    const before = snapshot(t);
    Object.assign(t, data, { updatedAt: new Date().toISOString() });
    pushHistory({ type: "update", before, after: snapshot(t) });
    saveTasks();
    closeTaskModal();
    render();
    toast("Task updated.");
  } else {
    const t = createTask(data);
    State.tasks.push(t);
    pushHistory({ type: "create", task: snapshot(t) });
    saveTasks();
    closeTaskModal();
    render();
    toastUndo("Task created.");
  }
  scheduleAllReminders();
}

function deleteTask(id) {
  const t = findTask(id);
  if (!t) return;
  if (!confirm(`Delete "${t.title}"?\n\nThis can be undone.`)) return;
  const idx = State.tasks.findIndex((x) => x.id === id);
  State.tasks.splice(idx, 1);
  pushHistory({ type: "delete", task: snapshot(t), index: idx });
  saveTasks();
  closeTaskModal();
  render();
  toastUndo("Task deleted.");
}

function duplicateTask(id) {
  const t = findTask(id);
  if (!t) return;
  const copy = createTask({
    ...snapshot(t),
    id: undefined,
    title: t.title + " (copy)",
  });
  State.tasks.push(copy);
  pushHistory({ type: "create", task: snapshot(copy) });
  saveTasks();
  closeTaskModal();
  render();
  toastUndo("Task duplicated.");
}

/* ============================================================
   EVENT BINDING — task list delegation
   ============================================================ */
function bindTaskList(root = document) {
  root.querySelectorAll(".task").forEach((el) => {
    if (el._bound) return;
    el._bound = true;

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      const id = el.dataset.id;
      const date = el.dataset.date;
      if (!btn) {
        if (e.target.closest(".checkbox")) return;
        openTaskModal(id, date);
        return;
      }
      const action = btn.dataset.action;
      if (action === "toggle") toggleComplete(id, date);
      else if (action === "skip") toggleSkip(id, date);
      else if (action === "edit") openTaskModal(id, date);
      else if (action === "del") deleteTask(id);
      else if (action === "dup") duplicateTask(id);
      else if (action === "focus") openFocus(id, date);
    });
  });
}

/* ============================================================
   FOCUS MODE
   ============================================================ */
let focusTimerHandle = null;

function openFocus(id, dateStr) {
  const t = findTask(id);
  if (!t) return;
  const overlay = $("#focusOverlay");
  overlay.hidden = false;
  $("#focusTitle").textContent = t.title;
  $("#focusMeta").textContent = [
    fmtTime12(t.startTime) + (t.endTime ? " – " + fmtTime12(t.endTime) : ""),
    categoryOf(t.category).name,
  ]
    .filter(Boolean)
    .join(" · ");

  const start = Date.now();
  const tick = () => {
    const secs = Math.floor((Date.now() - start) / 1000);
    $("#focusTimer").textContent =
      `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  };
  tick();
  clearInterval(focusTimerHandle);
  focusTimerHandle = setInterval(tick, 1000);

  $("#focusDone").onclick = () => {
    if (!isCompletedOn(findTask(id), dateStr)) toggleComplete(id, dateStr);
    exitFocus();
  };
  $("#focusExit").onclick = exitFocus;

  function exitFocus() {
    clearInterval(focusTimerHandle);
    overlay.hidden = true;
  }
}

/* ============================================================
   IMPORT (SheetJS)
   ============================================================ */
let pendingImportRows = null;

function openImportModal() {
  $("#importModal").hidden = false;
  $("#importFile").value = "";
  $("#importReport").innerHTML = "";
  $("#importConfirm").disabled = true;
  pendingImportRows = null;
}

function normalizeDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return toDateStr(value);
  if (typeof value === "number") {
    // Excel serial date
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return toDateStr(d);
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    y = y.length === 2 ? "20" + y : y;
    // assume D/M/Y if first <= 31 and second <= 12, else M/D/Y
    let day = +a,
      mon = +b;
    if (+a > 12 && +b <= 12) {
      day = +a;
      mon = +b;
    } else if (+b > 12 && +a <= 12) {
      day = +b;
      mon = +a;
    }
    return `${y}-${pad(mon)}-${pad(day)}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : toDateStr(d);
}

function normalizeTime(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const total = Math.round(value * 24 * 60);
    return minutesToTime(total % 1440);
  }
  if (value instanceof Date)
    return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${pad(+m[1])}:${m[2]}`;
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (m) {
    let h = +m[1] % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    return `${pad(h)}:${m[2] || "00"}`;
  }
  return "";
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      processImportRows(rows);
    } catch (err) {
      console.error(err);
      $("#importReport").innerHTML =
        `<div class="err">✕ Could not read file. Make sure it is a valid .xlsx or .csv.</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

function processImportRows(rows) {
  const valid = [],
    errors = [],
    warnings = [];
  const seenKeys = new Set();

  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const title = String(
      row.title || row.Title || row.name || row.Name || "",
    ).trim();
    if (!title) {
      errors.push(`Row ${line}: missing title — skipped.`);
      return;
    }

    const dateStr = normalizeDate(row.date || row.Date);
    if (!dateStr)
      warnings.push(`Row ${line}: missing/invalid date — defaulted to today.`);

    const startTime = normalizeTime(row.startTime || row.start || row.Start);
    const endTime = normalizeTime(row.endTime || row.end || row.End);

    let priority = String(row.priority || "medium").toLowerCase();
    if (!["high", "medium", "low"].includes(priority)) {
      priority = "medium";
    }

    let status = String(row.status || "pending").toLowerCase();
    if (!["pending", "completed", "skipped"].includes(status))
      status = "pending";

    let recurrence = String(row.recurrence || "none").toLowerCase();
    const recMap = {
      "one-time": "none",
      once: "none",
      none: "none",
      daily: "daily",
      weekly: "weekly",
      monthly: "monthly",
      yearly: "yearly",
    };
    recurrence = recMap[recurrence] || "none";

    let category = String(row.category || "").trim();
    if (category) {
      const found = State.categories.find(
        (c) =>
          c.name.toLowerCase() === category.toLowerCase() || c.id === category,
      );
      category = found ? found.id : "other";
    } else category = "other";

    const tags = String(row.tags || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const task = createTask({
      title,
      description: String(
        row.description || row.notes || row.Notes || "",
      ).trim(),
      date: dateStr || todayStr(),
      startTime,
      endTime,
      category,
      priority,
      status,
      recurrence,
      tags,
    });

    const dupKey = `${task.title}|${task.date}|${task.startTime}`;
    if (
      seenKeys.has(dupKey) ||
      State.tasks.some((t) => `${t.title}|${t.date}|${t.startTime}` === dupKey)
    ) {
      warnings.push(
        `Row ${line}: duplicate of an existing task — will be skipped by default.`,
      );
    }
    seenKeys.add(dupKey);

    if (status === "completed")
      task.completions[task.date] = new Date().toISOString();

    valid.push(task);
  });

  pendingImportRows = {
    valid,
    warnings,
    errors,
    dupKeyOf: (t) => `${t.title}|${t.date}|${t.startTime}`,
  };

  const report = $("#importReport");
  report.innerHTML = `
    <div class="ok">✓ ${valid.length} valid row(s) ready to import</div>
    ${
      errors.length
        ? `<div class="err">✕ ${errors.length} error(s):</div>` +
          errors
            .slice(0, 8)
            .map((e) => `<div class="err">${escapeHtml(e)}</div>`)
            .join("")
        : ""
    }
    ${
      warnings.length
        ? `<div class="warn">⚠ ${warnings.length} warning(s):</div>` +
          warnings
            .slice(0, 8)
            .map((w) => `<div class="warn">${escapeHtml(w)}</div>`)
            .join("")
        : ""
    }
    ${errors.length > 8 ? `<div class="muted">…and ${errors.length - 8} more errors.</div>` : ""}
  `;
  $("#importConfirm").disabled = valid.length === 0;
}

function confirmImport() {
  if (!pendingImportRows) return;
  const skipDup = $("#importSkipDup").checked;
  const { valid, dupKeyOf } = pendingImportRows;

  const existingKeys = new Set(
    State.tasks.map((t) => `${t.title}|${t.date}|${t.startTime}`),
  );
  let added = 0,
    skipped = 0;

  for (const t of valid) {
    if (skipDup && existingKeys.has(dupKeyOf(t))) {
      skipped++;
      continue;
    }
    State.tasks.push(t);
    existingKeys.add(dupKeyOf(t));
    added++;
  }

  pushHistory({
    type: "bulk-import",
    count: added,
    ids: State.tasks.slice(-added).map((t) => t.id),
  });
  saveTasks();
  $("#importModal").hidden = true;
  pendingImportRows = null;
  render();
  toast(
    `Imported ${added} task(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ""}.`,
    "Undo",
    5000,
    () => {
      State.tasks = State.tasks.slice(0, State.tasks.length - added);
      saveTasks();
      render();
    },
  );
}

/* ============================================================
   EXPORT (SheetJS)
   ============================================================ */
function taskToRow(t) {
  return {
    title: t.title,
    description: t.description,
    date: t.date,
    startTime: t.startTime,
    endTime: t.endTime,
    category: categoryOf(t.category).name,
    priority: t.priority,
    status: isCompletedOn(t, t.date)
      ? "completed"
      : isSkippedOn(t, t.date)
        ? "skipped"
        : t.status,
    recurrence: t.recurrence,
    tags: (t.tags || []).join(", "),
    completedAt: t.completions?.[t.date] || t.completedAt || "",
    createdAt: t.createdAt,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData(kind) {
  const stamp = new Date().toISOString().slice(0, 10);
  const all = State.tasks;

  if (kind === "backup-json") {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: State.tasks,
      categories: State.categories,
      settings: State.settings,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `routine-backup-${stamp}.json`,
    );
    toast("Backup downloaded.");
    return;
  }

  if (kind === "stats-xlsx") {
    const s = allTimeStats();
    const streaks = computeStreaks();
    const rows = [
      { metric: "Total tasks", value: s.total },
      { metric: "Completed", value: s.done },
      { metric: "Pending", value: s.pending },
      { metric: "Skipped", value: s.skipped },
      { metric: "Completion %", value: s.pct },
      { metric: "Current streak", value: streaks.current },
      { metric: "Longest streak", value: streaks.longest },
      { metric: "Active days", value: streaks.totalDays },
      { metric: "Export date", value: new Date().toLocaleString() },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statistics");
    XLSX.writeFile(wb, `routine-stats-${stamp}.xlsx`);
    toast("Statistics exported.");
    return;
  }

  let tasks = all;
  if (kind === "done-xlsx") tasks = all.filter((t) => isCompletedOn(t, t.date));
  if (kind === "pending-xlsx") tasks = all.filter((t) => !isDone(t, t.date));

  const rows = tasks.map(taskToRow);
  if (!rows.length) {
    toast("Nothing to export.");
    return;
  }

  if (kind === "all-csv") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      `routine-tasks-${stamp}.csv`,
    );
    toast("CSV exported.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 32 },
    { wch: 40 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  const name =
    kind === "done-xlsx"
      ? "completed"
      : kind === "pending-xlsx"
        ? "pending"
        : "tasks";
  XLSX.writeFile(wb, `routine-${name}-${stamp}.xlsx`);
  toast(`Exported ${tasks.length} task(s).`);
}

/* ============================================================
   NOTIFICATIONS / REMINDERS
   ============================================================ */
async function enableNotifications() {
  if (!("Notification" in window)) {
    toast("Notifications are not supported in this browser.");
    return;
  }
  if (Notification.permission === "granted") {
    State.settings.notifications = true;
    Storage.saveSettings(State.settings);
    toast("Reminders enabled.");
    scheduleAllReminders();
    return;
  }
  const result = await Notification.requestPermission();
  if (result === "granted") {
    State.settings.notifications = true;
    Storage.saveSettings(State.settings);
    toast("Reminders enabled 🔔");
    scheduleAllReminders();
  } else {
    toast("Notification permission denied.");
  }
}

const reminderTimers = new Map();

function scheduleAllReminders() {
  reminderTimers.forEach((h) => clearTimeout(h));
  reminderTimers.clear();
  if (!State.settings.notifications || Notification.permission !== "granted")
    return;

  const now = Date.now();
  const horizonEnd = startOfDay(addDays(new Date(), 2));

  for (const t of tasksInRange(startOfDay(new Date()), horizonEnd)) {
    if (!t.reminder || !t.startTime) continue;
    if (isDone(t, t.date)) continue;

    const d = parseDate(t.date);
    const startMin = timeToMinutes(t.startTime);
    if (startMin === null) continue;
    const fireAt = new Date(d);
    fireAt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    fireAt.setMinutes(fireAt.getMinutes() - (t.remindMinutes ?? 10));

    const delay = fireAt.getTime() - now;
    const key = t.id + "|" + t.date;
    if (delay < 0 || delay > 86400000 * 2) continue;
    if (State.notifiedIds.has(key)) continue;

    const handle = setTimeout(() => {
      try {
        new Notification("⏰ " + t.title, {
          body: `${fmtTime12(t.startTime)}${t.endTime ? " – " + fmtTime12(t.endTime) : ""}`,
          tag: key,
          silent: false,
        });
        State.notifiedIds.add(key);
      } catch (e) {
        console.warn(e);
      }
    }, delay);
    reminderTimers.set(key, handle);
  }
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function handleShortcuts(e) {
  const tag = (e.target.tagName || "").toLowerCase();
  const inField =
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    e.target.isContentEditable;

  // Ctrl/Cmd+Z — undo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) {
    e.preventDefault();
    undoLast();
    return;
  }

  // Esc — close modals / focus mode
  if (e.key === "Escape") {
    if (!$("#focusOverlay").hidden) {
      $("#focusOverlay").hidden = true;
      clearInterval(focusTimerHandle);
      return;
    }
    if (!$("#taskModal").hidden) {
      closeTaskModal();
      return;
    }
    if (!$("#catModal").hidden) {
      $("#catModal").hidden = true;
      return;
    }
    if (!$("#importModal").hidden) {
      $("#importModal").hidden = true;
      return;
    }
    if (!$("#exportModal").hidden) {
      $("#exportModal").hidden = true;
      return;
    }
  }

  if (inField) return;

  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    openTaskModal();
  } else if (e.key === "/") {
    e.preventDefault();
    $("#searchInput").focus();
  }
}

/* ============================================================
   CLOCK & TIME-AWARE UPDATES
   ============================================================ */
function updateClock() {
  const now = new Date();
  $("#clockTime").textContent = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const hour = now.getHours();
  const greet =
    hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const emoji = hour < 12 ? "👋" : hour < 18 ? "☀️" : "🌙";
  $("#greetText").textContent = `${greet} ${emoji}`;
  $("#greetDate").textContent = fmtLongDate(now);
}

function updateTz() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $("#clockTz").textContent = tz.replace(/_/g, " ");
  } catch {
    $("#clockTz").textContent = "";
  }
}

/** Every minute: refresh clock, re-evaluate "active"/"overdue", roll over the day. */
let lastDay = todayStr();

function tick() {
  updateClock();
  const nowDay = todayStr();

  // Day rollover — full re-render
  if (nowDay !== lastDay) {
    lastDay = nowDay;
    State.notifiedIds.clear();
    scheduleAllReminders();
    render();
    toast("🌅 A new day begins. Here is your fresh plan.");
    return;
  }

  // Light update: only re-render if we're not mid-edit
  const editing =
    !$("#taskModal").hidden ||
    !$("#catModal").hidden ||
    !$("#importModal").hidden ||
    !$("#exportModal").hidden ||
    !$("#focusOverlay").hidden;
  if (!editing) {
    // refresh only status classes to avoid losing scroll/input focus
    refreshTimeStates();
  }
  updateStatStrip();
}

/** Cheap pass that updates overdue/active classes without full re-render. */
function refreshTimeStates() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const t = todayStr();

  document.querySelectorAll(".task").forEach((el) => {
    const id = el.dataset.id;
    const date = el.dataset.date;
    const task = findTask(id);
    if (!task) return;
    const done = isCompletedOn(task, date) || isSkippedOn(task, date);
    const startMin = timeToMinutes(task.startTime);
    const endMin = timeToMinutes(task.endTime);

    let overdue = false,
      active = false;
    if (!done && date === t) {
      if (endMin !== null && nowMin > endMin) overdue = true;
      else if (
        startMin !== null &&
        endMin !== null &&
        nowMin >= startMin &&
        nowMin <= endMin
      )
        active = true;
    } else if (!done && parseDate(date) < startOfDay(now)) overdue = true;

    el.classList.toggle("is-overdue", overdue);
    el.classList.toggle("is-active", active);
  });
}

/* ============================================================
   STAT STRIP
   ============================================================ */
function updateStatStrip() {
  const strip = $("#statStrip");
  if (!strip) return;

  const t = todayStr();
  const s = dayStats(t);
  const streaks = computeStreaks();
  const allTime = allTimeStats();

  // overdue count
  let overdueCount = 0;
  const start = startOfDay(addDays(new Date(), -60));
  const end = startOfDay(addDays(new Date(), -1));
  for (const task of tasksInRange(start, end)) {
    if (!isDone(task, task.date)) overdueCount++;
  }

  const cards = [
    {
      label: "Completed today",
      value: `${s.done}`,
      sub: `of ${s.total} planned`,
      accent: true,
    },
    {
      label: "Remaining today",
      value: `${s.pending}`,
      sub: s.pending ? "Keep going" : "All clear ✨",
    },
    {
      label: "Today",
      value: `${s.pct}%`,
      sub: `Goal ${State.settings.dailyGoalPct}%`,
    },
    {
      label: "🔥 Streak",
      value: `${streaks.current}`,
      sub: `Longest ${streaks.longest} days`,
    },
    {
      label: "Overdue",
      value: `${overdueCount}`,
      sub: overdueCount ? "Needs attention" : "Nothing overdue",
    },
    {
      label: "All-time",
      value: `${allTime.pct}%`,
      sub: `${allTime.done} completed`,
    },
  ];

  strip.innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card ${c.accent ? "accent" : ""}">
      <span class="label">${c.label}</span>
      <span class="value">${c.value}</span>
      <span class="sub">${c.sub}</span>
    </div>`,
    )
    .join("");

  // Sidebar goal ring
  const pct = s.pct;
  const circumference = 2 * Math.PI * 15.9;
  const offset = circumference - (pct / 100) * circumference;
  const fg = $("#sideRingFg");
  if (fg) {
    fg.setAttribute("stroke-dasharray", `${circumference}`);
    fg.setAttribute("stroke-dashoffset", `${offset}`);
  }
  $("#sideGoalPct").textContent = `${pct}%`;
  $("#sideGoalText").textContent = s.total
    ? pct >= State.settings.dailyGoalPct
      ? `🎯 Goal reached! ${s.done}/${s.total} done.`
      : `${s.pending} task${s.pending === 1 ? "" : "s"} left to hit your goal.`
    : "No tasks planned for today.";
}

/* ============================================================
   MASTER RENDER
   ============================================================ */
function render() {
  // Toggle view visibility
  const isDash = State.view === "dashboard";
  const isCat = State.view === "categories";

  $("#viewRoot").hidden = isDash || isCat;
  $("#dashRoot").hidden = !isDash;
  $("#catRoot").hidden = !isCat;
  $("#statStrip").hidden = false;

  // Active nav state
  $$(".nav-item, .bn-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === State.view);
  });
  $$("#viewTabs .tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === State.view);
  });

  if (isDash) {
    renderDashboard();
  } else if (isCat) {
    renderCategories();
    $("#dashRoot").innerHTML = "";
    destroyCharts();
  } else {
    $("#dashRoot").innerHTML = "";
    destroyCharts();

    const root = $("#viewRoot");
    switch (State.view) {
      case "today":
        renderToday(root);
        break;
      case "week":
        renderWeek(root);
        break;
      case "month":
        renderMonth(root);
        break;
      case "year":
        renderYear(root);
        break;
      default:
        renderToday(root);
    }
    bindTaskList(root);
  }

  updateStatStrip();
  refreshCategorySelects();
  syncFilterUI();
}

function syncFilterUI() {
  $("#filterCategory").value = State.filters.category;
  $("#filterPriority").value = State.filters.priority;
  $("#filterStatus").value = State.filters.status;
  $("#sortBy").value = State.sort;
  const q = $("#searchInput");
  if (q.value !== State.filters.q) q.value = State.filters.q;
  $("#clearSearch").hidden = !State.filters.q;
}

/* ============================================================
   INIT
   ============================================================ */
function initData() {
  State.tasks = Storage.loadTasks();
  if (!Array.isArray(State.tasks)) State.tasks = [];

  // migrate / normalize tasks
  State.tasks = State.tasks.map((t) => ({
    completions: {},
    skips: {},
    recurrenceDays: [],
    tags: [],
    remindMinutes: 10,
    ...t,
  }));

  const storedCats = Storage.loadCategories();
  State.categories =
    Array.isArray(storedCats) && storedCats.length
      ? storedCats
      : DEFAULT_CATEGORIES.slice();
  if (!storedCats) Storage.saveCategories(State.categories);

  State.settings = Storage.loadSettings();
  State.history = Storage.loadHistory();

  // Seed demo tasks only on very first run
  const seeded = localStorage.getItem("rtm.seeded");
  if (!seeded && State.tasks.length === 0) {
    const t = todayStr();
    State.tasks = [
      createTask({
        title: "Morning Exercise",
        description: "30 min cardio + stretch",
        date: t,
        startTime: "06:00",
        endTime: "06:30",
        category: "exercise",
        priority: "medium",
        recurrence: "daily",
      }),
      createTask({
        title: "Study Session",
        description: "Algebra revision",
        date: t,
        startTime: "08:00",
        endTime: "09:30",
        category: "study",
        priority: "high",
        recurrence: "weekdays",
        tags: ["math"],
      }),
      createTask({
        title: "Project Work",
        description: "Finish dashboard module",
        date: t,
        startTime: "11:00",
        endTime: "13:00",
        category: "projects",
        priority: "high",
      }),
      createTask({
        title: "Revision",
        description: "Review notes",
        date: t,
        startTime: "18:00",
        endTime: "19:00",
        category: "study",
        priority: "medium",
        tags: ["exam"],
      }),
      createTask({
        title: "Weekly Review",
        date: toDateStr(addDays(new Date(), 2)),
        startTime: "17:00",
        category: "personal",
        priority: "low",
        recurrence: "weekly",
      }),
    ];
    saveTasks();
    localStorage.setItem("rtm.seeded", "1");
  }
}

function bindGlobalEvents() {
  // Nav
  $$(".nav-item, .bn-item, #viewTabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.view;
      if (!v) return;
      State.view = v;
      if (v !== "month" && v !== "year") State.calMonth = new Date();
      render();
      $("#sidebar").classList.remove("open");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Mobile menu
  $("#menuBtn").addEventListener("click", () =>
    $("#sidebar").classList.toggle("open"),
  );

  // Close sidebar when clicking outside (mobile)
  document.addEventListener("click", (e) => {
    const sb = $("#sidebar");
    if (
      window.innerWidth <= 860 &&
      sb.classList.contains("open") &&
      !sb.contains(e.target) &&
      !$("#menuBtn").contains(e.target)
    ) {
      sb.classList.remove("open");
    }
  });

  // Add task
  $("#addBtn").addEventListener("click", () => openTaskModal());
  $("#fabAdd").addEventListener("click", () => openTaskModal());

  // Task form
  $("#taskForm").addEventListener("submit", saveTaskFromForm);
  $("#modalClose").addEventListener("click", closeTaskModal);
  $("#cancelBtn").addEventListener("click", closeTaskModal);
  $("#deleteBtn").addEventListener(
    "click",
    () => State.editingId && deleteTask(State.editingId),
  );
  $("#dupBtn").addEventListener(
    "click",
    () => State.editingId && duplicateTask(State.editingId),
  );
  $("#f_recurrence").addEventListener("change", syncRecurrenceUI);
  $("#f_reminder").addEventListener("change", syncRecurrenceUI);

  $("#taskModal").addEventListener("click", (e) => {
    if (e.target === $("#taskModal")) closeTaskModal();
  });

  // Quick add
  $("#quickAddBtn").addEventListener("click", submitQuickAdd);
  $("#quickAdd").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuickAdd();
    }
  });

  // Search & filters
  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      State.filters.q = e.target.value;
      $("#clearSearch").hidden = !e.target.value;
      render();
    }, 160);
  });
  $("#clearSearch").addEventListener("click", () => {
    $("#searchInput").value = "";
    State.filters.q = "";
    $("#clearSearch").hidden = true;
    render();
  });
  $("#filterCategory").addEventListener("change", (e) => {
    State.filters.category = e.target.value;
    render();
  });
  $("#filterPriority").addEventListener("change", (e) => {
    State.filters.priority = e.target.value;
    render();
  });
  $("#filterStatus").addEventListener("change", (e) => {
    State.filters.status = e.target.value;
    render();
  });
  $("#sortBy").addEventListener("change", (e) => {
    State.sort = e.target.value;
    render();
  });

  // Theme
  $("#themeToggle").addEventListener("click", cycleTheme);
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (State.settings.theme === "auto") applyTheme();
    });

  // Categories modal
  $("#catForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#c_id").value;
    const name = $("#c_name").value.trim();
    if (!name) return;

    if (id) {
      const c = State.categories.find((x) => x.id === id);
      if (c) {
        c.name = name;
        c.color = $("#c_color").value;
        c.icon = $("#c_icon").value || "◆";
      }
    } else {
      const newId =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || uid();
      if (State.categories.some((c) => c.id === newId)) {
        toast("A category with that name already exists.");
        return;
      }
      State.categories.push({
        id: newId,
        name,
        color: $("#c_color").value,
        icon: $("#c_icon").value || "◆",
      });
    }
    Storage.saveCategories(State.categories);
    $("#catModal").hidden = true;
    refreshCategorySelects();
    render();
    toast("Category saved.");
  });
  $("#catModalClose").addEventListener(
    "click",
    () => ($("#catModal").hidden = true),
  );
  $("#catCancelBtn").addEventListener(
    "click",
    () => ($("#catModal").hidden = true),
  );
  $("#catDeleteBtn").addEventListener("click", () => {
    const id = $("#c_id").value;
    $("#catModal").hidden = true;
    deleteCategory(id);
  });
  $("#catModal").addEventListener("click", (e) => {
    if (e.target === $("#catModal")) $("#catModal").hidden = true;
  });

  // Import
  $("#importBtn").addEventListener("click", openImportModal);
  $("#importClose").addEventListener(
    "click",
    () => ($("#importModal").hidden = true),
  );
  $("#importCancel").addEventListener(
    "click",
    () => ($("#importModal").hidden = true),
  );
  $("#importModal").addEventListener("click", (e) => {
    if (e.target === $("#importModal")) $("#importModal").hidden = true;
  });
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (typeof XLSX === "undefined") {
      toast("Excel library not loaded. Check your connection.");
      return;
    }
    handleImportFile(f);
  });
  $("#importConfirm").addEventListener("click", confirmImport);

  // Export
  $("#exportBtn").addEventListener("click", () => {
    $("#exportModal").hidden = false;
  });
  $("#exportClose").addEventListener(
    "click",
    () => ($("#exportModal").hidden = true),
  );
  $("#exportCancel").addEventListener(
    "click",
    () => ($("#exportModal").hidden = true),
  );
  $("#exportModal").addEventListener("click", (e) => {
    if (e.target === $("#exportModal")) $("#exportModal").hidden = true;
  });
  $$(".export-card").forEach((card) => {
    card.addEventListener("click", () => {
      exportData(card.dataset.export);
      $("#exportModal").hidden = true;
    });
  });

  // Notifications
  $("#notifBtn").addEventListener("click", enableNotifications);

  // Keyboard
  document.addEventListener("keydown", handleShortcuts);

  // Persist before unload (safety net)
  window.addEventListener("beforeunload", () => {
    Storage.saveTasks(State.tasks);
    Storage.saveCategories(State.categories);
    Storage.saveSettings(State.settings);
  });

  // Cross-tab sync
  window.addEventListener("storage", (e) => {
    if (e.key === Storage.keys.tasks) {
      State.tasks = Storage.loadTasks() || [];
      render();
    }
  });
}

function submitQuickAdd() {
  const input = $("#quickAdd");
  const raw = input.value.trim();
  if (!raw) return;
  const parsed = parseQuickAdd(raw);
  const task = createTask(parsed);
  State.tasks.push(task);
  pushHistory({ type: "create", task: snapshot(task) });
  saveTasks();
  input.value = "";
  render();
  toastUndo(`Added "${task.title}"`);
  scheduleAllReminders();
}

/* ============================================================
   BOOT
   ============================================================ */
function boot() {
  initData();
  applyTheme();
  refreshCategorySelects();
  bindGlobalEvents();
  updateTz();
  updateClock();
  render();
  scheduleAllReminders();

  // clock tick every 15s; full evaluation every 60s
  setInterval(updateClock, 15000);
  setInterval(tick, 60000);

  // Expose a tiny console API for power users / debugging
  window.Routine = {
    export: exportData,
    state: () => ({ ...State }),
    reset() {
      if (!confirm("Erase ALL data? This cannot be undone.")) return;
      Object.values(Storage.keys).forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem("rtm.seeded");
      location.reload();
    },
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
