(() => {
	'use strict';

	/**
	 * FAQ Accordion
	 * Google Sheets + Accessible Accordion
	 *
	 * Supported HTML entered directly into Google Sheets:
	 *
	 * <br>
	 * <em>...</em>
	 * <i>...</i>
	 * <strong>...</strong>
	 * <b>...</b>
	 *
	 * All other HTML is escaped for safety.
	 */

	const MODULE = '[FAQ]';

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
			'#bc-faq',

		// false = opening one answer closes the others.
		allowMultiple:
			false,
	};

	// ------------------------------------------------------------
	// SAFE RICH TEXT
	// ------------------------------------------------------------

	/**
	 * Escape everything first, then restore only the
	 * small list of HTML tags we explicitly allow.
	 */
	const richText = value => {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;')

			// <em>, </em>, <i>, </i>,
			// <strong>, </strong>, <b>, </b>
			.replace(
				/&lt;(\/?(?:em|strong|i|b)\s*)&gt;/gi,
				'<$1>'
			)

			// <br>, <br/>, <br />
			.replace(
				/&lt;br\s*\/?&gt;/gi,
				'<br>'
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
		 * QUESTION | ANSWER
		 *
		 * So skip it.
		 */
		return rows
			.slice(1)
			.map(row => {
				return {
					question:
						String(row[0] || '').trim(),

					answer:
						String(row[1] || '').trim(),
				};
			})
			.filter(item =>
				item.question &&
				item.answer
			);
	};

	// ------------------------------------------------------------
	// FORMAT ANSWER
	// ------------------------------------------------------------

	const formatAnswer = value => {
		/**
		 * Preserve normal line breaks from the Sheet
		 * in addition to explicitly entered <br> tags.
		 */
		return richText(value)
			.replace(/\r?\n/g, '<br>');
	};

	// ------------------------------------------------------------
	// RENDER ITEM
	// ------------------------------------------------------------

	const renderItem = (
		faq,
		index
	) => {
		const questionId =
			`bc-faq-question-${index}`;

		const answerId =
			`bc-faq-answer-${index}`;

		return `
			<div class="bc-faq__item">

				<h3 class="bc-faq__heading">
					<button
						class="bc-faq__question"
						type="button"
						id="${questionId}"
						aria-expanded="false"
						aria-controls="${answerId}"
					>
						<span class="bc-faq__label">
							${richText(faq.question)}
						</span>

						<span
							class="bc-faq__icon"
							aria-hidden="true"
						></span>
					</button>
				</h3>

				<div
					class="bc-faq__answer"
					id="${answerId}"
					role="region"
					aria-labelledby="${questionId}"
					hidden
				>
					<div class="bc-faq__answer-inner">
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
						'.bc-faq__question'
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

				if (
					!config.allowMultiple &&
					!isOpen
				) {
					container
						.querySelectorAll(
							'.bc-faq__question[aria-expanded="true"]'
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
				container.hidden = true;

				return;
			}

			container.innerHTML =
				faqs
					.map(renderItem)
					.join('');

			bindEvents(container);

		} catch (error) {

			console.error(
				`${MODULE} Unable to load FAQs.`,
				error
			);

			container.hidden = true;

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