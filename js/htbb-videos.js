(() => {
    'use strict';

    /**
     * HTBB — Videos
     *
     * Google Sheet:
     *
     * A = TITLE
     * B = DESCRIPTION
     * C = URL
     * D = LINK
     * E = CATEGORY
     * F = THUMBNAIL
     *
     * LINK:
     * Modal
     * External Link
     */

    const MODULE = '[HTBB Videos]';

    const config = {
        sheetId: '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',
        sheetName: 'Videos',
        apiKey: 'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',
        selector: '#htbb-videos',
        modalSelector: '#htbb-video-modal',
    };

    let videos = [];
    let lastFocusedElement = null;


    // ============================================================
    // BASIC HELPERS
    // ============================================================

    const esc = value => {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };


    const normalizeUrl = value => {
        const url = String(value || '').trim();

        if (!url) {
            return '';
        }

        try {
            const parsed = new URL(url);

            if (
                parsed.protocol !== 'http:' &&
                parsed.protocol !== 'https:' &&
                parsed.protocol !== 'mailto:' &&
                parsed.protocol !== 'tel:'
            ) {
                return '';
            }

            return parsed.href;

        } catch {
            return '';
        }
    };


    // ============================================================
    // MANUALLY TYPED SAFE HTML
    // ============================================================

    /**
     * Allows intentionally typed:
     *
     * <strong>
     * <b>
     * <em>
     * <i>
     * <span>
     * <br>
     *
     * Also converts line breaks to <br>.
     */

    const restoreSafeHtml = value => {
        return esc(value)

            .replace(
                /&lt;(\/?(?:em|strong|i|b|span))&gt;/gi,
                '<$1>'
            )

            .replace(
                /&lt;br\s*\/?&gt;/gi,
                '<br>'
            )

            .replace(
                /\r?\n/g,
                '<br>'
            );
    };


    // ============================================================
    // GOOGLE SHEETS RICH TEXT
    // ============================================================

    /**
     * Google Sheets stores formatting for portions of a cell
     * as textFormatRuns.
     *
     * Example:
     *
     * Behind the Scenes of Here There Are Blueberries
     *                      ^^^^^^^^^^^^^^^^^^^^^^^^^^
     *                              italic
     *
     * We convert those runs into semantic HTML.
     */

    const formatTextRun = (text, format = {}, fallbackLink = '') => {
        let output = restoreSafeHtml(text);

        if (!output) {
            return '';
        }

        if (format.bold) {
            output = `<strong>${output}</strong>`;
        }

        if (format.italic) {
            output = `<em>${output}</em>`;
        }

        const link =
            normalizeUrl(
                format.link?.uri ||
                fallbackLink
            );

        if (link) {
            output =
                `<a href="${esc(link)}" ` +
                `target="_blank" ` +
                `rel="noopener noreferrer">` +
                `${output}</a>`;
        }

        return output;
    };


    const cellToHtml = cell => {
        if (!cell) {
            return '';
        }

        const text =
            String(
                cell.formattedValue ?? ''
            );

        if (!text) {
            return '';
        }

        const runs =
            Array.isArray(cell.textFormatRuns)
                ? cell.textFormatRuns
                : [];

        const cellFormat =
            cell.effectiveFormat?.textFormat ||
            {};

        const cellLink =
            cell.hyperlink || '';


        // --------------------------------------------------------
        // NO INDIVIDUAL FORMAT RUNS
        // --------------------------------------------------------

        if (!runs.length) {
            return formatTextRun(
                text,
                cellFormat,
                cellLink
            );
        }


        // --------------------------------------------------------
        // FORMAT RUNS
        // --------------------------------------------------------

        const output = [];

        /**
         * Important:
         *
         * Google startIndex values are UTF-16 indexes.
         * JS String.slice() also operates on UTF-16 code units,
         * so these indexes line up correctly.
         */

        for (
            let i = 0;
            i < runs.length;
            i++
        ) {
            const run = runs[i];

            const start =
                Number(
                    run.startIndex || 0
                );

            const end =
                i + 1 < runs.length
                    ? Number(
                        runs[i + 1].startIndex
                    )
                    : text.length;

            const segment =
                text.slice(
                    start,
                    end
                );

            /**
             * A run inherits the cell-level formatting
             * unless the run explicitly overrides it.
             */

            const runFormat = {
                ...cellFormat,
                ...(run.format || {}),
            };

            output.push(
                formatTextRun(
                    segment,
                    runFormat,
                    ''
                )
            );
        }

        return output.join('');
    };


    const cellText = cell => {
        return String(
            cell?.formattedValue ?? ''
        ).trim();
    };


    // ============================================================
    // GOOGLE DRIVE THUMBNAILS
    // ============================================================

    const getGoogleDriveId = value => {
        const url =
            String(value || '').trim();

        if (!url) {
            return '';
        }

        let match =
            url.match(
                /drive\.google\.com\/file\/d\/([\w-]+)/
            );

        if (match) {
            return match[1];
        }

        try {
            const parsed =
                new URL(url);

            if (
                parsed.hostname.includes(
                    'drive.google.com'
                )
            ) {
                return (
                    parsed.searchParams.get('id') ||
                    ''
                );
            }

        } catch {
            // Ignore.
        }

        return '';
    };


    const normalizeImageUrl = value => {
        const raw =
            String(value || '').trim();

        if (!raw) {
            return '';
        }

        const driveId =
            getGoogleDriveId(raw);

        if (driveId) {
            return (
                `https://drive.google.com/thumbnail` +
                `?id=${encodeURIComponent(driveId)}` +
                `&sz=w1600`
            );
        }

        return normalizeUrl(raw);
    };


    // ============================================================
    // YOUTUBE
    // ============================================================

    const getYouTubeId = value => {
        const raw =
            String(value || '').trim();

        if (!raw) {
            return '';
        }

        try {
            const url =
                new URL(raw);

            const host =
                url.hostname
                    .replace(/^www\./, '')
                    .toLowerCase();

            if (host === 'youtu.be') {
                return (
                    url.pathname
                        .split('/')
                        .filter(Boolean)[0] ||
                    ''
                );
            }

            if (
                host === 'youtube.com' ||
                host === 'm.youtube.com'
            ) {
                if (
                    url.pathname === '/watch'
                ) {
                    return (
                        url.searchParams.get('v') ||
                        ''
                    );
                }

                const parts =
                    url.pathname
                        .split('/')
                        .filter(Boolean);

                if (
                    [
                        'embed',
                        'shorts',
                        'live',
                    ].includes(parts[0])
                ) {
                    return parts[1] || '';
                }
            }

        } catch {
            // Ignore.
        }

        return '';
    };


    // ============================================================
    // VIMEO
    // ============================================================

    const getVimeoId = value => {
        const raw =
            String(value || '').trim();

        if (!raw) {
            return '';
        }

        try {
            const url =
                new URL(raw);

            const host =
                url.hostname
                    .replace(/^www\./, '')
                    .toLowerCase();

            if (
                host !== 'vimeo.com' &&
                host !== 'player.vimeo.com'
            ) {
                return '';
            }

            const parts =
                url.pathname
                    .split('/')
                    .filter(Boolean);

            const id =
                parts.find(part =>
                    /^\d+$/.test(part)
                );

            return id || '';

        } catch {
            return '';
        }
    };


    // ============================================================
    // VIDEO TYPE
    // ============================================================

    const getVideoType = value => {
        const youtubeId =
            getYouTubeId(value);

        if (youtubeId) {
            return {
                type: 'youtube',
                id: youtubeId,
            };
        }

        const vimeoId =
            getVimeoId(value);

        if (vimeoId) {
            return {
                type: 'vimeo',
                id: vimeoId,
            };
        }

        return {
            type: 'external',
            id: '',
        };
    };


    // ============================================================
    // AUTO THUMBNAILS
    // ============================================================

    const getYouTubeThumbnail = id => {
        if (!id) {
            return '';
        }

        return (
            `https://i.ytimg.com/vi/` +
            `${encodeURIComponent(id)}/hqdefault.jpg`
        );
    };


    const getVimeoThumbnail = async url => {
        const videoUrl =
            normalizeUrl(url);

        if (!videoUrl) {
            return '';
        }

        try {
            const endpoint =
                `https://vimeo.com/api/oembed.json` +
                `?url=${encodeURIComponent(videoUrl)}`;

            const response =
                await fetch(endpoint);

            if (!response.ok) {
                throw new Error(
                    `Vimeo thumbnail request failed: ` +
                    `${response.status}`
                );
            }

            const data =
                await response.json();

            return (
                normalizeUrl(
                    data.thumbnail_url
                ) ||
                ''
            );

        } catch (error) {
            console.warn(
                `${MODULE} Could not load Vimeo thumbnail.`,
                error
            );

            return '';
        }
    };


    // ============================================================
    // CATEGORY NORMALIZATION
    // ============================================================

    const categoryKey = value => {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    };


    // ============================================================
    // GOOGLE SHEETS DATA
    // ============================================================

    /**
     * We intentionally use spreadsheets.get + includeGridData
     * instead of /values.
     *
     * /values gives us text only.
     *
     * This gives us:
     * - formattedValue
     * - textFormatRuns
     * - bold
     * - italic
     * - links
     * - cell formatting
     */

    const getVideos = async () => {
        const range =
            encodeURIComponent(
                `${config.sheetName}!A:F`
            );

        const fields =
            encodeURIComponent([
                'sheets.data.rowData.values.formattedValue',
                'sheets.data.rowData.values.hyperlink',
                'sheets.data.rowData.values.textFormatRuns',
                'sheets.data.rowData.values.effectiveFormat.textFormat',
            ].join(','));

        const url =
            `https://sheets.googleapis.com/v4/spreadsheets/` +
            `${config.sheetId}` +
            `?ranges=${range}` +
            `&includeGridData=true` +
            `&fields=${fields}` +
            `&key=${encodeURIComponent(config.apiKey)}`;

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
            data.sheets?.[0]
                ?.data?.[0]
                ?.rowData || [];

        return rows

            // Skip header row.
            .slice(1)

            .map((row, index) => {
                const cells =
                    row.values || [];

                const titleCell =
                    cells[0] || {};

                const descriptionCell =
                    cells[1] || {};

                const url =
                    cellText(cells[2]);

                const link =
                    cellText(cells[3]);

                const category =
                    cellText(cells[4]);

                const thumbnail =
                    cellText(cells[5]);

                const videoType =
                    getVideoType(url);

                return {
                    index,

                    // Plain version is useful for accessibility.
                    title:
                        cellText(titleCell),

                    // Rich HTML version for visual output.
                    titleHtml:
                        cellToHtml(titleCell),

                    description:
                        cellText(descriptionCell),

                    descriptionHtml:
                        cellToHtml(
                            descriptionCell
                        ),

                    url,
                    link,
                    category,
                    thumbnail,

                    type:
                        videoType.type,

                    videoId:
                        videoType.id,
                };
            })

            .filter(video =>
                video.url
            );
    };


    // ============================================================
    // RESOLVE THUMBNAILS
    // ============================================================

    const resolveThumbnail = async video => {
        if (video.thumbnail) {
            return normalizeImageUrl(
                video.thumbnail
            );
        }

        if (
            video.type === 'youtube'
        ) {
            return getYouTubeThumbnail(
                video.videoId
            );
        }

        if (
            video.type === 'vimeo'
        ) {
            return await getVimeoThumbnail(
                video.url
            );
        }

        return '';
    };


    const resolveThumbnails = async items => {
        await Promise.all(
            items.map(async video => {
                video.resolvedThumbnail =
                    await resolveThumbnail(
                        video
                    );
            })
        );
    };


    // ============================================================
    // LINK BEHAVIOR
    // ============================================================

    const usesModal = video => {
        const setting =
            String(video.link || '')
                .trim()
                .toLowerCase();

        return (
            setting === 'modal' &&
            (
                video.type === 'youtube' ||
                video.type === 'vimeo'
            )
        );
    };


    // ============================================================
    // CARD CONTENT
    // ============================================================

    const cardContentHtml = video => {
        const thumbnail =
            video.resolvedThumbnail || '';

        return `
            <div class="htbb-videos__thumbnail">

                ${
                    thumbnail
                        ? `
                            <img
                                class="htbb-videos__image"
                                src="${esc(thumbnail)}"
                                alt=""
                                loading="lazy"
                            >
                        `
                        : `
                            <div
                                class="htbb-videos__placeholder"
                                aria-hidden="true"
                            ></div>
                        `
                }

                <span
                    class="htbb-videos__play"
                    aria-hidden="true"
                >
                    <span></span>
                </span>

            </div>

            <div class="htbb-videos__info">

                ${
                    video.titleHtml
                        ? `
                            <h3 class="htbb-videos__title">
                                ${video.titleHtml}
                            </h3>
                        `
                        : ''
                }

                ${
                    video.descriptionHtml
                        ? `
                            <div class="htbb-videos__description">
                                ${video.descriptionHtml}
                            </div>
                        `
                        : ''
                }

            </div>
        `;
    };


    // ============================================================
    // CARD
    // ============================================================

    const cardHtml = video => {
        const content =
            cardContentHtml(video);

        if (
            usesModal(video)
        ) {
            return `
                <article class="htbb-videos__card">

                    <button
                        class="htbb-videos__link htbb-videos__link--modal"
                        type="button"
                        data-video-index="${video.index}"
                        aria-label="Play ${esc(video.title || 'video')}"
                    >
                        ${content}
                    </button>

                </article>
            `;
        }

        const url =
            normalizeUrl(
                video.url
            );

        if (url) {
            return `
                <article class="htbb-videos__card">

                    <a
                        class="htbb-videos__link htbb-videos__link--external"
                        href="${esc(url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        ${content}
                    </a>

                </article>
            `;
        }

        return `
            <article class="htbb-videos__card">
                ${content}
            </article>
        `;
    };


    // ============================================================
    // GROUP CATEGORIES
    // ============================================================

    const groupVideos = items => {
        const groups =
            new Map();

        items.forEach(video => {
            const label =
                video.category ||
                'Videos';

            const key =
                categoryKey(label);

            if (
                !groups.has(key)
            ) {
                groups.set(
                    key,
                    {
                        label,
                        videos: [],
                    }
                );
            }

            groups
                .get(key)
                .videos
                .push(video);
        });

        return Array.from(
            groups.values()
        );
    };


    // ============================================================
    // CATEGORY
    // ============================================================

    const categoryHtml = group => {
        return `
            <section class="htbb-videos__category">

                <div class="header-bar">
                    <h2>${esc(group.label)}</h2>
                </div>

                <div class="htbb-videos__grid">

                    ${
                        group.videos
                            .map(cardHtml)
                            .join('')
                    }

                </div>

            </section>
        `;
    };


    // ============================================================
    // RENDER
    // ============================================================

    const renderVideos = container => {
        const target =
            container.querySelector(
                '.htbb-videos__categories'
            ) ||
            container;

        const groups =
            groupVideos(videos);

        target.innerHTML =
            groups
                .map(categoryHtml)
                .join('');
    };


    // ============================================================
    // VIDEO EMBED
    // ============================================================

    const embedHtml = video => {
        if (
            video.type === 'youtube'
        ) {
            return `
                <iframe
                    src="https://www.youtube.com/embed/${esc(video.videoId)}?autoplay=1&rel=0"
                    title="${esc(video.title || 'YouTube video')}"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowfullscreen
                ></iframe>
            `;
        }

        if (
            video.type === 'vimeo'
        ) {
            return `
                <iframe
                    src="https://player.vimeo.com/video/${esc(video.videoId)}?autoplay=1"
                    title="${esc(video.title || 'Vimeo video')}"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen
                ></iframe>
            `;
        }

        return '';
    };


    // ============================================================
    // OPEN MODAL
    // ============================================================

    const openModal = (
        video,
        trigger
    ) => {
        const modal =
            document.querySelector(
                config.modalSelector
            );

        if (
            !modal ||
            !usesModal(video)
        ) {
            return;
        }

        const content =
            modal.querySelector(
                '.htbb-video-modal__content'
            );

        if (!content) {
            return;
        }

        lastFocusedElement =
            trigger || null;

        content.innerHTML =
            embedHtml(video);

        modal.classList.add(
            'is-open'
        );

        modal.setAttribute(
            'aria-hidden',
            'false'
        );

        document.body.classList.add(
            'htbb-video-modal-open'
        );

        const closeButton =
            modal.querySelector(
                '.htbb-video-modal__close'
            );

        if (closeButton) {
            requestAnimationFrame(() => {
                closeButton.focus();
            });
        }
    };


    // ============================================================
    // CLOSE MODAL
    // ============================================================

    const closeModal = () => {
        const modal =
            document.querySelector(
                config.modalSelector
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
            'htbb-video-modal-open'
        );

        const content =
            modal.querySelector(
                '.htbb-video-modal__content'
            );

        if (content) {
            // Removing the iframe stops playback immediately.
            content.innerHTML = '';
        }

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


    // ============================================================
    // EVENTS
    // ============================================================

    const bindEvents = container => {
        const modal =
            document.querySelector(
                config.modalSelector
            );

        container.addEventListener(
            'click',
            event => {
                const button =
                    event.target.closest(
                        '[data-video-index]'
                    );

                if (!button) {
                    return;
                }

                const index =
                    Number(
                        button.dataset.videoIndex
                    );

                const video =
                    videos.find(
                        item =>
                            item.index === index
                    );

                if (!video) {
                    return;
                }

                openModal(
                    video,
                    button
                );
            }
        );

        if (!modal) {
            return;
        }

        modal.addEventListener(
            'click',
            event => {
                if (
                    event.target.closest(
                        '.htbb-video-modal__close'
                    )
                ) {
                    closeModal();
                    return;
                }

                if (
                    event.target.classList.contains(
                        'htbb-video-modal__overlay'
                    )
                ) {
                    closeModal();
                }
            }
        );

        document.addEventListener(
            'keydown',
            event => {
                if (
                    event.key !== 'Escape' ||
                    !modal.classList.contains(
                        'is-open'
                    )
                ) {
                    return;
                }

                closeModal();
            }
        );
    };


    // ============================================================
    // INIT
    // ============================================================

    const init = async () => {
        const container =
            document.querySelector(
                config.selector
            );

        if (!container) {
            return;
        }

        container.setAttribute(
            'aria-busy',
            'true'
        );

        try {
            videos =
                await getVideos();

            console.log(
                `${MODULE} Loaded ${videos.length} video(s).`,
                videos
            );

            if (!videos.length) {
                container.hidden =
                    true;

                return;
            }

            await resolveThumbnails(
                videos
            );

            renderVideos(
                container
            );

            bindEvents(
                container
            );

        } catch (error) {
            console.error(
                `${MODULE} Unable to load videos.`,
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


    // ============================================================
    // START
    // ============================================================

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