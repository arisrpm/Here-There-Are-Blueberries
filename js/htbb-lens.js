(() => {
    'use strict';

    /**
     * HTBB — Widen the Lens Events
     *
     * Behavior:
     * - First event is always visible.
     * - Remaining events are hidden initially.
     * - Line breaks are hidden initially.
     * - VIEW ALL appears only when there is more than one event.
     * - Clicking VIEW ALL reveals all events and line breaks.
     * - Removing the first event automatically promotes
     *   the next event to the first visible position.
     */

    const initWidenLensEvents = () => {

        document
            .querySelectorAll('.widen-lens-events')
            .forEach(container => {

                const events =
                    Array.from(
                        container.querySelectorAll(
                            ':scope > .widen-lens-box'
                        )
                    );

                const linebreaks =
                    Array.from(
                        container.querySelectorAll(
                            ':scope > .linebreak'
                        )
                    );


                // ------------------------------------------------
                // NO EVENTS
                // ------------------------------------------------

                if (!events.length) {
                    return;
                }


                // ------------------------------------------------
                // FIRST EVENT
                // ------------------------------------------------

                events[0].classList.add(
                    'widen-lens-box--featured'
                );


                // ------------------------------------------------
                // ONLY ONE EVENT
                // ------------------------------------------------

                // If only one event remains, there is nothing
                // to collapse and no VIEW ALL button is needed.
                if (events.length === 1) {

                    linebreaks.forEach(linebreak => {
                        linebreak.classList.add(
                            'widen-lens-linebreak--hidden'
                        );
                    });

                    return;
                }


                // ------------------------------------------------
                // HIDE REMAINING EVENTS
                // ------------------------------------------------

                events
                    .slice(1)
                    .forEach(event => {

                        event.classList.add(
                            'widen-lens-box--hidden'
                        );

                    });


                // ------------------------------------------------
                // HIDE LINE BREAKS
                // ------------------------------------------------

                // These are separators BETWEEN events, so none
                // should appear until VIEW ALL is clicked.

                linebreaks.forEach(linebreak => {

                    linebreak.classList.add(
                        'widen-lens-linebreak--hidden'
                    );

                });


                // ------------------------------------------------
                // CREATE VIEW ALL
                // ------------------------------------------------

                const buttonWrap =
                    document.createElement('div');

                buttonWrap.className =
                    'widen-lens-view-all';


                const button =
                    document.createElement('button');

                button.type =
                    'button';

                button.className =
                    'widen-lens-view-all__button';

                button.textContent =
                    'VIEW ALL';

                button.setAttribute(
                    'aria-expanded',
                    'false'
                );


                buttonWrap.appendChild(
                    button
                );


                // Put VIEW ALL immediately after the first event.
                //
                // Existing structure:
                //
                // event
                // linebreak
                // event
                //
                // becomes:
                //
                // event
                // VIEW ALL
                // linebreak (hidden)
                // event (hidden)

                events[0].insertAdjacentElement(
                    'afterend',
                    buttonWrap
                );


                // ------------------------------------------------
                // VIEW ALL CLICK
                // ------------------------------------------------

                button.addEventListener(
                    'click',
                    () => {

                        // Reveal all remaining events.
                        events
                            .slice(1)
                            .forEach(event => {

                                event.classList.remove(
                                    'widen-lens-box--hidden'
                                );

                            });


                        // Reveal separators between events.
                        linebreaks.forEach(linebreak => {

                            linebreak.classList.remove(
                                'widen-lens-linebreak--hidden'
                            );

                        });


                        button.setAttribute(
                            'aria-expanded',
                            'true'
                        );


                        // VIEW ALL is no longer needed.
                        buttonWrap.remove();

                    }
                );

            });
    };


    // ------------------------------------------------------------
    // START
    // ------------------------------------------------------------

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            initWidenLensEvents,
            {
                once: true,
            }
        );

    } else {

        initWidenLensEvents();

    }

})();