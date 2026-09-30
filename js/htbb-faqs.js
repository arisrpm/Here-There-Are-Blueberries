(() => {
	'use strict';

	/**
	 * HTBB — FAQ
	 * Google Sheets + Accessible Accordion
	 *
	 * Sheet columns:
	 *
	 * A = QUESTION
	 * B = ANSWER
	 *
	 * Supported HTML entered directly into Google Sheets:
	 *
	 * <a href="https://example.com">Link</a>
	 * <br>
	 * <em>...</em>
	 * <i>...</i>
	 * <strong>...</strong>
	 * <b>...</b>
	 * <span>...</span>
	 * <small>...</small>
	 * <sup>...</sup>
	 * <sub>...</sub>
	 * <u>...</u>
	 * <p>...</p>
	 * <ul>...</ul>
	 * <ol>...</ol>
	 * <li>...</li>
	 *
	 * Unsafe tags and attributes are removed.
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

			/*
			 * Allow relative links as well as absolute URLs.
			 * Using the current page as the base lets:
			 *
			 * /tickets
			 * #section
			 *
			 * remain valid.
			 */

			const parsed =
				new URL(
					url,
					window.location.href
				);

			if (
				parsed.protocol !== 'http:' &&
				parsed.protocol !== 'https:'
			) {
				return '';
			}

			/*
			 * Preserve relative/hash links exactly as entered.
			 */

			if (
				url.startsWith('/') ||
				url.startsWith('#')
			) {
				return url;
			}

			return parsed.href;

		} catch {
			return '';
		}
	};


	// ------------------------------------------------------------
	// SAFE HTML
	// ------------------------------------------------------------

	const ALLOWED_TAGS =
		new Set([
			'A',
			'BR',
			'EM',
			'I',
			'STRONG',
			'B',
			'SPAN',
			'SMALL',
			'SUP',
			'SUB',
			'U',
			'P',
			'UL',
			'OL',
			'LI',
		]);


	/**
	 * Convert a parsed DOM node back into safe HTML.
	 *
	 * This gives us more control than a regex because
	 * links contain attributes such as href and target.
	 */
	const sanitizeNode = node => {

		// Plain text.
		if (
			node.nodeType ===
			Node.TEXT_NODE
		) {
			return esc(
				node.nodeValue
			);
		}


		// Ignore comments, scripts, etc.
		if (
			node.nodeType !==
			Node.ELEMENT_NODE
		) {
			return '';
		}


		const tag =
			node.tagName.toUpperCase();


		/*
		 * Process children first.
		 */
		const inner =
			Array
				.from(
					node.childNodes
				)
				.map(
					sanitizeNode
				)
				.join('');


		/*
		 * If the tag isn't approved, remove the tag
		 * itself but keep its text/content.
		 */
		if (
			!ALLOWED_TAGS.has(tag)
		) {
			return inner;
		}


		// ----------------------------------------
		// BR
		// ----------------------------------------

		if (
			tag === 'BR'
		) {
			return '<br>';
		}


		// ----------------------------------------
		// LINKS
		// ----------------------------------------

		if (
			tag === 'A'
		) {

			const href =
				normalizeUrl(
					node.getAttribute(
						'href'
					)
				);

			/*
			 * Bad/missing URL:
			 * keep link text, remove the link.
			 */
			if (!href) {
				return inner;
			}


			const target =
				node.getAttribute(
					'target'
				);


			/*
			 * Only honor _blank.
			 * Otherwise the link behaves normally.
			 */
			if (
				target === '_blank'
			) {

				return (
					`<a ` +
					`href="${esc(href)}" ` +
					`target="_blank" ` +
					`rel="noopener noreferrer">` +
					`${inner}` +
					`</a>`
				);
			}


			return (
				`<a href="${esc(href)}">` +
				`${inner}` +
				`</a>`
			);
		}


		// ----------------------------------------
		// SAFE FORMATTING TAGS
		// ----------------------------------------

		const safeTag =
			tag.toLowerCase();

		return (
			`<${safeTag}>` +
			`${inner}` +
			`</${safeTag}>`
		);
	};


	/**
	 * Parse HTML entered into Google Sheets,
	 * sanitize it, and return safe markup.
	 */
	const richText = value => {

		const raw =
			String(
				value || ''
			);

		if (!raw) {
			return '';
		}


		const doc =
			new DOMParser()
				.parseFromString(
					`<div id="htbb-rich-text">${raw}</div>`,
					'text/html'
				);


		const root =
			doc.getElementById(
				'htbb-rich-text'
			);

		if (!root) {
			return esc(raw);
		}


		return Array
			.from(
				root.childNodes
			)
			.map(
				sanitizeNode
			)
			.join('');
	};


	// ------------------------------------------------------------
	// FORMAT ANSWER
	// ------------------------------------------------------------

	const formatAnswer = value => {

		/*
		 * Preserve normal line breaks entered into
		 * Google Sheets.
		 *
		 * Existing <br> tags are handled separately
		 * by richText().
		 */

		const raw =
			String(
				value || ''
			)
				.replace(
					/\r\n?/g,
					'\n'
				);


		/*
		 * Convert literal line breaks to <br> BEFORE
		 * parsing/sanitizing the HTML.
		 */

		return richText(
			raw.replace(
				/\n/g,
				'<br>'
			)
		);
	};


	// ------------------------------------------------------------
	// GET FAQS
	// ------------------------------------------------------------

	const getFAQs = async () => {

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
				`Google Sheets request failed: ` +
				`${response.status}`
			);
		}


		const data =
			await response.json();


		const rows =
			data.values || [];


		/*
		 * Row 1:
		 *
		 * QUESTION | ANSWER
		 */

		return rows
			.slice(1)

			.map(row => {

				return {

					question:
						String(
							row[0] || ''
						).trim(),

					answer:
						String(
							row[1] || ''
						).trim(),
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
							${richText(faq.question)}
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
						${formatAnswer(faq.answer)}
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


				/*
				 * Close any currently open FAQ
				 * before opening the new one.
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

							setItemOpen(
								other,
								false
							);

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
					.map(
						renderItem
					)
					.join('');


			bindEvents(
				container
			);


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