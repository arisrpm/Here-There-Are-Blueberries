/**
 * HERE THERE ARE BLUEBERRIES — CALENDAR TEMPLATE
 * Drop-in performance calendar driven by a Google Sheet.
 *
 * Two files: calendar.js and calendar.css. Nothing else is required — this
 * bundles the small amount of shared plumbing it needs, so it also drops into
 * a project that already has htbb core.
 *
 * SETUP
 *   1. Edit SHEET below (spreadsheet id, API key, tab name).
 *   2. Edit CONFIG in the calendar section (ticketing URL, tracking).
 *   3. Put <div id="htbb-calendar" class="is-loading"></div> on the page.
 *   4. Load calendar.css in <head> and calendar.js with `defer`.
 *
 * SHEET COLUMNS — tab named "Calendar", one row per date in the run:
 *   A DATE                MM/DD/YYYY
 *   B MATINEE TIME        e.g. 2:00 PM   (blank = no matinee)
 *   C MAT BEST AVAILABLE  checkbox
 *   D EVENING TIME        e.g. 8:00 PM   (blank = no evening)
 *   E EVE BEST AVAILABLE  checkbox
 *
 * The workbook must be shared "Anyone with the link -> Viewer". An API key
 * cannot read a private sheet, and the key is visible to visitors either way —
 * restrict it to the Sheets API and to this site's referrers, and keep nothing
 * private in the workbook.
 *
 * To rename the CSS prefix for another show, find-and-replace "htbb-" across
 * both files.
 */

/* ==================================================================== *
 * EDIT ME (1 of 2) — where the data comes from
 * ==================================================================== */
(() => {
  'use strict';

  const SHEET = {
    spreadsheetId: '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',
    apiKey: 'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',
    tab: 'Calendar',
    columns: 'A:E',

    // Set false before launch to silence the console warnings.
    debug: true,
  };

  /* ------------------------------------------------------------------ *
   * Minimal shared layer. Skipped entirely when HTBB core is already
   * present, so this file is safe to drop alongside the full build.
   * ------------------------------------------------------------------ */

  if (window.HTBB) return;

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

  const HOSTNAME_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i;
  const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

  const normalizeUrl = value => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const linkable =
      /^[#/]/.test(raw) ||
      /^https?:\/\//i.test(raw) ||
      /^(mailto|tel):/i.test(raw) ||
      HOSTNAME_LIKE.test(raw);

    if (!linkable) return '';

    const candidate = HOSTNAME_LIKE.test(raw) ? `https://${raw}` : raw;

    try {
      const url = new URL(candidate, window.location.href);
      if (!SAFE_PROTOCOLS.has(url.protocol)) return '';
      return /^[#/]/.test(candidate) ? candidate : url.href;
    } catch {
      return '';
    }
  };

  const TRUTHY = new Set(['true', 'yes', 'y', 'x', '1', '✓', 'checked']);
  const bool = value => TRUTHY.has(String(value ?? '').trim().toLowerCase());

  const camelKey = heading =>
    String(heading ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : ''));

  const toObjects = values => {
    if (!Array.isArray(values) || values.length < 2) return [];

    const keys = values[0].map(camelKey);

    return values
      .slice(1)
      .map(row => {
        const obj = {};
        keys.forEach((key, i) => {
          if (key) obj[key] = String(row[i] ?? '').trim();
        });
        return obj;
      })
      .filter(obj => Object.values(obj).some(Boolean));
  };

  const diagnose = status => {
    switch (status) {
      case 400: return `Tab "${SHEET.tab}" does not match the workbook.`;
      case 403: return 'Check the API key restrictions, and that the workbook is shared "Anyone with the link -> Viewer".';
      case 404: return 'spreadsheetId does not resolve.';
      case 429: return 'Google Sheets read quota exceeded.';
      default: return '';
    }
  };

  // Memoized: one request, however many times getSheet is called.
  let pending = null;

  const load = async () => {
    const range = encodeURIComponent(`${SHEET.tab}!${SHEET.columns}`);
    const url =
      'https://sheets.googleapis.com/v4/spreadsheets/' +
      `${encodeURIComponent(SHEET.spreadsheetId)}/values/${range}` +
      `?valueRenderOption=FORMATTED_VALUE&key=${encodeURIComponent(SHEET.apiKey)}`;

    const response = await fetch(url, { credentials: 'omit' });

    if (!response.ok) {
      const hint = diagnose(response.status);
      throw new Error(`Google Sheets request failed: ${response.status}.${hint ? ` ${hint}` : ''}`);
    }

    const data = await response.json();
    return { [SHEET.tab]: toObjects(data.values || []) };
  };

  const getSheet = async tab => {
    if (!pending) {
      pending = load();
      pending.catch(() => {});
    }

    const sheets = await pending;
    return sheets[tab] || [];
  };

  window.HTBB = {
    config: { debug: SHEET.debug },
    getSheet,
    esc,
    normalizeUrl,
    bool,
  };
})();

/**
 * HTBB Calendar — month grid of performances, each linking to Telecharge.
 *
 * Reads the Calendar tab through HTBB core, so it shares the one batched Sheets
 * request with every other module rather than fetching on its own — including
 * when the visitor pages between months, which costs no network at all.
 *
 * The sheet holds every date in the run, dark days included. A date only
 * becomes a performance when it has a time, so empty time cells simply render
 * as a dark day.
 */
(() => {
  'use strict';

  const MODULE = '[HTBB Calendar]';
  const SELECTOR = '#htbb-calendar';
  const TAB = 'Calendar';

  /* ================================================================ *
   * EDIT ME (2 of 2) — where the ticket links point
   * ================================================================ */
  const CONFIG = {
    // Lowercase "tickets" to match the URL the ticketing team supplied exactly.
    baseUrl: 'https://www.telecharge.com/Here-There-Are-Blueberries-tickets',


    // Supplied by the ticketing team. Emitted as both AID and utm_id — if this
    // is ever blanked, both are omitted rather than sent empty.
    aid: 'BWY001499800',

    utm: {
      utm_source: 'show_site',
      utm_campaign: 'HereThereAreBlueberriesSS',
      utm_medium: 'web',
    },

    // Fallback month, used only when the sheet has no performances at all.
    startYear: 2026,
    startMonth: 9, // 0-based: October

    // Show the legend whenever ANY month in the sheet has a Best Available
    // ticked. Set true to narrow it to only the month currently on screen.
    legendPerMonth: false,

    legendText: 'Click on the date and time below for tickets.',
    legendBestAvailableText: ' Best Availability =',

    // Below this width the month grid is replaced by a vertical list of dates.
    // Set to '' to keep the grid at every size (it tightens up under 900px).
    listBelow: '(max-width: 680px)',

    // Pad every month out to six rows. Keeps the block exactly the same height
    // month to month, at the cost of a trailing empty row in most months.
    fixedSixRows: false,
  };

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Both forms ship in the markup and CSS picks one, so the switch happens on
  // resize with no listener and no re-render.
  const WEEKDAYS = [
    { full: 'Sunday', short: 'Sun' },
    { full: 'Monday', short: 'Mon' },
    { full: 'Tuesday', short: 'Tue' },
    { full: 'Wednesday', short: 'Wed' },
    { full: 'Thursday', short: 'Thu' },
    { full: 'Friday', short: 'Fri' },
    { full: 'Saturday', short: 'Sat' },
  ];

  const WEEK = 7;
  const SIX_ROWS = 42;

  let root = null;
  let media = null;
  let eventsByDate = {};
  let months = [];
  let index = 0;
  let bound = false;

  /* ------------------------------------------------------------------ *
   * Data
   * ------------------------------------------------------------------ */

  const pad = value => String(value).padStart(2, '0');

  const monthKey = (year, month) => `${year}-${pad(month + 1)}`;

  const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

  const todayKey = () => {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  };

  /** The sheet's DATE column arrives formatted, e.g. "10/01/2026". */
  const toKey = value => {
    const [month, day, year] = String(value || '').split('/');
    if (!month || !day || !year) return '';
    return `${year}-${pad(month)}-${pad(day)}`;
  };

  const addPerformance = (list, time, flag, type) => {
    const label = String(time || '').trim();
    if (!label) return;

    list.push({
      label,
      // Telecharge wants the time with no space: "7:00PM".
      urlTime: label.replace(/\s+/g, ''),
      bestAvailable: HTBB.bool(flag),
      type,
    });
  };

  const buildEventMap = rows => {
    const map = {};

    rows.forEach(row => {
      const key = toKey(row.date);
      if (!key) return;

      const list = [];
      addPerformance(list, row.matineeTime, row.matBestAvailable, 'matinee');
      addPerformance(list, row.eveningTime, row.eveBestAvailable, 'evening');

      // Days without a time are dark days; they need no entry.
      if (list.length) map[key] = list;
    });

    return map;
  };

  const collectMonths = () =>
    [...new Set(Object.keys(eventsByDate).map(key => key.slice(0, 7)))].sort();

  /** Open on the current month if the run covers it, otherwise the next one. */
  const startingIndex = () => {
    if (!months.length) return 0;

    const now = new Date();
    const found = months.findIndex(key => key >= monthKey(now.getFullYear(), now.getMonth()));

    return found === -1 ? months.length - 1 : found;
  };

  const visibleMonth = () => {
    if (!months.length) {
      return { year: CONFIG.startYear, month: CONFIG.startMonth };
    }

    const [year, month] = months[index].split('-');
    return { year: Number(year), month: Number(month) - 1 };
  };

  /* ------------------------------------------------------------------ *
   * Links
   * ------------------------------------------------------------------ */

  /**
   * Built by hand rather than with URLSearchParams: Telecharge expects the
   * literal slashes and colon inside PerformanceDateTime, and URLSearchParams
   * would percent-encode them into %2F and %3A.
   */
  const ticketUrl = (key, performance) => {
    const [year, month, day] = key.split('-');
    const params = [`PerformanceDateTime=${month}/${day}/${year}%20${performance.urlTime}`];

    if (CONFIG.aid) params.push(`AID=${CONFIG.aid}`);

    Object.entries(CONFIG.utm).forEach(([name, value]) => {
      if (value) params.push(`${name}=${value}`);
    });

    if (CONFIG.aid) params.push(`utm_id=${CONFIG.aid}`);

    return `${CONFIG.baseUrl}?${params.join('&')}`;
  };

  const longDate = key => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  const performanceHtml = (key, performance) => `
    <li class="htbb-calendar__performance${performance.bestAvailable ? ' is-best-available' : ''}">
      <a
        class="htbb-calendar__link"
        href="${HTBB.esc(ticketUrl(key, performance))}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy tickets, ${HTBB.esc(longDate(key))} at ${HTBB.esc(performance.label)}"
      >${HTBB.esc(performance.label)}</a>
    </li>
  `;

  const dayHtml = (key, day, todayKey) => {
    const performances = eventsByDate[key] || [];

    const classes = ['htbb-calendar__day'];
    if (!performances.length) classes.push('is-dark');
    if (key < todayKey) classes.push('is-past');
    if (key === todayKey) classes.push('is-today');

    return `
      <div class="${classes.join(' ')}">
        <time class="htbb-calendar__date" datetime="${key}">${day}</time>
        ${
          performances.length
            ? `<ul class="htbb-calendar__times">
                 ${performances.map(p => performanceHtml(key, p)).join('')}
               </ul>`
            : ''
        }
      </div>
    `;
  };

  const gridHtml = (year, month) => {
    const today = todayKey();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = WEEKDAYS.map(
      day => `
        <div class="htbb-calendar__weekday" aria-hidden="true">
          <span class="htbb-calendar__weekday-full">${day.full}</span>
          <span class="htbb-calendar__weekday-short">${day.short}</span>
        </div>
      `
    );

    const days = [];

    for (let i = 0; i < firstWeekday; i += 1) {
      days.push('<div class="htbb-calendar__day is-empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push(dayHtml(dateKey(year, month, day), day, today));
    }

    // Pad to whole weeks only. Padding every month to six rows leaves a dead
    // empty row in most of them — October needs exactly five. Counting day
    // cells rather than children keeps the weekday headers out of the maths.
    const target = CONFIG.fixedSixRows
      ? SIX_ROWS
      : Math.ceil(days.length / WEEK) * WEEK;

    while (days.length < target) {
      days.push('<div class="htbb-calendar__day is-empty"></div>');
    }

    return cells.concat(days).join('');
  };

  /**
   * Mobile view. A seven-column grid at 375px gives roughly 50px columns —
   * too narrow for "7:00 PM" at a legible size, and shrinking it turns every
   * showtime into a sub-44px tap target. Listing the dates instead keeps the
   * links full width and, unlike a date-only grid, still lets a day carry both
   * its matinee and its evening as separate links.
   *
   * Reuses performanceHtml, so the links, tracking and Best Available marker
   * are the same objects the grid renders.
   */
  const listHtml = (year, month) => {
    const prefix = monthKey(year, month);
    const today = todayKey();

    const keys = Object.keys(eventsByDate)
      .filter(key => key.startsWith(prefix))
      .sort();

    if (!keys.length) {
      return '<p class="htbb-calendar__empty">No performances this month.</p>';
    }

    const rows = keys.map(key => {
      const [year_, month_, day_] = key.split('-').map(Number);
      const date = new Date(year_, month_ - 1, day_);

      return `
        <li class="htbb-calendar__list-day${key < today ? ' is-past' : ''}">
          <div class="htbb-calendar__list-date">
            <span class="htbb-calendar__list-weekday">
              ${date.toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <time datetime="${key}">
              ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </time>
          </div>

          <ul class="htbb-calendar__times">
            ${eventsByDate[key].map(p => performanceHtml(key, p)).join('')}
          </ul>
        </li>
      `;
    });

    return `<ol class="htbb-calendar__list">${rows.join('')}</ol>`;
  };

  const useList = () => Boolean(CONFIG.listBelow) && Boolean(media && media.matches);

  const monthHasBestAvailable = (year, month) => {
    const prefix = monthKey(year, month);

    return Object.entries(eventsByDate).some(
      ([key, list]) => key.startsWith(prefix) && list.some(p => p.bestAvailable)
    );
  };

  const showLegend = (year, month) => {
    if (!CONFIG.legendPerMonth) {
      return Object.values(eventsByDate).some(list => list.some(p => p.bestAvailable));
    }

    return monthHasBestAvailable(year, month);
  };

  const render = () => {
    const { year, month } = visibleMonth();

    const hasPrev = index > 0;
    const hasNext = index < months.length - 1;

    root.innerHTML = `
      <div class="htbb-calendar">

        <div class="htbb-calendar__nav">
          <button
            class="htbb-calendar__prev"
            type="button"
            aria-label="Previous month"
            ${hasPrev ? '' : 'disabled'}
          ></button>

          <h2 class="htbb-calendar__month" aria-live="polite">
            ${MONTH_NAMES[month]}
            <p>${HTBB.esc(CONFIG.legendText)}</p>
          </h2>

          <button
            class="htbb-calendar__next"
            type="button"
            aria-label="Next month"
            ${hasNext ? '' : 'disabled'}
          ></button>
        </div>

        <p class="htbb-calendar__legend"${showLegend(year, month) ? '' : ' hidden'}>
          ${CONFIG.legendBestAvailableText ? `<br>${HTBB.esc(CONFIG.legendBestAvailableText)}` : ''}
          <span class="htbb-calendar__swatch" aria-hidden="true"></span>
          <span class="htbb-calendar__sr">highlighted showtimes</span>
        </p>

        ${
          useList()
            ? listHtml(year, month)
            : `<div class="htbb-calendar__grid">${gridHtml(year, month)}</div>`
        }

      </div>
    `;
  };

  /* ------------------------------------------------------------------ *
   * Interaction
   * ------------------------------------------------------------------ */

  const go = (step, selector) => {
    const next = index + step;
    if (next < 0 || next > months.length - 1) return;

    index = next;
    render();

    // The button was just replaced by the re-render. Put focus back on it so a
    // keyboard user can keep paging; fall back to the heading at either end.
    const button = root.querySelector(selector);

    if (button && !button.disabled) {
      button.focus();
    } else {
      root.querySelector('.htbb-calendar__month')?.focus?.();
    }
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    // Delegated, so the listener survives every re-render.
    root.addEventListener('click', event => {
      if (event.target.closest('.htbb-calendar__prev')) go(-1, '.htbb-calendar__prev');
      if (event.target.closest('.htbb-calendar__next')) go(1, '.htbb-calendar__next');
    });
  };

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  const init = async () => {
    root = document.querySelector(SELECTOR);

    if (!root || !window.HTBB) return;

    root.setAttribute('aria-busy', 'true');

    try {
      const rows = await HTBB.getSheet(TAB);

      eventsByDate = buildEventMap(rows);
      months = collectMonths();
      index = startingIndex();

      if (!months.length && HTBB.config.debug) {
        console.warn(
          `${MODULE} No performance times in the ${TAB} tab yet — showing ` +
            `${MONTH_NAMES[CONFIG.startMonth]} ${CONFIG.startYear} as an empty month.`
        );
      }

      if (CONFIG.listBelow && !media) {
        media = window.matchMedia(CONFIG.listBelow);
        // Re-render on the way across the breakpoint, in both directions.
        media.addEventListener('change', render);
      }

      render();
      bindEvents();
    } catch (error) {
      console.error(`${MODULE} Unable to load the calendar.`, error);
      root.hidden = true;
    } finally {
      root.removeAttribute('aria-busy');
      root.classList.remove('is-loading');
    }
  };

  window.HTBBCalendar = { init };

  // Standalone: no main.js in this template, so start on our own.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
