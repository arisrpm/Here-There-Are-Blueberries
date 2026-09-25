(() => {
  'use strict';

  const MODULE = '[HTBB Menu]';

  // ------------------------------------------------------------
  // ELEMENTS
  // ------------------------------------------------------------

  const toggle =
    document.querySelector(
      '.htbb-menu-toggle'
    );

  const menu =
    document.querySelector(
      '#htbb-menu'
    );

  const overlay =
    document.querySelector(
      '.htbb-menu-overlay'
    );

  if (
    !toggle ||
    !menu ||
    !overlay
  ) {
    return;
  }

  const closeButton =
    menu.querySelector(
      '.htbb-menu-close'
    );

  const menuLinks =
    menu.querySelectorAll(
      '.htbb-menu-link'
    );

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  let isOpen = false;

  // ------------------------------------------------------------
  // OPEN
  // ------------------------------------------------------------

  const openMenu = () => {

    if (isOpen) {
      return;
    }

    isOpen = true;

    menu.classList.add(
      'is-open'
    );

    overlay.classList.add(
      'is-active'
    );

    document.body.classList.add(
      'htbb-menu-open'
    );

    toggle.setAttribute(
      'aria-expanded',
      'true'
    );

    menu.setAttribute(
      'aria-hidden',
      'false'
    );

    overlay.setAttribute(
      'aria-hidden',
      'false'
    );

    /**
     * Move keyboard focus into the menu.
     */
    if (closeButton) {
      closeButton.focus();
    }
  };

  // ------------------------------------------------------------
  // CLOSE
  // ------------------------------------------------------------

  const closeMenu = (
    returnFocus = true
  ) => {

    if (!isOpen) {
      return;
    }

    isOpen = false;

    menu.classList.remove(
      'is-open'
    );

    overlay.classList.remove(
      'is-active'
    );

    document.body.classList.remove(
      'htbb-menu-open'
    );

    toggle.setAttribute(
      'aria-expanded',
      'false'
    );

    menu.setAttribute(
      'aria-hidden',
      'true'
    );

    overlay.setAttribute(
      'aria-hidden',
      'true'
    );

    if (returnFocus) {
      toggle.focus();
    }
  };

  // ------------------------------------------------------------
  // TOGGLE
  // ------------------------------------------------------------

  toggle.addEventListener(
    'click',
    () => {

      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }

    }
  );

  // ------------------------------------------------------------
  // CLOSE BUTTON
  // ------------------------------------------------------------

  if (closeButton) {

    closeButton.addEventListener(
      'click',
      () => {
        closeMenu();
      }
    );

  }

  // ------------------------------------------------------------
  // OVERLAY CLICK
  // ------------------------------------------------------------

  overlay.addEventListener(
    'click',
    () => {
      closeMenu();
    }
  );

  // ------------------------------------------------------------
  // MENU LINKS
  // ------------------------------------------------------------

  menuLinks.forEach(link => {

    link.addEventListener(
      'click',
      () => {

        /**
         * Don't force focus back to the hamburger
         * because we're navigating somewhere.
         */
        closeMenu(false);

      }
    );

  });

  // ------------------------------------------------------------
  // KEYBOARD
  // ------------------------------------------------------------

  document.addEventListener(
    'keydown',
    event => {

      if (!isOpen) {
        return;
      }

      // Escape closes the menu.
      if (event.key === 'Escape') {

        event.preventDefault();

        closeMenu();

        return;
      }

      /**
       * Keep Tab focus inside the open menu.
       */
      if (event.key !== 'Tab') {
        return;
      }

      const focusable =
        Array.from(
          menu.querySelectorAll(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(element => {
          return (
            element.offsetWidth > 0 ||
            element.offsetHeight > 0
          );
        });

      if (!focusable.length) {
        return;
      }

      const first =
        focusable[0];

      const last =
        focusable[
          focusable.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {

        event.preventDefault();

        last.focus();

      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {

        event.preventDefault();

        first.focus();
      }

    }
  );

  // ------------------------------------------------------------
  // READY
  // ------------------------------------------------------------

  console.log(
    `${MODULE} Ready.`
  );

})();