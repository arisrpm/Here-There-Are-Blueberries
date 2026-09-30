(() => {
    'use strict';

    /**
     * HTBB — FAQ
     * Google Sheets + Accessible Accordion
     *
     * Supports native Google Sheets formatting:
     *
     * - Hyperlinks
     * - Bold
     * - Italic
     * - Bold + Italic
     * - Line breaks
     *
     * Also supports manually entered safe HTML:
     *
     * <br>
     * <em>...</em>
     * <i>...</i>
     * <strong>...</strong>
     * <b>...</b>
     * <span>...</span>
     * <a href="...">...</a>
     */

    const MODULE = '[HTBB FAQ]';


    // ------------------------------------------------------------
    // CONFIG
    // ------------------------------------------------------------

    const config = {
        sheetId:
            '19QAEno8goOYyxhKlsl3Q8SpZRmsWZXRYaazUUkrJIjk',

        sheetName:
            'FAQs',

        apiKey:
            'AIzaSyDbiZYZBlzvpHdDUWtVs76H3akcKuD-qQE',

        selector:
            '#htbb-faq',

        // false = opening one answer closes the others.
        allowMultiple:
            false,
    };


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


    // ------------------------------------------------------------
    // MANUALLY ENTERED HTML
    // ------------------------------------------------------------

    /**
     * This is retained so manually entered HTML still works.
     *
     * Native Google Sheets formatting does NOT require HTML.
     */

    const restoreSafeHtml = value => {

        return esc(value)

            // Basic formatting.
            .replace(
                /&lt;(\/?(?:em|strong|i|b|span)\s*)&gt;/gi,
                '<$1>'
            )

            // BR.
            .replace(
                /&lt;br\s*\/?&gt;/gi,
                '<br>'
            )

            // Safe manually entered links.
            .replace(
                /&lt;a\s+href=(?:&quot;|&#039;)(https?:\/\/[^"'<>]+?)(?:&quot;|&#039;)\s*&gt;([\s\S]*?)&lt;\/a&gt;/gi,
                (_, href, text) => {

                    const safeUrl =
                        normalizeUrl(href);

                    if (!safeUrl) {
                        return text;
                    }

                    return (
                        `<a ` +
                        `href="${esc(safeUrl)}" ` +
                        `target="_blank" ` +
                        `rel="noopener noreferrer">` +
                        `${text}` +
                        `</a>`
                    );
                }
            );
    };


    // ------------------------------------------------------------
    // GOOGLE SHEETS RICH TEXT
    // ------------------------------------------------------------

    /**
     * Convert one portion of a Google Sheets cell into HTML.
     */

    const formatRun = (
        text,
        format = {},
        link = ''
    ) => {

        if (!text) {
            return '';
        }

        let html =
            restoreSafeHtml(text)
                .replace(/\r?\n/g, '<br>');


        // Native Google Sheets italic.
        if (format.italic) {
            html =
                `<em>${html}</em>`;
        }


        // Native Google Sheets bold.
        if (format.bold) {
            html =
                `<strong>${html}</strong>`;
        }


        // Native Google Sheets hyperlink.
        const safeLink =
            normalizeUrl(link);

        if (safeLink) {

            html =
                `<a ` +
                `href="${esc(safeLink)}" ` +
                `target="_blank" ` +
                `rel="noopener noreferrer">` +
                `${html}` +
                `</a>`;
        }

        return html;
    };


    /**
     * Convert a Google Sheets cell into HTML.
     *
     * Sheets supplies:
     *
     * formattedValue
     * textFormatRuns[]
     *
     * Each run tells us where formatting changes.
     */

    const cellToHtml = cell => {

        if (!cell) {
            return '';
        }

        const value =
            String(
                cell.formattedValue ??
                cell.effectiveValue?.stringValue ??
                ''
            );


        if (!value) {
            return '';
        }


        const runs =
            Array.isArray(
                cell.textFormatRuns
            )
                ? cell.textFormatRuns
                : [];


        /**
         * Entire-cell hyperlink.
         *
         * Sheets may store a hyperlink here instead
         * of inside a textFormatRun.
         */
        const cellLink =
            cell.hyperlink || '';


        /**
         * No rich-text runs.
         *
         * Use the cell's base formatting.
         */
        if (!runs.length) {

            const format =
                cell.effectiveFormat
                    ?.textFormat || {};

            return formatRun(
                value,
                format,
                cellLink
            );
        }


        let html = '';


        for (
            let i = 0;
            i < runs.length;
            i++
        ) {

            const run =
                runs[i];

            const start =
                run.startIndex || 0;

            const end =
                i + 1 < runs.length
                    ? runs[i + 1].startIndex
                    : value.length;

            const text =
                value.slice(
                    start,
                    end
                );

            const format =
                run.format || {};


            /**
             * Google Sheets stores native links inside
             * the run's format.link.uri.
             */

            const link =
                format.link?.uri ||
                cellLink ||
                '';

            html +=
                formatRun(
                    text,
                    format,
                    link
                );
        }

        return html;
    };


    // ------------------------------------------------------------
    // GOOGLE SHEETS
    // ------------------------------------------------------------

    const getFAQs = async () => {

        /**
         * IMPORTANT:
         *
         * We're intentionally using the spreadsheets endpoint
         * instead of /values/.
         *
         * /values/ strips rich-text hyperlink information.
         */

        const range =
            encodeURIComponent(
                `${config.sheetName}!A:B`
            );

        const fields =
            encodeURIComponent(
                [
                    'sheets.data.rowData.values.formattedValue',
                    'sheets.data.rowData.values.effectiveValue',
                    'sheets.data.rowData.values.hyperlink',
                    'sheets.data.rowData.values.textFormatRuns',
                    'sheets.data.rowData.values.effectiveFormat.textFormat',
                ].join(',')
            );

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

            const errorText =
                await response.text();

            throw new Error(
                `Google Sheets request failed: ` +
                `${response.status} ${errorText}`
            );
        }


        const data =
            await response.json();


        const rows =
            data
                ?.sheets?.[0]
                ?.data?.[0]
                ?.rowData ||
            [];


        /**
         * Row 1:
         *
         * QUESTION | ANSWER
         *
         * Skip header row.
         */

        return rows
            .slice(1)

            .map(row => {

                const questionCell =
                    row.values?.[0];

                const answerCell =
                    row.values?.[1];


                const questionText =
                    String(
                        questionCell?.formattedValue ||
                        ''
                    ).trim();


                const answerText =
                    String(
                        answerCell?.formattedValue ||
                        ''
                    ).trim();


                return {

                    question:
                        questionText,

                    questionHtml:
                        cellToHtml(
                            questionCell
                        ),

                    answer:
                        answerText,

                    answerHtml:
                        cellToHtml(
                            answerCell
                        ),
                };
            })

            .filter(item =>
                item.question &&
                item.answer
            );
    };


    // ------------------------------------------------------------
    // RENDER ITEM
    // ------------------------------------------------------------

    const renderItem = (
        faq,
        index
    ) => {

        const questionId =
            `htbb-faq-question-${index}`;

        const answerId =
            `htbb-faq-answer-${index}`;


        return `
            <div class="htbb-faq__item">

                <h3 class="htbb-faq__heading">

                    <button
                        class="htbb-faq__question"
                        type="button"
                        id="${questionId}"
                        aria-expanded="false"
                        aria-controls="${answerId}"
                    >

                        <span class="htbb-faq__label">
                            ${faq.questionHtml}
                        </span>

                        <span
                            class="htbb-faq__icon"
                            aria-hidden="true"
                        ></span>

                    </button>

                </h3>


                <div
                    class="htbb-faq__answer"
                    id="${answerId}"
                    role="region"
                    aria-labelledby="${questionId}"
                    hidden
                >

                    <div class="htbb-faq__answer-inner">
                        ${faq.answerHtml}
                    </div>

                </div>

            </div>
        `;
    };


    // ------------------------------------------------------------
    // OPEN / CLOSE
    // ------------------------------------------------------------

    const setItemOpen = (
        button,
        open
    ) => {

        const answer =
            document.getElementById(
                button.getAttribute(
                    'aria-controls'
                )
            );


        if (!answer) {
            return;
        }


        button.setAttribute(
            'aria-expanded',
            String(open)
        );


        answer.hidden =
            !open;
    };


    // ------------------------------------------------------------
    // EVENTS
    // ------------------------------------------------------------

    const bindEvents = container => {

        container.addEventListener(
            'click',
            event => {

                const button =
                    event.target.closest(
                        '.htbb-faq__question'
                    );


                if (
                    !button ||
                    !container.contains(button)
                ) {
                    return;
                }


                const isOpen =
                    button.getAttribute(
                        'aria-expanded'
                    ) === 'true';


                /**
                 * Close currently open FAQ
                 * when multiple answers are disabled.
                 */

                if (
                    !config.allowMultiple &&
                    !isOpen
                ) {

                    container
                        .querySelectorAll(
                            '.htbb-faq__question[aria-expanded="true"]'
                        )

                        .forEach(other => {

                            if (
                                other !== button
                            ) {

                                setItemOpen(
                                    other,
                                    false
                                );
                            }
                        });
                }


                setItemOpen(
                    button,
                    !isOpen
                );
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


        container.classList.add(
            'is-loading'
        );


        container.setAttribute(
            'aria-busy',
            'true'
        );


        try {

            const faqs =
                await getFAQs();


            console.log(
                `${MODULE} Loaded ${faqs.length} FAQ(s).`,
                faqs
            );


            if (!faqs.length) {

                container.hidden =
                    true;

                return;
            }


            container.innerHTML =
                faqs
                    .map(renderItem)
                    .join('');


            bindEvents(
                container
            );


            container.hidden =
                false;


        } catch (error) {

            console.error(
                `${MODULE} Unable to load FAQs.`,
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