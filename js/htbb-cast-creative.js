(() => {
    'use strict';

    /**
     * HTBB — Cast
     * Google Sheets + Cast Grid + Bio Modal
     *
     * Sheet columns:
     *
     * A = NAME
     * B = ROLE
     * C = INSTAGRAM
     * D = FACEBOOK
     * E = TWITTER (X)
     * F = TIKTOK
     * G = YOUTUBE
     * H = WEBSITE
     * I = IMAGE URL
     * J = BIO
     */

    const MODULE = '[HTBB Cast]';

    // ------------------------------------------------------------
    // CONFIG
    // ------------------------------------------------------------

    const config = {
        sheetId: '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',
        sheetName: 'Cast',
        apiKey: 'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',
        range: 'A:J',
    };

    // Google Docs share URL.
    const DOC_URL =
        /docs\.google\.com\/document\/d\/(?:e\/)?([\w-]{16,})/;

    // Google Drive file URL.
    const DRIVE_FILE_URL =
        /drive\.google\.com\/file\/d\/([\w-]+)/;

    // Safe inline HTML allowed in Sheet bios.
    const INLINE_TAGS =
        /&lt;(\/?(?:em|strong|i|b|br)\s*\/?)&gt;/gi;

    // Cache Google Docs.
    const bioCache = new Map();

    let people = [];
    let activeIndex = null;
    let lastFocusedElement = null;


    // ------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------

    const esc = value => {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };


    const normalizeUrl = value => {

        const url =
            String(value || '').trim();

        if (!url) {
            return '';
        }

        try {

            const parsed =
                new URL(url);

            if (
                parsed.protocol !== 'http:' &&
                parsed.protocol !== 'https:'
            ) {
                return '';
            }

            return parsed.href;

        } catch {
            return '';
        }
    };


    const hasBio = person => {

        return Boolean(
            person &&
            String(person.bio || '').trim()
        );
    };


    // ------------------------------------------------------------
    // BIO NAVIGATION
    // ------------------------------------------------------------

    /**
     * Find the next/previous cast member who actually
     * has a bio.
     *
     * direction:
     *  1 = next
     * -1 = previous
     *
     * Navigation wraps around.
     */
    const getBioIndex = (
        currentIndex,
        direction
    ) => {

        if (!people.length) {
            return null;
        }

        let index =
            currentIndex;

        for (
            let count = 0;
            count < people.length;
            count++
        ) {

            index =
                (
                    index +
                    direction +
                    people.length
                ) % people.length;

            if (
                index !== currentIndex &&
                hasBio(people[index])
            ) {
                return index;
            }
        }

        return null;
    };


    const getBioCount = () => {

        return people.filter(
            hasBio
        ).length;
    };


    // ------------------------------------------------------------
    // GOOGLE DRIVE IMAGES
    // ------------------------------------------------------------

    const normalizeImageUrl = value => {

        const url =
            normalizeUrl(value);

        if (!url) {
            return '';
        }

        const match =
            url.match(DRIVE_FILE_URL);

        if (match) {
            return (
                `https://drive.google.com/thumbnail` +
                `?id=${match[1]}&sz=w1600`
            );
        }

        return url;
    };


    // ------------------------------------------------------------
    // BIO — TEXT ENTERED DIRECTLY INTO SHEET
    // ------------------------------------------------------------

    const richText = value => {

        return esc(value)

            // Restore only our approved HTML.
            .replace(
                INLINE_TAGS,
                '<$1>'
            )

            // Separate paragraphs on blank lines.
            .split(/\n{2,}/)

            .map(block =>
                block
                    .trim()
                    .replace(
                        /\n/g,
                        '<br>'
                    )
            )

            .filter(Boolean)

            .map(block =>
                `<p>${block}</p>`
            )

            .join('');
    };


    // ------------------------------------------------------------
    // GOOGLE DOC BIO
    // ------------------------------------------------------------

    /**
     * Google Docs sometimes wraps links in:
     *
     * google.com/url?q=REAL_URL
     *
     * Recover the actual destination.
     */
    const unwrapLink = href => {

        if (!href) {
            return '';
        }

        try {

            const url =
                new URL(
                    href,
                    'https://docs.google.com'
                );

            if (
                url.hostname.endsWith(
                    'google.com'
                ) &&
                url.pathname === '/url'
            ) {
                return (
                    url.searchParams.get('q') ||
                    href
                );
            }

        } catch {
            // Fall through.
        }

        return href;
    };


    /**
     * Google Docs HTML exports often use generated CSS
     * classes for bold/italic instead of semantic markup.
     *
     * Determine which classes represent those styles.
     */
    const emphasisClasses = doc => {

        const italic =
            new Set();

        const bold =
            new Set();

        doc
            .querySelectorAll('style')
            .forEach(style => {

                style.textContent.replace(
                    /\.([\w-]+)\s*\{([^}]*)\}/g,
                    (_, name, body) => {

                        if (
                            /font-style\s*:\s*italic/i
                                .test(body)
                        ) {
                            italic.add(name);
                        }

                        if (
                            /font-weight\s*:\s*(bold|[6-9]00)/i
                                .test(body)
                        ) {
                            bold.add(name);
                        }

                        return '';
                    }
                );

            });

        return {
            italic,
            bold,
        };
    };


    const convertNode = (
        node,
        sets
    ) => {

        // Plain text.
        if (
            node.nodeType ===
            Node.TEXT_NODE
        ) {
            return esc(
                node.nodeValue
            );
        }

        if (
            node.nodeType !==
            Node.ELEMENT_NODE
        ) {
            return '';
        }

        // Line break.
        if (
            node.tagName === 'BR'
        ) {
            return '<br>';
        }

        let inner =
            Array
                .from(
                    node.childNodes
                )
                .map(child =>
                    convertNode(
                        child,
                        sets
                    )
                )
                .join('');

        if (!inner.trim()) {
            return '';
        }

        const classes =
            Array.from(
                node.classList || []
            );

        const style =
            node.getAttribute(
                'style'
            ) || '';

        const isItalic =
            node.tagName === 'EM' ||
            node.tagName === 'I' ||
            /font-style\s*:\s*italic/i
                .test(style) ||
            classes.some(name =>
                sets.italic.has(name)
            );

        const isBold =
            node.tagName === 'STRONG' ||
            node.tagName === 'B' ||
            /font-weight\s*:\s*(bold|[6-9]00)/i
                .test(style) ||
            classes.some(name =>
                sets.bold.has(name)
            );


        // Links.
        if (
            node.tagName === 'A'
        ) {

            const href =
                normalizeUrl(
                    unwrapLink(
                        node.getAttribute(
                            'href'
                        )
                    )
                );

            if (href) {

                inner =
                    `<a ` +
                    `href="${esc(href)}" ` +
                    `target="_blank" ` +
                    `rel="noopener noreferrer">` +
                    `${inner}` +
                    `</a>`;
            }
        }


        if (isItalic) {
            inner =
                `<em>${inner}</em>`;
        }

        if (isBold) {
            inner =
                `<strong>${inner}</strong>`;
        }

        return inner;
    };


    const parseDoc = html => {

        const doc =
            new DOMParser()
                .parseFromString(
                    html,
                    'text/html'
                );

        const sets =
            emphasisClasses(doc);

        return Array
            .from(
                doc.body.querySelectorAll(
                    'p'
                )
            )

            .map(p =>
                convertNode(
                    p,
                    sets
                ).trim()
            )

            .filter(Boolean)

            .map(content =>
                `<p>${content}</p>`
            )

            .join('');
    };


    const fetchDocBio = async id => {

        if (
            bioCache.has(id)
        ) {
            return bioCache.get(id);
        }

        const pending =
            (async () => {

                const url =
                    `https://docs.google.com/document/d/` +
                    `${id}/export?format=html`;

                const response =
                    await fetch(
                        url,
                        {
                            credentials: 'omit',
                        }
                    );

                if (!response.ok) {

                    throw new Error(
                        `Google Doc request failed: ` +
                        `${response.status}. ` +
                        `The document must be shared as ` +
                        `"Anyone with the link → Viewer".`
                    );
                }

                const html =
                    await response.text();

                return parseDoc(html);

            })();

        bioCache.set(
            id,
            pending
        );

        return pending;
    };


    // ------------------------------------------------------------
    // GOOGLE SHEETS
    // ------------------------------------------------------------

    const getCast = async () => {

        const range =
            encodeURIComponent(
                `${config.sheetName}!${config.range}`
            );

        const url =
            `https://sheets.googleapis.com/v4/spreadsheets/` +
            `${config.sheetId}/values/${range}` +
            `?key=${encodeURIComponent(config.apiKey)}`;

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                `Google Sheets request failed: ` +
                `${response.status}`
            );
        }

        const data =
            await response.json();

        const rows =
            data.values || [];

        return rows
            .slice(1)

            .map(row => ({
                name:
                    String(
                        row[0] || ''
                    ).trim(),

                role:
                    String(
                        row[1] || ''
                    ).trim(),

                instagram:
                    String(
                        row[2] || ''
                    ).trim(),

                facebook:
                    String(
                        row[3] || ''
                    ).trim(),

                twitter:
                    String(
                        row[4] || ''
                    ).trim(),

                tiktok:
                    String(
                        row[5] || ''
                    ).trim(),

                youtube:
                    String(
                        row[6] || ''
                    ).trim(),

                website:
                    String(
                        row[7] || ''
                    ).trim(),

                image:
                    String(
                        row[8] || ''
                    ).trim(),

                bio:
                    String(
                        row[9] || ''
                    ).trim(),
            }))

            // Ignore blank rows.
            .filter(person =>
                person.name
            );
    };


    // ------------------------------------------------------------
    // CAST CARD
    // ------------------------------------------------------------

    const castCardContentHtml = person => {

        const image =
            normalizeImageUrl(
                person.image
            );

        return `
            ${
                image
                    ? `
                        <div class="htbb-cast__image-wrap">

                            <img
                                class="htbb-cast__image"
                                src="${esc(image)}"
                                alt="${esc(person.name)}"
                                loading="lazy"
                            >

                        </div>
                    `
                    : `
                        <div
                            class="htbb-cast__image-wrap htbb-cast__image-wrap--empty"
                            aria-hidden="true"
                        ></div>
                    `
            }

            <div class="htbb-cast__info">

                <h3 class="htbb-cast__name">
                    ${esc(person.name)}
                </h3>

                ${
                    person.role
                        ? `
                            <p class="htbb-cast__role">
                                ${esc(person.role)}
                            </p>
                        `
                        : ''
                }

            </div>
        `;
    };


    const castCardHtml = (
        person,
        index
    ) => {

        const content =
            castCardContentHtml(
                person
            );

        // Person has a bio: make the card interactive.
        if (
            hasBio(person)
        ) {

            return `
                <article class="htbb-cast__card htbb-cast__card--has-bio">

                    <button
                        class="htbb-cast__button"
                        type="button"
                        data-cast-index="${index}"
                        aria-label="View biography for ${esc(person.name)}"
                    >
                        ${content}
                    </button>

                </article>
            `;
        }


        // Person has no bio: display only.
        return `
            <article class="htbb-cast__card htbb-cast__card--no-bio">

                <div class="htbb-cast__button htbb-cast__button--static">
                    ${content}
                </div>

            </article>
        `;
    };


    // ------------------------------------------------------------
    // RENDER CAST
    // ------------------------------------------------------------

    const renderCast = container => {

        const grid =
            container.querySelector(
                '.htbb-cast__grid'
            );

        if (!grid) {
            return;
        }

        grid.innerHTML =
            people
                .map(
                    castCardHtml
                )
                .join('');
    };


    // ------------------------------------------------------------
    // SOCIAL LINKS
    // ------------------------------------------------------------

    const socialLinkHtml = (
        label,
        value
    ) => {

        const url =
            normalizeUrl(value);

        if (!url) {
            return '';
        }

        return `
            <a
                href="${esc(url)}"
                target="_blank"
                rel="noopener noreferrer"
            >
                ${esc(label)}
            </a>
        `;
    };


    const socialsHtml = person => {

        const links = [

            socialLinkHtml(
                'Instagram',
                person.instagram
            ),

            socialLinkHtml(
                'Facebook',
                person.facebook
            ),

            socialLinkHtml(
                'X',
                person.twitter
            ),

            socialLinkHtml(
                'TikTok',
                person.tiktok
            ),

            socialLinkHtml(
                'YouTube',
                person.youtube
            ),

            socialLinkHtml(
                'Website',
                person.website
            ),

        ]
            .filter(Boolean)
            .join('');

        if (!links) {
            return '';
        }

        return `
            <div class="htbb-cast-modal__socials">
                ${links}
            </div>
        `;
    };


    // ------------------------------------------------------------
    // MODAL NAVIGATION
    // ------------------------------------------------------------

    const modalNavigationHtml = index => {

        // Don't show navigation if there is only one bio.
        if (
            getBioCount() <= 1
        ) {
            return '';
        }

        const previousIndex =
            getBioIndex(
                index,
                -1
            );

        const nextIndex =
            getBioIndex(
                index,
                1
            );

        if (
            previousIndex === null ||
            nextIndex === null
        ) {
            return '';
        }

        const previousPerson =
            people[previousIndex];

        const nextPerson =
            people[nextIndex];

        return `
            <div class="htbb-cast-modal__nav">

                <button
                    class="htbb-cast-modal__arrow htbb-cast-modal__arrow--prev"
                    type="button"
                    data-cast-nav="prev"
                    aria-label="Previous biography: ${esc(previousPerson.name)}"
                >
                    <span aria-hidden="true">‹</span>
                </button>

                <button
                    class="htbb-cast-modal__arrow htbb-cast-modal__arrow--next"
                    type="button"
                    data-cast-nav="next"
                    aria-label="Next biography: ${esc(nextPerson.name)}"
                >
                    <span aria-hidden="true">›</span>
                </button>

            </div>
        `;
    };


    // ------------------------------------------------------------
    // MODAL CONTENT
    // ------------------------------------------------------------

    const modalHtml = (
        person,
        index
    ) => {

        const image =
            normalizeImageUrl(
                person.image
            );

        return `
            <div class="htbb-cast-modal__inner">

                ${
                    image
                        ? `
                            <div class="htbb-cast-modal__photo">

                                <img
                                    src="${esc(image)}"
                                    alt="${esc(person.name)}"
                                >

                            </div>
                        `
                        : ''
                }

                <div class="htbb-cast-modal__details">

                    <h2
                        id="htbb-cast-modal-name"
                        class="htbb-cast-modal__name"
                    >
                        ${esc(person.name)}
                    </h2>

                    ${
                        person.role
                            ? `
                                <div class="htbb-cast-modal__role">
                                    ${esc(person.role)}
                                </div>
                            `
                            : ''
                    }

                    <div class="htbb-cast-modal__bio"></div>

                    ${socialsHtml(person)}

                </div>

            </div>

            ${modalNavigationHtml(index)}
        `;
    };


    // ------------------------------------------------------------
    // LOAD BIO
    // ------------------------------------------------------------

    const loadBio = async (
        person,
        modal
    ) => {

        const target =
            modal.querySelector(
                '.htbb-cast-modal__bio'
            );

        if (
            !target ||
            !hasBio(person)
        ) {
            return;
        }

        const raw =
            String(
                person.bio
            ).trim();

        const docMatch =
            raw.match(DOC_URL);


        // ----------------------------------------
        // BIO ENTERED DIRECTLY IN SHEET
        // ----------------------------------------

        if (!docMatch) {

            target.innerHTML =
                richText(raw);

            return;
        }


        // ----------------------------------------
        // GOOGLE DOC BIO
        // ----------------------------------------

        target.innerHTML =
            '<p class="htbb-cast-modal__bio-loading">Loading…</p>';

        try {

            const html =
                await fetchDocBio(
                    docMatch[1]
                );

            /**
             * Make sure the user hasn't opened
             * another cast member while this
             * request was loading.
             */

            if (
                modal.dataset.castIndex !==
                String(activeIndex)
            ) {
                return;
            }

            target.innerHTML =
                html || '';

        } catch (error) {

            console.error(
                `${MODULE} Could not load bio for ${person.name}.`,
                error
            );

            target.innerHTML = '';

        }
    };


    // ------------------------------------------------------------
    // DISPLAY MODAL PERSON
    // ------------------------------------------------------------

    const displayModalPerson = index => {

        const modal =
            document.querySelector(
                '#htbb-cast-modal'
            );

        if (!modal) {
            return;
        }

        const person =
            people[index];

        if (
            !person ||
            !hasBio(person)
        ) {
            return;
        }

        const content =
            modal.querySelector(
                '.htbb-cast-modal__content'
            );

        if (!content) {
            return;
        }

        activeIndex =
            index;

        modal.dataset.castIndex =
            String(index);

        content.innerHTML =
            modalHtml(
                person,
                index
            );

        loadBio(
            person,
            modal
        );
    };


    // ------------------------------------------------------------
    // OPEN MODAL
    // ------------------------------------------------------------

    const openModal = (
        index,
        trigger
    ) => {

        const modal =
            document.querySelector(
                '#htbb-cast-modal'
            );

        if (!modal) {
            return;
        }

        const person =
            people[index];

        // No bio = no modal.
        if (
            !person ||
            !hasBio(person)
        ) {
            return;
        }

        lastFocusedElement =
            trigger || null;

        displayModalPerson(
            index
        );

        modal.classList.add(
            'is-open'
        );

        modal.setAttribute(
            'aria-hidden',
            'false'
        );

        document.body.classList.add(
            'htbb-cast-modal-open'
        );

        const closeButton =
            modal.querySelector(
                '.htbb-cast-modal__close'
            );

        if (closeButton) {

            requestAnimationFrame(() => {
                closeButton.focus();
            });
        }
    };


    // ------------------------------------------------------------
    // NAVIGATE MODAL
    // ------------------------------------------------------------

    const navigateModal = direction => {

        if (
            activeIndex === null
        ) {
            return;
        }

        const newIndex =
            getBioIndex(
                activeIndex,
                direction
            );

        if (
            newIndex === null
        ) {
            return;
        }

        displayModalPerson(
            newIndex
        );
    };


    // ------------------------------------------------------------
    // CLOSE MODAL
    // ------------------------------------------------------------

    const closeModal = () => {

        const modal =
            document.querySelector(
                '#htbb-cast-modal'
            );

        if (!modal) {
            return;
        }

        modal.classList.remove(
            'is-open'
        );

        modal.setAttribute(
            'aria-hidden',
            'true'
        );

        document.body.classList.remove(
            'htbb-cast-modal-open'
        );

        delete modal.dataset.castIndex;

        activeIndex = null;

        if (
            lastFocusedElement &&
            document.contains(
                lastFocusedElement
            )
        ) {
            lastFocusedElement.focus();
        }

        lastFocusedElement = null;
    };


    // ------------------------------------------------------------
    // EVENTS
    // ------------------------------------------------------------

    const bindEvents = container => {

        const modal =
            document.querySelector(
                '#htbb-cast-modal'
            );

        if (!modal) {
            return;
        }


        // Cast card click.
        container.addEventListener(
            'click',
            event => {

                const button =
                    event.target.closest(
                        '[data-cast-index]'
                    );

                if (!button) {
                    return;
                }

                const index =
                    Number(
                        button.dataset.castIndex
                    );

                if (
                    !Number.isInteger(index)
                ) {
                    return;
                }

                openModal(
                    index,
                    button
                );
            }
        );


        // Modal controls.
        modal.addEventListener(
            'click',
            event => {

                // Close.
                if (
                    event.target.closest(
                        '.htbb-cast-modal__close'
                    )
                ) {
                    closeModal();
                    return;
                }


                // Previous.
                if (
                    event.target.closest(
                        '[data-cast-nav="prev"]'
                    )
                ) {
                    navigateModal(-1);
                    return;
                }


                // Next.
                if (
                    event.target.closest(
                        '[data-cast-nav="next"]'
                    )
                ) {
                    navigateModal(1);
                    return;
                }


                // Overlay.
                if (
                    event.target.classList.contains(
                        'htbb-cast-modal__overlay'
                    )
                ) {
                    closeModal();
                }
            }
        );


        // Keyboard controls.
        document.addEventListener(
            'keydown',
            event => {

                if (
                    !modal.classList.contains(
                        'is-open'
                    )
                ) {
                    return;
                }


                // Escape closes.
                if (
                    event.key === 'Escape'
                ) {
                    closeModal();
                    return;
                }


                // Left arrow = previous bio.
                if (
                    event.key === 'ArrowLeft'
                ) {
                    event.preventDefault();

                    navigateModal(-1);
                    return;
                }


                // Right arrow = next bio.
                if (
                    event.key === 'ArrowRight'
                ) {
                    event.preventDefault();

                    navigateModal(1);
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
                '#htbb-cast'
            );

        if (!container) {
            return;
        }

        container.setAttribute(
            'aria-busy',
            'true'
        );

        try {

            people =
                await getCast();

            console.log(
                `${MODULE} Loaded ${people.length} cast member(s).`,
                people
            );

            if (!people.length) {

                container.hidden =
                    true;

                return;
            }

            renderCast(
                container
            );

            bindEvents(
                container
            );

        } catch (error) {

            console.error(
                `${MODULE} Unable to load cast.`,
                error
            );

            container.hidden =
                true;

        } finally {

            container.removeAttribute(
                'aria-busy'
            );

            container.classList.remove(
                'is-loading'
            );
        }
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
            init,
            {
                once: true,
            }
        );

    } else {

        init();

    }

})();