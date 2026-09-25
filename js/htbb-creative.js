(() => {
    'use strict';

    /**
     * HTBB — Creative
     * Google Sheets + Creative Grid + Bio Modal
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
     * I = BIO
     * J = PER ROW
     */

    const MODULE = '[HTBB Creative]';


    // ------------------------------------------------------------
    // CONFIG
    // ------------------------------------------------------------

    const config = {
        sheetId: '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',
        sheetName: 'Creative',
        apiKey: 'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',
        range: 'A:J',
    };


    // ------------------------------------------------------------
    // CONSTANTS
    // ------------------------------------------------------------

    const DOC_URL =
        /docs\.google\.com\/document\/d\/(?:e\/)?([\w-]{16,})/;

    const INLINE_TAGS =
        /&lt;(\/?(?:em|strong|i|b|br)\s*\/?)&gt;/gi;

    const bioCache =
        new Map();

    let people = [];

    let activeIndex =
        null;

    let lastFocusedElement =
        null;


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


    /**
     * Allow only basic formatting entered
     * directly into Google Sheets.
     *
     * Supported:
     *
     * <strong>
     * <b>
     * <em>
     * <i>
     * <br>
     */

    const safeInlineHtml = value => {

        return esc(value)
            .replace(
                INLINE_TAGS,
                '<$1>'
            );
    };


    const normalizeUrl = value => {

        const url =
            String(value || '')
                .trim();

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
            String(
                person.bio || ''
            ).trim()
        );
    };


    // ------------------------------------------------------------
    // PER ROW
    // ------------------------------------------------------------

    /**
     * Google Sheet can contain:
     *
     * One
     * Two
     * Three
     * Four
     *
     * OR:
     *
     * 1
     * 2
     * 3
     * 4
     */

    const parsePerRow = value => {

        const raw =
            String(value || '')
                .trim()
                .toLowerCase();

        const values = {
            one: 1,
            two: 2,
            three: 3,
            four: 4,
            five: 5,
            six: 6,
        };

        if (
            Object.prototype.hasOwnProperty.call(
                values,
                raw
            )
        ) {
            return values[raw];
        }

        const numeric =
            parseInt(
                raw,
                10
            );

        if (
            Number.isInteger(numeric) &&
            numeric >= 1 &&
            numeric <= 6
        ) {
            return numeric;
        }

        return 1;
    };


    // ------------------------------------------------------------
    // BIO NAVIGATION
    // ------------------------------------------------------------

    /**
     * Finds the previous/next person
     * who actually has a bio.
     *
     * Does NOT loop.
     */

    const getBioIndex = (
        currentIndex,
        direction
    ) => {

        let index =
            currentIndex +
            direction;

        while (
            index >= 0 &&
            index < people.length
        ) {

            if (
                hasBio(
                    people[index]
                )
            ) {
                return index;
            }

            index +=
                direction;
        }

        return null;
    };


    // ------------------------------------------------------------
    // INLINE BIO TEXT
    // ------------------------------------------------------------

    const richText = value => {

        return esc(value)

            .replace(
                INLINE_TAGS,
                '<$1>'
            )

            .split(
                /\n{2,}/
            )

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
                    url.searchParams.get(
                        'q'
                    ) ||
                    href
                );
            }

        } catch {
            // Use original href.
        }

        return href;
    };


    const emphasisClasses = doc => {

        const italic =
            new Set();

        const bold =
            new Set();

        doc
            .querySelectorAll(
                'style'
            )
            .forEach(style => {

                style.textContent.replace(
                    /\.([\w-]+)\s*\{([^}]*)\}/g,
                    (
                        _,
                        name,
                        body
                    ) => {

                        if (
                            /font-style\s*:\s*italic/i
                                .test(body)
                        ) {
                            italic.add(
                                name
                            );
                        }

                        if (
                            /font-weight\s*:\s*(bold|[6-9]00)/i
                                .test(body)
                        ) {
                            bold.add(
                                name
                            );
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


        if (
            !inner.trim()
        ) {
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
                sets.italic.has(
                    name
                )
            );


        const isBold =
            node.tagName === 'STRONG' ||
            node.tagName === 'B' ||
            /font-weight\s*:\s*(bold|[6-9]00)/i
                .test(style) ||
            classes.some(name =>
                sets.bold.has(
                    name
                )
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
            emphasisClasses(
                doc
            );

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

            return bioCache.get(
                id
            );
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
                            credentials:
                                'omit',
                        }
                    );


                if (
                    !response.ok
                ) {

                    throw new Error(
                        `Google Doc request failed: ` +
                        `${response.status}. ` +
                        `The document must be shared as ` +
                        `"Anyone with the link → Viewer".`
                    );
                }


                const html =
                    await response.text();


                return parseDoc(
                    html
                );

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

    const getCreative = async () => {

        const range =
            encodeURIComponent(
                `${config.sheetName}!${config.range}`
            );


        const url =
            `https://sheets.googleapis.com/v4/spreadsheets/` +
            `${config.sheetId}/values/${range}` +
            `?key=${encodeURIComponent(config.apiKey)}`;


        const response =
            await fetch(
                url
            );


        if (
            !response.ok
        ) {

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

                bio:
                    String(
                        row[8] || ''
                    ).trim(),

                perRow:
                    parsePerRow(
                        row[9]
                    ),
            }))

            .filter(person =>
                person.name
            );
    };


    // ------------------------------------------------------------
    // CREATE ROW GROUPS
    // ------------------------------------------------------------

    /**
     * PER ROW controls how many people
     * begin with the current record.
     *
     * Example:
     *
     * One
     * One
     * Two
     * Two
     * Three
     * Three
     * Three
     *
     * becomes:
     *
     * [1]
     * [1]
     * [2 people]
     * [3 people]
     */

    const createGroups = () => {

        const groups = [];

        let index = 0;


        while (
            index <
            people.length
        ) {

            const requestedCount =
                people[index]
                    .perRow || 1;


            const groupPeople =
                people
                    .slice(
                        index,
                        index +
                        requestedCount
                    )

                    .map(
                        (
                            person,
                            offset
                        ) => ({
                            person,
                            index:
                                index +
                                offset,
                        })
                    );


            groups.push({
                people:
                    groupPeople,
            });


            index +=
                requestedCount;
        }


        return groups;
    };


    // ------------------------------------------------------------
    // CREATIVE CARD
    // ------------------------------------------------------------

    const creativeCardContentHtml =
        person => {

            return `
                <div class="htbb-creative__info">

                    ${
                        person.role
                            ? `
                                <div class="htbb-creative__role">
                                    ${safeInlineHtml(person.role)}
                                </div>
                            `
                            : ''
                    }

                    <h3 class="htbb-creative__name">
                        ${safeInlineHtml(person.name)}
                    </h3>

                </div>
            `;
        };


    const creativeCardHtml = (
        person,
        index
    ) => {

        const content =
            creativeCardContentHtml(
                person
            );


        // Has bio = clickable.
        if (
            hasBio(person)
        ) {

            return `
                <article
                    class="htbb-creative__card htbb-creative__card--has-bio"
                >

                    <button
                        class="htbb-creative__button"
                        type="button"
                        data-creative-index="${index}"
                        aria-label="View biography for ${esc(person.name)}"
                    >
                        ${content}
                    </button>

                </article>
            `;
        }


        // No bio = static.
        return `
            <article
                class="htbb-creative__card htbb-creative__card--no-bio"
            >

                <div
                    class="htbb-creative__button htbb-creative__button--static"
                >
                    ${content}
                </div>

            </article>
        `;
    };


    // ------------------------------------------------------------
    // RENDER CREATIVE
    // ------------------------------------------------------------

    const renderCreative =
        container => {

            const grid =
                container.querySelector(
                    '.htbb-creative__grid'
                );


            if (!grid) {
                return;
            }


            const groups =
                createGroups();


            grid.innerHTML =
                groups
                    .map(group => {

                        const count =
                            group.people.length;


                        const cards =
                            group.people
                                .map(item =>
                                    creativeCardHtml(
                                        item.person,
                                        item.index
                                    )
                                )
                                .join('');


                        return `
                            <div
                                class="htbb-creative__row"
                                style="--creative-columns: ${count};"
                            >
                                ${cards}
                            </div>
                        `;

                    })
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
            normalizeUrl(
                value
            );


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


    const socialsHtml =
        person => {

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
                <div class="htbb-creative-modal__socials">
                    ${links}
                </div>
            `;
        };


    // ------------------------------------------------------------
    // MODAL NAVIGATION
    // ------------------------------------------------------------

    const modalNavigationHtml =
        index => {

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
                previousIndex === null &&
                nextIndex === null
            ) {
                return '';
            }


            return `
                <div class="htbb-creative-modal__nav">

                    ${
                        previousIndex !== null
                            ? `
                                <button
                                    class="htbb-creative-modal__arrow htbb-creative-modal__arrow--prev"
                                    type="button"
                                    data-creative-nav="prev"
                                    aria-label="Previous biography: ${esc(people[previousIndex].name)}"
                                >
                                    <span aria-hidden="true">‹</span>
                                </button>
                            `
                            : ''
                    }

                    ${
                        nextIndex !== null
                            ? `
                                <button
                                    class="htbb-creative-modal__arrow htbb-creative-modal__arrow--next"
                                    type="button"
                                    data-creative-nav="next"
                                    aria-label="Next biography: ${esc(people[nextIndex].name)}"
                                >
                                    <span aria-hidden="true">›</span>
                                </button>
                            `
                            : ''
                    }

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

        return `
            <div class="htbb-creative-modal__inner">

                <div class="htbb-creative-modal__details">

                    ${
                        person.role
                            ? `
                                <div class="htbb-creative-modal__role">
                                    ${safeInlineHtml(person.role)}
                                </div>
                            `
                            : ''
                    }

                    <h2
                        id="htbb-creative-modal-name"
                        class="htbb-creative-modal__name"
                    >
                        ${safeInlineHtml(person.name)}
                    </h2>

                    <div class="htbb-creative-modal__bio"></div>

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
                '.htbb-creative-modal__bio'
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
            raw.match(
                DOC_URL
            );


        // Bio directly in Sheet.
        if (
            !docMatch
        ) {

            target.innerHTML =
                richText(
                    raw
                );

            return;
        }


        // Google Doc bio.
        target.innerHTML =
            '<p class="htbb-creative-modal__bio-loading">Loading…</p>';


        try {

            const html =
                await fetchDocBio(
                    docMatch[1]
                );


            if (
                modal.dataset.creativeIndex !==
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


            target.innerHTML =
                '';
        }
    };


    // ------------------------------------------------------------
    // DISPLAY MODAL PERSON
    // ------------------------------------------------------------

    const displayModalPerson =
        index => {

            const modal =
                document.querySelector(
                    '#htbb-creative-modal'
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
                    '.htbb-creative-modal__content'
                );


            if (!content) {
                return;
            }


            activeIndex =
                index;


            modal.dataset.creativeIndex =
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
                '#htbb-creative-modal'
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
            'htbb-creative-modal-open'
        );


        const closeButton =
            modal.querySelector(
                '.htbb-creative-modal__close'
            );


        if (closeButton) {

            requestAnimationFrame(
                () => {

                    closeButton.focus();

                }
            );
        }
    };


    // ------------------------------------------------------------
    // NAVIGATE MODAL
    // ------------------------------------------------------------

    const navigateModal =
        direction => {

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


            // Beginning/end reached.
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
                '#htbb-creative-modal'
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
            'htbb-creative-modal-open'
        );


        delete modal.dataset.creativeIndex;


        activeIndex =
            null;


        if (
            lastFocusedElement &&
            document.contains(
                lastFocusedElement
            )
        ) {

            lastFocusedElement.focus();
        }


        lastFocusedElement =
            null;
    };


    // ------------------------------------------------------------
    // EVENTS
    // ------------------------------------------------------------

    const bindEvents =
        container => {

            const modal =
                document.querySelector(
                    '#htbb-creative-modal'
                );


            if (!modal) {
                return;
            }


            // Creative card.
            container.addEventListener(
                'click',
                event => {

                    const button =
                        event.target.closest(
                            '[data-creative-index]'
                        );


                    if (!button) {
                        return;
                    }


                    const index =
                        Number(
                            button.dataset
                                .creativeIndex
                        );


                    if (
                        !Number.isInteger(
                            index
                        )
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
                            '.htbb-creative-modal__close'
                        )
                    ) {

                        closeModal();

                        return;
                    }


                    // Previous.
                    if (
                        event.target.closest(
                            '[data-creative-nav="prev"]'
                        )
                    ) {

                        navigateModal(
                            -1
                        );

                        return;
                    }


                    // Next.
                    if (
                        event.target.closest(
                            '[data-creative-nav="next"]'
                        )
                    ) {

                        navigateModal(
                            1
                        );

                        return;
                    }


                    // Overlay.
                    if (
                        event.target.classList.contains(
                            'htbb-creative-modal__overlay'
                        )
                    ) {

                        closeModal();
                    }
                }
            );


            // Keyboard.
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


                    if (
                        event.key ===
                        'Escape'
                    ) {

                        closeModal();

                        return;
                    }


                    if (
                        event.key ===
                        'ArrowLeft'
                    ) {

                        event.preventDefault();

                        navigateModal(
                            -1
                        );

                        return;
                    }


                    if (
                        event.key ===
                        'ArrowRight'
                    ) {

                        event.preventDefault();

                        navigateModal(
                            1
                        );
                    }
                }
            );
        };


    // ------------------------------------------------------------
    // INIT
    // ------------------------------------------------------------

    const init =
        async () => {

            const container =
                document.querySelector(
                    '#htbb-creative'
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
                    await getCreative();


                console.log(
                    `${MODULE} Loaded ${people.length} creative member(s).`,
                    people
                );


                if (
                    !people.length
                ) {

                    container.hidden =
                        true;

                    return;
                }


                renderCreative(
                    container
                );


                bindEvents(
                    container
                );

            } catch (error) {

                console.error(
                    `${MODULE} Unable to load creative team.`,
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