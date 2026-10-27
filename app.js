/**
 * app.js
 * Main Application Logic: Date Selector (2026-2040), Monday-Sunday Strip, & LocalStorage CRUD
 */

const STORAGE_KEY = "agenda_ko_data_v2";
const MIN_YEAR = 2026;
const MAX_YEAR = 2040;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS_MON_FIRST = [
  { short: "Mon", full: "Monday", jsDay: 1 },
  { short: "Tue", full: "Tuesday", jsDay: 2 },
  { short: "Wed", full: "Wednesday", jsDay: 3 },
  { short: "Thu", full: "Thursday", jsDay: 4 },
  { short: "Fri", full: "Friday", jsDay: 5 },
  { short: "Sat", full: "Saturday", jsDay: 6 },
  { short: "Sun", full: "Sunday", jsDay: 0 }
];

const AgendaApp = {
  selectedYear: 2026,
  selectedMonth: 0, // 0 = Jan
  selectedDay: 1,
  currentFilter: "all", // 'all' | 'pending' | 'done'
  allData: {}, // { "YYYY-MM-DD": [ { id, title, time, priority, done } ] }

  init() {
    this.loadFromStorage();

    // Set initial date to Today (clamped between 2026 and 2040)
    const now = new Date();
    const yr = Math.min(Math.max(now.getFullYear(), MIN_YEAR), MAX_YEAR);
    this.selectedYear = yr;
    this.selectedMonth = now.getMonth();
    this.selectedDay = now.getDate();

    this.cacheDOM();
    this.populateYearAndMonthDropdowns();
    this.bindEvents();
    this.syncUI();

    // Initialize Alarm Engine
    if (window.AlarmEngine) {
      window.AlarmEngine.init();
    }
  },

  cacheDOM() {
    this.selectMonth = document.getElementById("select-month");
    this.selectDay = document.getElementById("select-day");
    this.selectYear = document.getElementById("select-year");
    this.weekStrip = document.getElementById("week-strip");
    this.selectedDayName = document.getElementById("selected-day-name");
    this.selectedFullDate = document.getElementById("selected-full-date");
    this.progressBadge = document.getElementById("agenda-progress-badge");
    this.formAdd = document.getElementById("form-add-agenda");
    this.inputTitle = document.getElementById("input-agenda-title");
    this.inputTime = document.getElementById("input-agenda-time");
    this.inputPriority = document.getElementById("input-agenda-priority");
    this.listContainer = document.getElementById("agenda-list-container");
  },

  populateYearAndMonthDropdowns() {
    // Months
    this.selectMonth.innerHTML = MONTHS.map(
      (m, idx) => `<option value="${idx}">${m}</option>`
    ).join("");

    // Years (2026 to 2040)
    let yearOptions = "";
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
      yearOptions += `<option value="${y}">${y}</option>`;
    }
    this.selectYear.innerHTML = yearOptions;
  },

  populateDayDropdown() {
    const daysInMonth = new Date(this.selectedYear, this.selectedMonth + 1, 0).getDate();
    if (this.selectedDay > daysInMonth) {
      this.selectedDay = daysInMonth;
    }

    let dayOptions = "";
    for (let d = 1; d <= daysInMonth; d++) {
      dayOptions += `<option value="${d}">${d}</option>`;
    }
    this.selectDay.innerHTML = dayOptions;
    this.selectDay.value = this.selectedDay;
  },

  bindEvents() {
    this.selectMonth.addEventListener("change", (e) => {
      this.selectedMonth = parseInt(e.target.value, 10);
      this.syncUI();
    });

    this.selectDay.addEventListener("change", (e) => {
      this.selectedDay = parseInt(e.target.value, 10);
      this.syncUI();
    });

    this.selectYear.addEventListener("change", (e) => {
      this.selectedYear = parseInt(e.target.value, 10);
      this.syncUI();
    });

    document.getElementById("btn-jump-today").addEventListener("click", () => {
      const now = new Date();
      this.selectedYear = Math.min(Math.max(now.getFullYear(), MIN_YEAR), MAX_YEAR);
      this.selectedMonth = now.getMonth();
      this.selectedDay = now.getDate();
      this.syncUI();
    });

    // Add New Agenda Form Submit
    this.formAdd.addEventListener("submit", (e) => {
      e.preventDefault();
      // Unlock audio automatically when user interacts with form
      if (window.AlarmEngine && !window.AlarmEngine.soundEnabled) {
        window.AlarmEngine.unlockiOSAudio(false);
      }
      this.addAgenda();
    });

    // Filter Buttons
    document.getElementById("filter-all").addEventListener("click", () => this.setFilter("all"));
    document.getElementById("filter-pending").addEventListener("click", () => this.setFilter("pending"));
    document.getElementById("filter-done").addEventListener("click", () => this.setFilter("done"));
  },

  setFilter(filterType) {
    this.currentFilter = filterType;
    ["all", "pending", "done"].forEach((f) => {
      const btn = document.getElementById(`filter-${f}`);
      if (f === filterType) {
        btn.className = "text-[11px] px-2.5 py-1 rounded-lg font-bold bg-indigo-600 text-white";
      } else {
        btn.className = "text-[11px] px-2.5 py-1 rounded-lg font-bold bg-slate-800 text-slate-400";
      }
    });
    this.renderAgendas();
  },

  syncUI() {
    this.selectMonth.value = this.selectedMonth;
    this.selectYear.value = this.selectedYear;
    this.populateDayDropdown();

    const currentObj = new Date(this.selectedYear, this.selectedMonth, this.selectedDay);
    const dayName = currentObj.toLocaleDateString("en-US", { weekday: "long" });

    this.selectedDayName.textContent = dayName.toUpperCase();
    this.selectedFullDate.textContent = `${MONTHS[this.selectedMonth]} ${this.selectedDay}, ${this.selectedYear}`;

    this.renderWeekStrip(currentObj);
    this.renderAgendas();
  },

  /**
   * Renders the Monday - Sunday Selector Strip for the currently selected week
   */
  renderWeekStrip(selectedDateObj) {
    const jsDay = selectedDateObj.getDay(); // 0 (Sun) to 6 (Sat)
    const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
    const mondayDate = new Date(selectedDateObj);
    mondayDate.setDate(selectedDateObj.getDate() + diffToMonday);

    this.weekStrip.innerHTML = "";

    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(mondayDate);
      cellDate.setDate(mondayDate.getDate() + i);

      const cYear = cellDate.getFullYear();
      const cMonth = cellDate.getMonth();
      const cDay = cellDate.getDate();
      const dateKey = this.formatDateKey(cYear, cMonth, cDay);
      const dayAgendas = this.getAgendasForDate(dateKey);

      const isSelected =
        cYear === this.selectedYear &&
        cMonth === this.selectedMonth &&
        cDay === this.selectedDay;

      // Dot color indicator if date has agendas
      let dotHTML = "";
      if (dayAgendas.length > 0) {
        const allDone = dayAgendas.every((a) => a.done);
        const dotColor = allDone ? "bg-emerald-400" : "bg-amber-400";
        dotHTML = `<span class="w-1.5 h-1.5 rounded-full ${dotColor} mt-1"></span>`;
      } else {
        dotHTML = `<span class="w-1.5 h-1.5 mt-1"></span>`;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isSelected
        ? "flex flex-col items-center py-2 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg border border-indigo-400 transition"
        : "flex flex-col items-center py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition";

      btn.innerHTML = `
        <span class="text-[10px] uppercase opacity-80">${WEEKDAYS_MON_FIRST[i].short}</span>
        <span class="text-sm font-extrabold mt-0.5">${cDay}</span>
        ${dotHTML}
      `;

      btn.addEventListener("click", () => {
        if (cYear >= MIN_YEAR && cYear <= MAX_YEAR) {
          this.selectedYear = cYear;
          this.selectedMonth = cMonth;
          this.selectedDay = cDay;
          this.syncUI();
        }
      });

      this.weekStrip.appendChild(btn);
    }
  },

  formatDateKey(year, monthIndex, day) {
    const m = String(monthIndex + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  },

  getSelectedDateKey() {
    return this.formatDateKey(this.selectedYear, this.selectedMonth, this.selectedDay);
  },

  getAgendasForDate(dateKey) {
    return this.allData[dateKey] || [];
  },

  addAgenda() {
    const title = this.inputTitle.value.trim();
    const time = this.inputTime.value;
    const priority = this.inputPriority.value;

    if (!title) return;

    const dateKey = this.getSelectedDateKey();
    if (!this.allData[dateKey]) {
      this.allData[dateKey] = [];
    }

    this.allData[dateKey].push({
      id: "ag_" + Date.now(),
      title,
      time: time || "",
      priority,
      done: false
    });

    // Sort by time if time is set
    this.allData[dateKey].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

    this.saveToStorage();
    this.inputTitle.value = "";
    this.inputTime.value = "";
    this.inputPriority.value = "normal";
    this.syncUI();
  },

  toggleDone(agendaId) {
    const dateKey = this.getSelectedDateKey();
    const list = this.allData[dateKey] || [];
    const target = list.find((item) => item.id === agendaId);
    if (target) {
      target.done = !target.done;
      if (target.done && window.AlarmEngine && window.AlarmEngine.activeAgendaId === agendaId) {
        window.AlarmEngine.stopAlarm();
      }
      this.saveToStorage();
      this.syncUI();
    }
  },

  markAgendaDoneFromAlarm(agendaId) {
    Object.keys(this.allData).forEach((dateKey) => {
      const item = this.allData[dateKey].find((a) => a.id === agendaId);
      if (item) {
        item.done = true;
      }
    });
    this.saveToStorage();
    this.syncUI();
  },

  snoozeAgendaItem(agendaId, minutesToAdd = 5) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutesToAdd);
    const newHH = String(now.getHours()).padStart(2, "0");
    const newMM = String(now.getMinutes()).padStart(2, "0");
    const newTime = `${newHH}:${newMM}`;

    Object.keys(this.allData).forEach((dateKey) => {
      const item = this.allData[dateKey].find((a) => a.id === agendaId);
      if (item) {
        item.time = newTime;
      }
    });
    this.saveToStorage();
    this.syncUI();
  },

  deleteAgenda(agendaId) {
    const dateKey = this.getSelectedDateKey();
    if (!this.allData[dateKey]) return;
    this.allData[dateKey] = this.allData[dateKey].filter((item) => item.id !== agendaId);
    if (window.AlarmEngine && window.AlarmEngine.activeAgendaId === agendaId) {
      window.AlarmEngine.stopAlarm();
    }
    this.saveToStorage();
    this.syncUI();
  },

  renderAgendas() {
    const dateKey = this.getSelectedDateKey();
    const rawList = this.getAgendasForDate(dateKey);

    // Update Progress Badge
    const doneCount = rawList.filter((a) => a.done).length;
    this.progressBadge.textContent = `${doneCount} / ${rawList.length} Done`;

    // Apply Filter
    const filtered = rawList.filter((item) => {
      if (this.currentFilter === "pending") return !item.done;
      if (this.currentFilter === "done") return item.done;
      return true;
    });

    this.listContainer.innerHTML = "";

    if (filtered.length === 0) {
      this.listContainer.innerHTML = `
        <div class="text-center py-8 px-4 rounded-2xl bg-slate-900/50 border border-dashed border-slate-800">
          <p class="text-sm text-slate-400 font-semibold">Walay naka-lista nga agenda.</p>
          <p class="text-xs text-slate-500 mt-1">Pag-dugang og agenda sa ibabaw para niining adlawa!</p>
        </div>
      `;
      return;
    }

    filtered.forEach((item) => {
      const isThisItemRinging =
        window.AlarmEngine &&
        window.AlarmEngine.isRinging &&
        window.AlarmEngine.activeAgendaId === item.id;

      const priorityColors = {
        normal: "bg-slate-800 text-slate-300",
        important: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
        urgent: "bg-rose-500/20 text-rose-300 border border-rose-500/30"
      };

      const row = document.createElement("div");
      row.className = `flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition ${
        isThisItemRinging
          ? "alarm-box-active"
          : item.done
          ? "bg-slate-900/40 border-slate-800/60 opacity-60"
          : "bg-slate-900 border-slate-800"
      }`;

      // Left Checkbox + Details
      const leftDiv = document.createElement("div");
      leftDiv.className = "flex items-center gap-3 flex-1 cursor-pointer";
      leftDiv.addEventListener("click", () => this.toggleDone(item.id));

      const checkCircle = `
        <div class="w-6 h-6 rounded-lg flex items-center justify-center border-2 transition ${
          item.done
            ? "bg-emerald-500 border-emerald-500 text-slate-950 font-black"
            : "border-slate-600 bg-slate-950"
        }">
          ${item.done ? "✓" : ""}
        </div>
      `;

      const timeBadge = item.time
        ? `<span class="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
            isThisItemRinging
              ? "bg-amber-400 text-slate-950"
              : "bg-indigo-500/20 text-indigo-300"
          }">
            ⏰ ${window.AlarmEngine ? window.AlarmEngine.formatTime12Hour(item.time) : item.time}
          </span>`
        : "";

      leftDiv.innerHTML = `
        ${checkCircle}
        <div class="flex-1">
          <p class="text-sm font-bold ${item.done ? "line-through text-slate-500" : "text-white"}">
            ${this.escapeHTML(item.title)}
          </p>
          <div class="flex flex-wrap items-center gap-1.5 mt-1">
            ${timeBadge}
            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
              priorityColors[item.priority] || priorityColors.normal
            }">
              ${item.priority}
            </span>
          </div>
        </div>
      `;

      // Right Side: Per-Item Bell Icon + Delete Button
      const rightDiv = document.createElement("div");
      rightDiv.className = "flex items-center gap-2";

      if (item.time) {
        const bellIndicator = document.createElement("div");
        bellIndicator.className = `w-9 h-9 rounded-xl flex items-center justify-center border ${
          isThisItemRinging
            ? "bg-rose-600/30 border-amber-400"
            : "bg-slate-950 border-slate-800"
        }`;
        bellIndicator.innerHTML = `
          <span class="text-lg ${isThisItemRinging ? "bell-ringing" : "opacity-75"}">
            🔔
          </span>
        `;
        rightDiv.appendChild(bellIndicator);
      }

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className =
        "w-8 h-8 rounded-xl bg-slate-950 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 border border-slate-800 flex items-center justify-center text-xs font-bold";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => this.deleteAgenda(item.id));
      rightDiv.appendChild(delBtn);

      row.appendChild(leftDiv);
      row.appendChild(rightDiv);
      this.listContainer.appendChild(row);
    });
  },

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.allData = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("Failed to read localStorage:", e);
      this.allData = {};
    }
  },

  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.allData));
    } catch (e) {
      console.error("Failed to save localStorage:", e);
    }
  },

  escapeHTML(str) {
    return str.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }
};

window.AgendaApp = AgendaApp;
document.addEventListener("DOMContentLoaded", () => AgendaApp.init());
