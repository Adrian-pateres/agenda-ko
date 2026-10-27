/**
 * alarm.js
 * Dedicated Alarm & Ringing Bell Engine (Optimized for iOS Safari & Home Screen PWA)
 */

const AlarmEngine = {
  soundEnabled: false,
  isRinging: false,
  activeAgendaId: null,
  audioCtx: null,
  beepInterval: null,
  triggeredKeys: new Set(), // Tracks "YYYY-MM-DD_id_HH:MM" so it doesn't re-trigger after stopping

  init() {
    this.audioEl = document.getElementById("ios-alarm-audio");
    this.giantBellBox = document.getElementById("giant-bell-box");
    this.giantBellSvg = document.getElementById("giant-bell-svg");
    this.giantBellPulse = document.getElementById("giant-bell-pulse");
    this.bellStateText = document.getElementById("bell-state-text");
    this.banner = document.getElementById("active-alarm-banner");
    this.bannerTitle = document.getElementById("alarm-banner-title");
    this.bannerTime = document.getElementById("alarm-banner-time");
    this.btnEnableSound = document.getElementById("btn-enable-sound");
    this.btnTestAlarm = document.getElementById("btn-test-alarm");

    // 1. Pag-generate og tinuod nga WAV Audio file sulod sa memory para sa iOS <audio> tag
    this.audioEl.src = this.createAlarmWavDataUri();

    // 2. Event Listeners para sa Enable Sound ug Test Alarm
    this.btnEnableSound.addEventListener("click", () => this.unlockiOSAudio(true));
    this.btnTestAlarm.addEventListener("click", () => this.triggerTestAlarm());

    // 3. Banner Controls (Stop, Snooze, Done)
    document.getElementById("btn-stop-alarm").addEventListener("click", () => {
      this.stopAlarm();
    });

    document.getElementById("btn-snooze-alarm").addEventListener("click", () => {
      this.snoozeActiveAlarm(5);
    });

    document.getElementById("btn-done-alarm").addEventListener("click", () => {
      if (this.activeAgendaId && window.AgendaApp) {
        window.AgendaApp.markAgendaDoneFromAlarm(this.activeAgendaId);
      }
      this.stopAlarm();
    });

    // 4. Start 1-Second Real-Time Clock & Agenda Time Matcher
    this.startClockLoop();
  },

  /**
   * Mag-himo og 1-second High-Volume Dual-Tone Digital Alarm WAV (Base64 Data URI)
   * Kini mo-gana sa iOS Home Screen PWA bisan mo-fail ang WebAudio Oscillator
   */
  createAlarmWavDataUri() {
    const sampleRate = 22050;
    const durationSeconds = 1.0;
    const numSamples = sampleRate * durationSeconds;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // WAV Header
    writeString(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, numSamples * 2, true);

    // Classic "BEEP-BEEP-BEEP" Digital Alarm Pattern (880Hz & 1320Hz)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // 3 fast beeps in first 0.6s, pause in 0.6s - 1.0s
      const inBeep1 = t >= 0.0 && t < 0.14;
      const inBeep2 = t >= 0.2 && t < 0.34;
      const inBeep3 = t >= 0.4 && t < 0.58;

      let sample = 0;
      if (inBeep1 || inBeep2 || inBeep3) {
        const freq = inBeep3 ? 1320 : 980;
        sample = Math.sin(2 * Math.PI * freq * t) > 0 ? 0.85 : -0.85; // Square wave para kusog sa speaker
      }
      view.setInt16(44 + i * 2, sample * 32767, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return "data:audio/wav;base64," + btoa(binary);
  },

  /**
   * Unlock iOS Safari / PWA Audio directly inside a user tap event
   */
  unlockiOSAudio(playConfirmationBeep = false) {
    try {
      // Bypass iOS Silent Switch on iOS 16.4 / 17+
      if (navigator.audioSession) {
        navigator.audioSession.type = "playback";
      }

      // Initialize Web Audio Context as secondary engine
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx && AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }

      // Unlock HTML5 <audio> element
      this.audioEl.volume = 1.0;
      this.audioEl.muted = false;

      if (playConfirmationBeep) {
        this.playWebAudioChime();
        // Play brief snippet of the HTML5 audio to unlock it on iOS
        this.audioEl.currentTime = 0;
        this.audioEl.play().then(() => {
          setTimeout(() => {
            if (!this.isRinging) {
              this.audioEl.pause();
              this.audioEl.currentTime = 0;
            }
          }, 350);
        }).catch((err) => console.warn("Audio unlock notice:", err));
      }

      this.soundEnabled = true;
      this.btnEnableSound.textContent = "✅ Sound Ready (On)";
      this.btnEnableSound.className =
        "flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 transition active:scale-95";
    } catch (e) {
      console.error("iOS Audio Unlock Error:", e);
    }
  },

  /**
   * Backup WebAudio Chime
   */
  playWebAudioChime() {
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (err) {
      console.warn(err);
    }
  },

  /**
   * Test Alarm Button Handler
   */
  triggerTestAlarm() {
    this.unlockiOSAudio(false);
    this.startAlarm({
      id: "TEST_ALARM",
      title: "Test Alarm & Ringing Bell 🔔",
      time: "KARON MISMO (Test Mode)"
    });
  },

  /**
   * Start Ringing the Giant Bell, Row Bell, and Phone Audio
   */
  startAlarm(agendaItem) {
    this.isRinging = true;
    this.activeAgendaId = agendaItem.id;

    // 1. Pa-uyogon ug pa-sigahon ang Dako nga Bell Icon sa ibabaw
    this.giantBellSvg.classList.add("bell-ringing");
    this.giantBellBox.classList.add("alarm-box-active");
    this.giantBellPulse.classList.remove("hidden");
    this.bellStateText.textContent = "RINGING!";
    this.bellStateText.className = "text-[10px] font-black uppercase tracking-wider text-amber-300 mt-1 animate-bounce";

    // 2. Ipakita ang Active Alarm Banner
    this.bannerTitle.textContent = agendaItem.title;
    this.bannerTime.textContent = `Oras: ${this.formatTime12Hour(agendaItem.time)}`;
    this.banner.classList.remove("hidden");

    // 3. I-refresh ang Agenda List aron ang Bell Icon sa kilid sa maong agenda mo-ring sab
    if (window.AgendaApp) {
      window.AgendaApp.renderAgendas();
    }

    // 4. Patukaron ang HTML5 WAV Loop + WebAudio Oscillator Loop
    this.audioEl.currentTime = 0;
    this.audioEl.play().catch((e) => {
      console.warn("Autoplay blocked until user taps Enable Sound:", e);
    });

    if (this.beepInterval) clearInterval(this.beepInterval);
    this.playWebAudioChime();
    this.beepInterval = setInterval(() => {
      if (this.isRinging) {
        this.playWebAudioChime();
      }
    }, 1000);
  },

  /**
   * Stop Alarm Sound & Bell Animation
   */
  stopAlarm() {
    this.isRinging = false;
    this.activeAgendaId = null;

    // Stop HTML5 Audio
    this.audioEl.pause();
    this.audioEl.currentTime = 0;

    // Stop WebAudio Loop
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
      this.beepInterval = null;
    }

    // Stop Giant Bell Animation
    this.giantBellSvg.classList.remove("bell-ringing");
    this.giantBellBox.classList.remove("alarm-box-active");
    this.giantBellPulse.classList.add("hidden");
    this.bellStateText.textContent = "Standby";
    this.bellStateText.className = "text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1";

    // Hide Alarm Banner
    this.banner.classList.add("hidden");

    if (window.AgendaApp) {
      window.AgendaApp.renderAgendas();
    }
  },

  /**
   * Snooze Active Alarm by +5 Minutes
   */
  snoozeActiveAlarm(minutes = 5) {
    if (this.activeAgendaId && this.activeAgendaId !== "TEST_ALARM" && window.AgendaApp) {
      window.AgendaApp.snoozeAgendaItem(this.activeAgendaId, minutes);
    }
    this.stopAlarm();
  },

  /**
   * 1-Second Loop: Updates Live Clock & Checks if Any Agenda Matches Current Time
   */
  startClockLoop() {
    const tick = () => {
      const now = new Date();

      // Update Live Clock Display
      const clockEl = document.getElementById("live-clock");
      const todayLabelEl = document.getElementById("live-today-label");
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true
        });
      }
      if (todayLabelEl) {
        todayLabelEl.textContent = now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric"
        });
      }

      // Check Agenda Alarms for Today's Date & Current HH:MM
      if (window.AgendaApp) {
        const todayKey = window.AgendaApp.formatDateKey(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const currentHH = String(now.getHours()).padStart(2, "0");
        const currentMM = String(now.getMinutes()).padStart(2, "0");
        const currentHHMM = `${currentHH}:${currentMM}`;

        const todaysAgendas = window.AgendaApp.getAgendasForDate(todayKey);
        todaysAgendas.forEach((item) => {
          if (!item.done && item.time && item.time === currentHHMM) {
            const uniqueTriggerKey = `${todayKey}_${item.id}_${item.time}`;
            if (!this.triggeredKeys.has(uniqueTriggerKey)) {
              this.triggeredKeys.add(uniqueTriggerKey);
              this.startAlarm(item);
            }
          }
        });
      }
    };

    tick();
    setInterval(tick, 1000);
  },

  formatTime12Hour(time24) {
    if (!time24 || !time24.includes(":")) return time24 || "";
    const [hStr, mStr] = time24.split(":");
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm}`;
  }
};

window.AlarmEngine = AlarmEngine;
