(() => {
  'use strict';

  /**
   * Quotes Slider
   * Google Sheets + Simple Fade
   */

  const MODULE = '[Quotes]';

  // ------------------------------------------------------------
  // CONFIG
  // ------------------------------------------------------------

  const config = {
    sheetId:
      '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',

    sheetName:
      'Quotes',

    apiKey:
      'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',

    // How long each quote stays visible.
    displayDuration: 5000,

    // Must roughly match CSS transition duration.
    fadeDuration: 700,
  };

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  let quotes = [];
  let currentIndex = 0;
  let timer = null;

  // ------------------------------------------------------------
  // GET QUOTES
  // ------------------------------------------------------------

  const getQuotes = async () => {
    const range =
      encodeURIComponent(
        `${config.sheetName}!A:B`
      );

    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/` +
      `${config.sheetId}/values/${range}` +
      `?key=${encodeURIComponent(config.apiKey)}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Google Sheets request failed: ${response.status}`
      );
    }

    const data =
      await response.json();

    const rows =
      data.values || [];

    /**
     * First row contains:
     *
     * QUOTE | AUTHOR/PUBLICATION
     *
     * So skip it.
     */
    return rows
      .slice(1)
      .map(row => {
        return {
          quote:
            String(row[0] || '').trim(),

          author:
            String(row[1] || '').trim(),
        };
      })
      .filter(item => item.quote);
  };

  // ------------------------------------------------------------
  // RENDER QUOTE
  // ------------------------------------------------------------

  const renderQuote = (
    container,
    quote
  ) => {
    const quoteElement =
      container.querySelector(
        '.quotes-slider__quote'
      );

    const authorElement =
      container.querySelector(
        '.quotes-slider__author'
      );

    if (
      !quoteElement ||
      !authorElement
    ) {
      return;
    }

    quoteElement.textContent =
      quote.quote;

    authorElement.textContent =
      quote.author
        ? `— ${quote.author}`
        : '';

    authorElement.hidden =
      !quote.author;
  };

  // ------------------------------------------------------------
  // SHOW FIRST QUOTE
  // ------------------------------------------------------------

  const showInitialQuote = container => {
    const item =
      container.querySelector(
        '.quotes-slider__item'
      );

    if (!item || !quotes.length) {
      return;
    }

    renderQuote(
      container,
      quotes[0]
    );

    container.classList.remove(
      'is-loading'
    );

    /**
     * Allow the browser to paint the content
     * before fading it in.
     */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.classList.add(
          'is-visible'
        );
      });
    });
  };

  // ------------------------------------------------------------
  // NEXT QUOTE
  // ------------------------------------------------------------

  const nextQuote = container => {
    const item =
      container.querySelector(
        '.quotes-slider__item'
      );

    if (
      !item ||
      quotes.length <= 1
    ) {
      return;
    }

    // Fade current quote out.
    item.classList.remove(
      'is-visible'
    );

    window.setTimeout(() => {

      currentIndex =
        (currentIndex + 1) %
        quotes.length;

      renderQuote(
        container,
        quotes[currentIndex]
      );

      // Fade new quote in.
      requestAnimationFrame(() => {
        item.classList.add(
          'is-visible'
        );
      });

    }, config.fadeDuration);
  };

  // ------------------------------------------------------------
  // START ROTATION
  // ------------------------------------------------------------

  const startRotation = container => {
    if (quotes.length <= 1) {
      return;
    }

    stopRotation();

    timer =
      window.setInterval(
        () => {
          nextQuote(container);
        },
        config.displayDuration +
        config.fadeDuration
      );
  };

  // ------------------------------------------------------------
  // STOP ROTATION
  // ------------------------------------------------------------

  const stopRotation = () => {
    if (!timer) {
      return;
    }

    window.clearInterval(timer);

    timer = null;
  };

  // ------------------------------------------------------------
  // VISIBILITY
  // ------------------------------------------------------------

  const handleVisibility = container => {
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          stopRotation();
        } else {
          startRotation(container);
        }
      }
    );
  };

  // ------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------

  const init = async () => {
    const container =
      document.querySelector(
        '#quotes-slider'
      );

    if (!container) {
      return;
    }

    container.classList.add(
      'is-loading'
    );

    try {

      quotes =
        await getQuotes();

      console.log(
        `${MODULE} Loaded ${quotes.length} quote(s).`,
        quotes
      );

      if (!quotes.length) {
        container.hidden = true;

        return;
      }

      currentIndex = 0;

      showInitialQuote(container);

      /**
       * Respect reduced-motion preference.
       *
       * First quote remains displayed but
       * automatic rotation is disabled.
       */
      const reducedMotion =
        window.matchMedia(
          '(prefers-reduced-motion: reduce)'
        ).matches;

      if (
        !reducedMotion &&
        quotes.length > 1
      ) {
        startRotation(container);

        handleVisibility(container);
      }

    } catch (error) {

      console.error(
        `${MODULE} Unable to load quotes.`,
        error
      );

      container.hidden = true;
    }
  };

  // ------------------------------------------------------------
  // START
  // ------------------------------------------------------------

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true,
      }
    );
  } else {
    init();
  }

})();