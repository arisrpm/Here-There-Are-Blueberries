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
     *
     * Supported video providers:
     * YouTube
     * Vimeo
     */

    const MODULE = '[HTBB Videos]';


    // ------------------------------------------------------------
    // CONFIG
    // ------------------------------------------------------------

    const config = {

        sheetId:
            '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',

        sheetName:
            'Videos',

        apiKey:
            'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',

        range:
            'A:F',

        selector:
            '#htbb-videos',

        modalSelector:
            '#htbb-video-modal',

    };


    let videos = [];

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


    // ------------------------------------------------------------
    // SAFE RICH TEXT
    // ------------------------------------------------------------

    /**
     * Allows basic formatting inside title/description fields.
     *
     * Supported:
     *
     * <br>
     * <em>
     * <i>
     * <strong>
     * <b>
     * <span>
     */

    const richText = value => {

        return esc(value)

            .replace(
                /&lt;(\/?(?:em|strong|i|b|span)\s*)&gt;/gi,
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


    // ------------------------------------------------------------
    // GOOGLE DRIVE THUMBNAILS
    // ------------------------------------------------------------

    const getGoogleDriveId = value => {

        const url =
            String(value || '').trim();

        if (!url) {
            return '';
        }


        // /file/d/FILE_ID/

        let match =
            url.match(
                /drive\.google\.com\/file\/d\/([\w-]+)/
            );

        if (match) {
            return match[1];
        }


        // ?id=FILE_ID

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
            // Ignore invalid URL.
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


    // ------------------------------------------------------------
    // YOUTUBE
    // ------------------------------------------------------------

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


            // youtu.be/VIDEO_ID

            if (
                host === 'youtu.be'
            ) {

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

                // youtube.com/watch?v=VIDEO_ID

                if (
                    url.pathname === '/watch'
                ) {

                    return (
                        url.searchParams.get('v') ||
                        ''
                    );
                }


                // youtube.com/embed/VIDEO_ID
                // youtube.com/shorts/VIDEO_ID
                // youtube.com/live/VIDEO_ID

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

                    return (
                        parts[1] ||
                        ''
                    );
                }
            }

        } catch {
            // Ignore.
        }


        return '';
    };


    // ------------------------------------------------------------
    // VIMEO
    // ------------------------------------------------------------

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


            /**
             * Handles:
             *
             * vimeo.com/123456
             * player.vimeo.com/video/123456
             */

            const id =
                parts.find(part =>
                    /^\d+$/.test(part)
                );

            return id || '';

        } catch {

            return '';

        }
    };


    // ------------------------------------------------------------
    // VIDEO TYPE
    // ------------------------------------------------------------

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


    // ------------------------------------------------------------
    // AUTO THUMBNAIL
    // ------------------------------------------------------------

    const getYouTubeThumbnail = id => {

        if (!id) {
            return '';
        }

        return (
            `https://i.ytimg.com/vi/` +
            `${encodeURIComponent(id)}/hqdefault.jpg`
        );
    };


    /**
     * Vimeo doesn't expose a predictable static thumbnail
     * URL from the video ID alone.
     *
     * We use Vimeo's oEmbed endpoint to retrieve it.
     */

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


    // ------------------------------------------------------------
    // CATEGORY NORMALIZATION
    // ------------------------------------------------------------

    /**
     * "Further Learning"
     * "further learning"
     * " Further   Learning "
     *
     * all become the same grouping key.
     *
     * We still DISPLAY the spelling/capitalization
     * from the first occurrence in the Sheet.
     */

    const categoryKey = value => {

        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    };


    // ------------------------------------------------------------
    // GOOGLE SHEETS
    // ------------------------------------------------------------

    const getVideos = async () => {

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

            // Skip header.
            .slice(1)

            .map((row, index) => {

                const url =
                    String(
                        row[2] || ''
                    ).trim();

                const type =
                    getVideoType(url);

                return {

                    index,

                    title:
                        String(
                            row[0] || ''
                        ).trim(),

                    description:
                        String(
                            row[1] || ''
                        ).trim(),

                    url,

                    link:
                        String(
                            row[3] || ''
                        ).trim(),

                    category:
                        String(
                            row[4] || ''
                        ).trim(),

                    thumbnail:
                        String(
                            row[5] || ''
                        ).trim(),

                    type:
                        type.type,

                    videoId:
                        type.id,

                };

            })

            // A URL is required.
            .filter(video =>
                video.url
            );
    };


    // ------------------------------------------------------------
    // RESOLVE THUMBNAILS
    // ------------------------------------------------------------

    const resolveThumbnail = async video => {

        /**
         * Custom thumbnail always wins.
         */

        if (video.thumbnail) {

            return (
                normalizeImageUrl(
                    video.thumbnail
                )
            );
        }


        // YouTube automatic thumbnail.

        if (
            video.type === 'youtube'
        ) {

            return (
                getYouTubeThumbnail(
                    video.videoId
                )
            );
        }


        // Vimeo automatic thumbnail.

        if (
            video.type === 'vimeo'
        ) {

            return (
                await getVimeoThumbnail(
                    video.url
                )
            );
        }


        return '';
    };


    const resolveThumbnails = async items => {

        await Promise.all(

            items.map(
                async video => {

                    video.resolvedThumbnail =
                        await resolveThumbnail(
                            video
                        );
                }
            )
        );
    };


    // ------------------------------------------------------------
    // LINK BEHAVIOR
    // ------------------------------------------------------------

    const usesModal = video => {

        const setting =
            String(
                video.link || ''
            )
                .trim()
                .toLowerCase();


        /**
         * Only YouTube/Vimeo can use our video modal.
         */

        return (
            setting === 'modal' &&
            (
                video.type === 'youtube' ||
                video.type === 'vimeo'
            )
        );
    };


    // ------------------------------------------------------------
    // CARD CONTENT
    // ------------------------------------------------------------

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
                    video.title
                        ? `
                            <h3 class="htbb-videos__title">
                                ${richText(video.title)}
                            </h3>
                        `
                        : ''
                }

                ${
                    video.description
                        ? `
                            <div class="htbb-videos__description">
                                ${richText(video.description)}
                            </div>
                        `
                        : ''
                }

            </div>
        `;
    };


    // ------------------------------------------------------------
    // CARD
    // ------------------------------------------------------------

    const cardHtml = video => {

        const content =
            cardContentHtml(video);


        // ----------------------------------------
        // MODAL
        // ----------------------------------------

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


        // ----------------------------------------
        // EXTERNAL LINK
        // ----------------------------------------

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


    // ------------------------------------------------------------
    // GROUP CATEGORIES
    // ------------------------------------------------------------

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


    // ------------------------------------------------------------
    // CATEGORY
    // ------------------------------------------------------------

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


    // ------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------

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


    // ------------------------------------------------------------
    // VIDEO EMBED
    // ------------------------------------------------------------

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


    // ------------------------------------------------------------
    // OPEN MODAL
    // ------------------------------------------------------------

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


    // ------------------------------------------------------------
    // CLOSE MODAL
    // ------------------------------------------------------------

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


        /**
         * Removing iframe stops video/audio immediately.
         */

        const content =
            modal.querySelector(
                '.htbb-video-modal__content'
            );

        if (content) {
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


    // ------------------------------------------------------------
    // EVENTS
    // ------------------------------------------------------------

    const bindEvents = container => {

        const modal =
            document.querySelector(
                config.modalSelector
            );


        // Video cards.

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


        // Modal click controls.

        modal.addEventListener(
            'click',
            event => {


                // Close button.

                if (
                    event.target.closest(
                        '.htbb-video-modal__close'
                    )
                ) {

                    closeModal();

                    return;
                }


                // Overlay.

                if (
                    event.target.classList.contains(
                        'htbb-video-modal__overlay'
                    )
                ) {

                    closeModal();
                }
            }
        );


        // Escape.

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


    // ------------------------------------------------------------
    // INIT
    // ------------------------------------------------------------

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