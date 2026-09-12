/**
 * POMODORO TOOLS — app.js
 * Vanilla JavaScript only. No frameworks.
 *
 * ┌─────────────────────────────────────────────────┐
 * │           MINI FRAMEWORK LAYER                  │
 * │  Store   – reactive state with subscriptions    │
 * │  EventBus – publish / subscribe message bus     │
 * │  Component – lifecycle base class               │
 * │  Router   – hash-based (extensible)             │
 * └─────────────────────────────────────────────────┘
 *
 * Application Modules (built on the framework):
 *  1. Utilities
 *  2. Greeting  — live clock, date, time-of-day message
 *  3. Timer     — 25-min countdown, start / stop / reset
 *  4. Tasks     — add, edit, mark done, delete → localStorage
 *  5. Links     — add, open, delete → localStorage
 *  6. Modal     — reusable edit dialog
 *  7. Toast     — lightweight notification
 *  8. Init
 */

'use strict';

/* ============================================================
   ██████  FRAMEWORK LAYER
   ============================================================ */

/**
 * Store
 * ─────
 * Centralised reactive state container.
 *
 * Usage:
 *   const store = new Store({ count: 0 });
 *   store.subscribe('count', (val, prev) => console.log(val));
 *   store.set('count', 1);          // triggers subscriber
 *   store.get('count');             // → 1
 *   store.update('count', n => n + 1);
 */
class Store {
  #state = {};
  #listeners = {};   // key → Set<fn>

  constructor(initialState = {}) {
    this.#state = { ...initialState };
  }

  /** Read a state value by key. */
  get(key) {
    return this.#state[key];
  }

  /** Read the entire state snapshot (shallow copy). */
  getAll() {
    return { ...this.#state };
  }

  /** Set a state value and notify subscribers. */
  set(key, value) {
    const prev = this.#state[key];
    if (prev === value) return;   // skip no-op updates
    this.#state[key] = value;
    this.#notify(key, value, prev);
    this.#notify('*', this.#state, null);  // wildcard
  }

  /** Functional updater: set(key, fn(current) → next). */
  update(key, updater) {
    this.set(key, updater(this.#state[key]));
  }

  /**
   * Subscribe to a specific key (or '*' for any change).
   * Returns an unsubscribe function.
   */
  subscribe(key, fn) {
    if (!this.#listeners[key]) this.#listeners[key] = new Set();
    this.#listeners[key].add(fn);
    return () => this.#listeners[key].delete(fn);
  }

  #notify(key, value, prev) {
    this.#listeners[key]?.forEach((fn) => fn(value, prev));
  }
}

/* ─────────────────────────────────────────────────── */

/**
 * EventBus
 * ────────
 * Global publish/subscribe message bus for cross-module
 * communication without tight coupling.
 *
 * Usage:
 *   EventBus.on('timer:complete', () => Toast.show('Done!'));
 *   EventBus.emit('timer:complete');
 *   EventBus.off('timer:complete', handler);
 */
const EventBus = (() => {
  const _listeners = {};   // event → Set<fn>

  /** Subscribe. Returns unsubscribe fn. */
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = new Set();
    _listeners[event].add(fn);
    return () => _listeners[event].delete(fn);
  }

  /** Unsubscribe a specific handler. */
  function off(event, fn) {
    _listeners[event]?.delete(fn);
  }

  /** Subscribe to an event exactly once. */
  function once(event, fn) {
    const unsub = on(event, (...args) => {
      fn(...args);
      unsub();
    });
    return unsub;
  }

  /** Publish an event with optional payload. */
  function emit(event, payload) {
    _listeners[event]?.forEach((fn) => fn(payload));
  }

  return { on, off, once, emit };
})();

/* ─────────────────────────────────────────────────── */

/**
 * Component
 * ─────────
 * Base class for UI modules with a consistent lifecycle.
 *
 *   mount()   — override: query DOM, build initial UI
 *   render()  — override: re-paint the component's DOM
 *   destroy() — override: clean up timers / listeners
 *
 * Subclass example:
 *   class MyWidget extends Component {
 *     constructor() { super('#my-root'); }
 *     mount() { this.el.textContent = 'Hello'; }
 *   }
 *   new MyWidget().init();
 */
class Component {
  #mounted    = false;
  #cleanups   = [];   // fns collected via this.addCleanup()

  /**
   * @param {string|Element} rootSelector  CSS selector or DOM node
   */
  constructor(rootSelector) {
    if (typeof rootSelector === 'string') {
      this.el = document.querySelector(rootSelector);
    } else {
      this.el = rootSelector;
    }
  }

  /** Call once to mount the component. */
  init() {
    if (this.#mounted) return;
    this.#mounted = true;
    this.mount();
  }

  /** Override: DOM queries, event listeners, initial render. */
  mount() {}

  /** Override: re-paint based on current state. */
  render() {}

  /** Override: clean up intervals, subscriptions, etc. */
  destroy() {
    this.#cleanups.forEach((fn) => fn());
    this.#cleanups = [];
    this.#mounted  = false;
  }

  /**
   * Register a cleanup function to run on destroy().
   * Use for: clearInterval, EventBus.off, store.unsubscribe
   */
  addCleanup(fn) {
    this.#cleanups.push(fn);
  }

  get isMounted() { return this.#mounted; }
}

/* ─────────────────────────────────────────────────── */

/**
 * Router
 * ──────
 * Simple hash-based router (extensible for multi-view apps).
 * Registers named routes and dispatches on hash change.
 *
 * Usage:
 *   Router.add('home',   () => showSection('home'));
 *   Router.add('timer',  () => showSection('timer'));
 *   Router.navigate('home');      // sets location.hash
 *   Router.start();               // reads current hash on load
 */
const Router = (() => {
  const _routes = {};
  let _default  = null;

  function add(name, handler) {
    _routes[name] = handler;
  }

  function navigate(name) {
    window.location.hash = name;
  }

  function _dispatch() {
    const hash    = window.location.hash.slice(1) || _default;
    const handler = _routes[hash] || _routes[_default];
    if (typeof handler === 'function') handler(hash);
    EventBus.emit('router:change', { route: hash });
  }

  function setDefault(name) {
    _default = name;
  }

  function start() {
    window.addEventListener('hashchange', _dispatch);
    _dispatch();   // handle the initial hash on page load
  }

  return { add, navigate, setDefault, start };
})();

/* ============================================================
   1. UTILITIES
   ============================================================ */

const STORAGE = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('localStorage write error:', err);
    }
  },
};

/** Safely escape text before injecting into innerHTML. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Zero-pad a number to 2 digits. */
const pad = (n) => String(n).padStart(2, '0');

/* ============================================================
   2. GREETING  (extends Component)
   Updates every second: clock, date, greeting message.
   ============================================================ */

class GreetingComponent extends Component {
  constructor() {
    super('.greeting-section');
  }

  mount() {
    this._elTime    = document.getElementById('greeting-time');
    this._elMessage = document.getElementById('greeting-message');
    this._elDate    = document.getElementById('greeting-date');

    this._tick();
    const id = setInterval(() => this._tick(), 1000);
    this.addCleanup(() => clearInterval(id));
  }

  _getGreeting(hour) {
    if (hour >= 5  && hour < 12) return 'Good morning! ☀️';
    if (hour >= 12 && hour < 17) return 'Good afternoon! 🌤️';
    if (hour >= 17 && hour < 21) return 'Good evening! 🌇';
    return 'Good night! 🌙';
  }

  _tick() {
    const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;

    this._elTime.textContent    = `${pad(h12)}:${pad(m)} ${ampm}`;
    this._elMessage.textContent = this._getGreeting(h);
    this._elDate.textContent    = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }
}

/* ============================================================
   3. TIMER  (extends Component + Store)
   25-minute focus countdown.
   Start, Pause, Stop, Reset controls.
   SVG progress ring animation.
   ============================================================ */

class TimerComponent extends Component {
  /* ── Constants ── */
  static TOTAL_SECONDS = 25 * 60;
  static CIRCUMFERENCE = 552.92;   // 2π × 88

  constructor() {
    super('.card--timer');
    this._store = new Store({
      secondsLeft: TimerComponent.TOTAL_SECONDS,
      running:     false,
    });
  }

  mount() {
    /* ── DOM refs ── */
    this._elMinutes  = document.getElementById('timer-minutes');
    this._elSeconds  = document.getElementById('timer-seconds');
    this._elStatus   = document.getElementById('timer-status');
    this._elBtnMain  = document.getElementById('btn-start-stop');
    this._elBtnStop  = document.getElementById('btn-stop');
    this._elBtnReset = document.getElementById('btn-reset');
    this._elRing     = document.getElementById('ring-progress');

    this._intervalId = null;

    /* React to store changes */
    this.addCleanup(
      this._store.subscribe('*', () => this.render())
    );

    this._bindEvents();
    this.render();

    /* Notification permission */
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  render() {
    const secs    = this._store.get('secondsLeft');
    const running = this._store.get('running');
    const total   = TimerComponent.TOTAL_SECONDS;
    const C       = TimerComponent.CIRCUMFERENCE;

    const m = Math.floor(secs / 60);
    const s = secs % 60;

    this._elMinutes.textContent = pad(m);
    this._elSeconds.textContent = pad(s);
    document.title = `${pad(m)}:${pad(s)} — Pomodoro Tools`;

    /* Ring offset */
    this._elRing.style.strokeDashoffset = C * (1 - secs / total);

    /* Button label */
    if (running) {
      this._elBtnMain.textContent = 'Pause';
      this._elBtnMain.setAttribute('aria-label', 'Pause timer');
    } else {
      const label = secs < total ? 'Resume' : 'Start';
      this._elBtnMain.textContent = label;
      this._elBtnMain.setAttribute('aria-label', `${label} timer`);
    }
  }

  /* ── Timer actions ── */
  _start() {
    if (this._store.get('running')) return;
    this._store.set('running', true);
    this._intervalId = setInterval(() => this._tick(), 1000);
    this._elStatus.textContent = 'Stay focused! 💪';
    EventBus.emit('timer:start');
  }

  _pause() {
    if (!this._store.get('running')) return;
    this._store.set('running', false);
    clearInterval(this._intervalId);
    this._intervalId = null;
    this._elStatus.textContent = 'Paused.';
    EventBus.emit('timer:pause');
  }

  _stop() {
    this._pause();
    this._elStatus.textContent = 'Stopped. Hit Reset or Start again.';
    EventBus.emit('timer:stop');
  }

  _reset() {
    this._pause();
    this._store.set('secondsLeft', TimerComponent.TOTAL_SECONDS);
    this._elStatus.textContent = 'Ready to focus?';
    EventBus.emit('timer:reset');
  }

  _tick() {
    const secs = this._store.get('secondsLeft');
    if (secs <= 0) { this._onComplete(); return; }
    this._store.update('secondsLeft', (n) => n - 1);
  }

  _onComplete() {
    this._pause();
    this._store.set('secondsLeft', TimerComponent.TOTAL_SECONDS);
    this._elStatus.textContent = 'Session complete! Great work 🎉';
    EventBus.emit('timer:complete');
    Toast.show('Pomodoro complete! Time for a break.');
    this._playBeep();
    this._sendNotification();
  }

  _playBeep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    } catch { /* Web Audio not available */ }
  }

  _sendNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('Pomodoro Tools', {
      body: 'Focus session complete! Take a break 🎉',
    });
  }

  _bindEvents() {
    this._elBtnMain.addEventListener('click', () => {
      this._store.get('running') ? this._pause() : this._start();
    });
    this._elBtnStop.addEventListener('click',  () => this._stop());
    this._elBtnReset.addEventListener('click', () => this._reset());
  }
}

/* ============================================================
   4. TASKS  (extends Component + Store)
   Add, edit, mark done, delete.
   Persisted to localStorage under key 'pomo_tasks'.
   ============================================================ */

class TasksComponent extends Component {
  static STORAGE_KEY = 'pomo_tasks';

  constructor() {
    super('.card--tasks');
    this._store = new Store({
      tasks: STORAGE.get(TasksComponent.STORAGE_KEY, []),
    });
  }

  mount() {
    this._elForm  = document.getElementById('task-form');
    this._elInput = document.getElementById('task-input');
    this._elList  = document.getElementById('task-list');
    this._elEmpty = document.getElementById('tasks-empty');

    /* Re-render whenever tasks change */
    this.addCleanup(
      this._store.subscribe('tasks', () => {
        STORAGE.set(TasksComponent.STORAGE_KEY, this._store.get('tasks'));
        this.render();
      })
    );

    this._bindEvents();
    this.render();
  }

  /* ── CRUD — pure state mutations ── */
  _add(text) {
    this._store.update('tasks', (list) => [
      ...list,
      { id: Date.now().toString(), text: text.trim(), done: false },
    ]);
  }

  _delete(id) {
    this._store.update('tasks', (list) => list.filter((t) => t.id !== id));
  }

  _toggle(id) {
    this._store.update('tasks', (list) =>
      list.map((t) => t.id === id ? { ...t, done: !t.done } : t)
    );
  }

  _edit(id, newText) {
    this._store.update('tasks', (list) =>
      list.map((t) => t.id === id ? { ...t, text: newText.trim() } : t)
    );
  }

  /* ── Render ── */
  render() {
    const tasks = this._store.get('tasks');
    this._elList.innerHTML = '';

    if (tasks.length === 0) {
      this._elEmpty.style.display = '';
      return;
    }
    this._elEmpty.style.display = 'none';

    const sorted = [
      ...tasks.filter((t) => !t.done),
      ...tasks.filter((t) =>  t.done),
    ];

    sorted.forEach((task) => {
      const li = document.createElement('li');
      li.className   = 'task-item';
      li.dataset.id  = task.id;

      li.innerHTML = `
        <button class="task-check ${task.done ? 'task-check--done' : ''}"
          data-action="toggle"
          aria-label="${task.done ? 'Mark incomplete' : 'Mark complete'}">
          ${task.done ? '✓' : ''}
        </button>
        <span class="task-text ${task.done ? 'task-text--done' : ''}">${escHtml(task.text)}</span>
        <div class="task-actions">
          <button class="icon-btn" data-action="edit" aria-label="Edit task">✏️</button>
          <button class="icon-btn icon-btn--danger" data-action="delete" aria-label="Delete task">🗑️</button>
        </div>
      `;

      li.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        this._toggle(task.id);
      });

      li.querySelector('[data-action="edit"]').addEventListener('click', () => {
        Modal.open(
          'Edit Task',
          `<label class="modal__label" for="modal-task-text">Task</label>
           <input class="text-input" type="text" id="modal-task-text"
             value="${escHtml(task.text)}" maxlength="120" />`,
          () => {
            const val = document.getElementById('modal-task-text').value.trim();
            if (val) { this._edit(task.id, val); Toast.show('Task updated.'); }
          },
        );
      });

      li.querySelector('[data-action="delete"]').addEventListener('click', () => {
        this._delete(task.id);
        Toast.show('Task deleted.');
      });

      this._elList.appendChild(li);
    });
  }

  _bindEvents() {
    this._elForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = this._elInput.value.trim();
      if (!val) { this._elInput.focus(); return; }
      this._add(val);
      this._elInput.value = '';
      this._elInput.focus();
      Toast.show('Task added!');
    });
  }
}

/* ============================================================
   5. LINKS  (extends Component + Store)
   Add favourite website shortcuts with label + URL.
   Persisted to localStorage under key 'pomo_links'.
   ============================================================ */

class LinksComponent extends Component {
  static STORAGE_KEY = 'pomo_links';

  constructor() {
    super('.card--links');
    this._store = new Store({
      links: STORAGE.get(LinksComponent.STORAGE_KEY, []),
    });
  }

  mount() {
    this._elForm      = document.getElementById('link-form');
    this._elNameInput = document.getElementById('link-name-input');
    this._elUrlInput  = document.getElementById('link-url-input');
    this._elGrid      = document.getElementById('link-grid');
    this._elEmpty     = document.getElementById('links-empty');

    this.addCleanup(
      this._store.subscribe('links', () => {
        STORAGE.set(LinksComponent.STORAGE_KEY, this._store.get('links'));
        this.render();
      })
    );

    this._bindEvents();
    this.render();
  }

  /* ── Helpers ── */
  _normaliseUrl(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  }

  _faviconUrl(url) {
    try {
      const origin = new URL(url).origin;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`;
    } catch { return ''; }
  }

  /* ── CRUD ── */
  _add(name, url) {
    this._store.update('links', (list) => [
      ...list,
      { id: Date.now().toString(), name: name.trim(), url },
    ]);
  }

  _delete(id) {
    this._store.update('links', (list) => list.filter((l) => l.id !== id));
  }

  _edit(id, newName, newUrl) {
    this._store.update('links', (list) =>
      list.map((l) =>
        l.id === id ? { ...l, name: newName.trim(), url: newUrl.trim() } : l
      )
    );
  }

  /* ── Render ── */
  render() {
    const links = this._store.get('links');
    this._elGrid.innerHTML = '';

    if (links.length === 0) {
      this._elEmpty.style.display = '';
      return;
    }
    this._elEmpty.style.display = 'none';

    links.forEach((link) => {
      const item = document.createElement('div');
      item.className = 'link-item';
      item.dataset.id = link.id;

      const favicon = this._faviconUrl(link.url);

      item.innerHTML = `
        <a class="link-anchor"
           href="${escHtml(link.url)}"
           target="_blank"
           rel="noopener noreferrer"
           aria-label="Open ${escHtml(link.name)}">
          ${favicon ? `<img class="link-favicon" src="${escHtml(favicon)}" alt="" aria-hidden="true" />` : ''}
          ${escHtml(link.name)}
        </a>
        <button class="link-delete" data-action="edit"   aria-label="Edit ${escHtml(link.name)}">✏️</button>
        <button class="link-delete" data-action="delete" aria-label="Delete ${escHtml(link.name)}">✕</button>
      `;

      item.querySelector('[data-action="edit"]').addEventListener('click', () => {
        Modal.open(
          'Edit Link',
          `<label class="modal__label" for="modal-link-name">Label</label>
           <input class="text-input" type="text" id="modal-link-name"
             value="${escHtml(link.name)}" maxlength="40" />
           <label class="modal__label" for="modal-link-url">URL</label>
           <input class="text-input" type="url" id="modal-link-url"
             value="${escHtml(link.url)}" maxlength="200" />`,
          () => {
            const newName = document.getElementById('modal-link-name').value.trim();
            const newUrl  = this._normaliseUrl(document.getElementById('modal-link-url').value);
            if (newName && newUrl) { this._edit(link.id, newName, newUrl); Toast.show('Link updated.'); }
          },
        );
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        this._delete(link.id);
        Toast.show('Link removed.');
      });

      this._elGrid.appendChild(item);
    });
  }

  _bindEvents() {
    this._elForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this._elNameInput.value.trim();
      const url  = this._normaliseUrl(this._elUrlInput.value);
      if (!name) { this._elNameInput.focus(); return; }
      if (!url)  { this._elUrlInput.focus();  return; }
      this._add(name, url);
      this._elNameInput.value = '';
      this._elUrlInput.value  = '';
      this._elNameInput.focus();
      Toast.show('Link saved!');
    });
  }
}

/* ============================================================
   6. MODAL  (extends Component)
   Reusable dialog for editing tasks and links.
   ============================================================ */

class ModalComponent extends Component {
  constructor() {
    super('#modal-overlay');
  }

  mount() {
    this._elHeading = document.getElementById('modal-heading');
    this._elBody    = document.getElementById('modal-body');
    this._elSave    = document.getElementById('modal-save');
    this._elCancel  = document.getElementById('modal-cancel');
    this._onSave    = null;

    this._bindEvents();
  }

  open(title, fieldsHtml, onSave) {
    this._elHeading.textContent = title;
    this._elBody.innerHTML      = fieldsHtml;
    this._onSave                = onSave;
    this.el.classList.remove('overlay--hidden');

    const firstInput = this._elBody.querySelector('input, textarea, select');
    if (firstInput) {
      firstInput.focus();
      if (firstInput.setSelectionRange) {
        const len = firstInput.value.length;
        firstInput.setSelectionRange(len, len);
      }
    }
    EventBus.emit('modal:open', { title });
  }

  close() {
    this.el.classList.add('overlay--hidden');
    this._elBody.innerHTML = '';
    this._onSave = null;
    EventBus.emit('modal:close');
  }

  _bindEvents() {
    this._elSave.addEventListener('click', () => {
      if (typeof this._onSave === 'function') this._onSave();
      this.close();
    });

    this._elCancel.addEventListener('click', () => this.close());

    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.classList.contains('overlay--hidden')) {
        this.close();
      }
    });
  }
}

/* ============================================================
   7. TOAST  (extends Component)
   Lightweight status message at the bottom of the screen.
   ============================================================ */

class ToastComponent extends Component {
  constructor() {
    super('#toast');
  }

  mount() {
    this._elText = document.getElementById('toast-text');
    this._timer  = null;
  }

  show(message, duration = 2400) {
    this._elText.textContent = message;
    this.el.classList.remove('toast--hidden');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.el.classList.add('toast--hidden'), duration);
  }
}

/* ============================================================
   SHARED SINGLETONS
   Declared at module scope so all component classes can
   reference Modal and Toast directly in their methods.
   Populated in DOMContentLoaded before any component mounts.
   ============================================================ */

/** @type {ModalComponent} */
let Modal;   // eslint-disable-line no-unused-vars

/** @type {ToastComponent} */
let Toast;   // eslint-disable-line no-unused-vars

/* ============================================================
   8. INIT
   Instantiate components, wire EventBus cross-module events,
   and boot the Router.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Instantiate singletons first so components can use them ── */
  Modal = new ModalComponent();
  Toast = new ToastComponent();
  Modal.init();
  Toast.init();

  /* ── Instantiate & mount remaining components ── */
  const greeting = new GreetingComponent();
  const timer    = new TimerComponent();
  const tasks    = new TasksComponent();
  const links    = new LinksComponent();

  greeting.init();
  timer.init();
  tasks.init();
  links.init();

  /* ── Cross-module EventBus wiring ── */
  EventBus.on('timer:complete', () => {
    // Could trigger a "take a break" task suggestion, etc.
  });

  /* ── Router setup (single-page, extensible) ── */
  Router.setDefault('home');
  Router.add('home', () => { /* all sections visible by default */ });
  Router.start();

});
