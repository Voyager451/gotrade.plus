var goTradePlus = function () {
	"use strict";

	var timeagoInstance = timeago();
	var timeago_nodes = document.getElementsByClassName('timeago');
	timeagoInstance.render(timeago_nodes);

	var loading_dots = '<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
	var _path = window.location.pathname;

	// js native function decodeURIComponent does the job but does not remove +
	function decodeURIPlus(str) {
		return decodeURIComponent(str.split('+').join('%20'));
	}

	/***** Parse URL Parameters (?type=1, etc) ******/

	var urlParams = {};

	(window.onpopstate = function () {
		var match,
			search = /([^&=]+)=?([^&]*)/g,
			query = window.location.search.substring(1);

		while (match = search.exec(query)) {
			urlParams[decodeURIPlus(match[1])] = decodeURIPlus(match[2]);
		}
	})();

	// check if browser storage is available
	function storageAvailable(type) {

		try {

			var storage = window[type],
				x = '__storage_test__';

			storage.setItem(x, x);
			storage.removeItem(x);

			return true;
		}
		catch (e) {
			return false;
		}
	}

	var localStorageAvailable = storageAvailable('localStorage');

	/**** Redirect to another URL ****/
	function urlRedirect(path, external) {

		external = external || 0;

		if (!external) {
			window.location.href = "https://" + window.location.hostname + path;
		} else {
			window.location.href = path;
		}
	}

	/************* Highlight New Trades ************/

	// highlight new trades on page load based on URI query ?hl=#
	(function highlightNewTrades() {

		var queries = location.search;

		if (queries.indexOf('hl=') !== -1) {

			var total_highlight = queries.substring(queries.lastIndexOf('=') + 1);

			if (total_highlight != undefined && total_highlight > 0) {

				var subtract_by,
					document_path = '/';

				// remove hl=# from queries
				if (_path == '/') {

					// home page
					subtract_by = 3;
					document_path = '/';

				} else {

					// search page
					subtract_by = 1;
					document_path = '/search';
				}

				queries = queries.substring(0, queries.indexOf('hl=') - subtract_by);
				window.history.pushState({}, document.title, document_path + queries);

				// highlight new trades
				var trades = document.getElementsByClassName('trade-row');

				for (var i = 0; i < total_highlight; i++) {
					trades[i].classList.add('highlight');
				}
			}
		}
	})();

	/***** Search Tips *****/

	var search_tips_link = document.querySelector('.search-tips-link'),
			search_tips_body = document.querySelector('.search-tips-body');

	if (search_tips_link !== null) {
		search_tips_link.addEventListener('click', function () {
			openSearchTips();
		});
	}

	function openSearchTips() {

		var open = search_tips_link.parentNode.getAttribute('data-opened');

		if (open === "1") {
			search_tips_body.style.display = 'none';
			search_tips_link.parentNode.setAttribute('data-opened', "0");
		} else {
			search_tips_body.style.display = 'block';
			search_tips_link.parentNode.setAttribute('data-opened', "1");
		}
	}

	/************** Parse Trade Body ****************/

	var showImgBtn = ' <button class="trade-body-img-open btn btn-sm btn-primary" title="Show Image" data-opened="0">+</button>';

	function parseTradeBody(data) {

		// parse tables
		var tables = data.trade_body.getElementsByTagName('table');
		for (var i = 0; i < tables.length; i++) {
			tables[i].className = 'table-responsive-xl table-striped';
		}

		// parse links
		var links = data.trade_body.getElementsByTagName('a');

		for (var i = 0; i < links.length; i++) {

			var link = links[i];

			// add open img inline buttons (+/-) next to images
			if (
				(link.getAttribute('href') !== 'undefined')
				&& (
					link.getAttribute('href').indexOf('.png') !== -1
					|| link.getAttribute('href').indexOf('.jpg') !== -1
					|| link.getAttribute('href').indexOf('.jpeg') !== -1
					|| link.getAttribute('href').indexOf('.gif') !== -1
				)
			) {
				link.insertAdjacentHTML('afterend', showImgBtn);
			}
		}

		// Handle closed/open and trade url verification tags
		handleLiveRedditStates(data);
	}

	// handle +/- image show/hide button clicks
	function handleInlineImgBtnClicks(e) {
		e.stopPropagation();

		var btn = e.target;
		var plus_or_minus = btn.textContent;

		if (plus_or_minus == '+') {
			btn.textContent = '-';
			// insert image
			var img_src = btn.previousElementSibling.getAttribute('href');
			btn.insertAdjacentHTML('afterend', '<div class="trade-body-img-wrap"><img src="' + img_src + '" /></div>');

		} else {
			btn.textContent = '+';
			// remove image
			btn.parentNode.removeChild(btn.nextElementSibling);
		}
	}

	// remove inline image when it is clicked on
	function handleInlineImgClicks(e) {
		e.stopPropagation();
		// change button text from - to +
		e.currentTarget.previousSibling.textContent = '+';
		// remove image
		e.currentTarget.parentNode.removeChild(e.currentTarget);
	}

    /**
     * Fetch live data from Reddit to see if trade still open and also fetch user flair/steamid
     * @param data
     */
	function handleLiveRedditStates(data) {

        if (data.trade_steamid !== "0") {
            verifyTradeUrls(data.trade_steamid, data.trade_body.getElementsByTagName('a'), data.trade_closed);
        }

        if (data.trade_closed === "0" || data.trade_steamid === "0") {

            // get article id from trade link
            // (prepended to it before first forward-slash as alpha-num characters: "74dtn8/...")
            var article_id = data.trade_link.substring(0, data.trade_link.indexOf('/'));

            _ajax({
                type: 'POST',
                url: 'ajax/get_trade_live_data',
                data: {id: data.trade_id, article_id: article_id},

                success: function (response) {
                    try {
                        response = JSON.parse(response);

                        if (response.status == 1) {
                        	if (data.trade_closed === "0") {
                                if (response.closed == 1) {
                                    data.trade_closed_elem.innerHTML = '<b class="trade-closed" title="This trade has been marked as closed or was removed or deleted.">Closed</b>';
                                    data.trade.setAttribute('data-closed', "1");
                                } else {
                                    data.trade_closed_elem.innerHTML = '<b class="trade-active" title="This trade is probably still open for offers.">Open</b>';
                                }
                            }
                            if ((response.closed == 1 || data.trade_steamid === "0") && response.steamid !== undefined) {
                                verifyTradeUrls(response.steamid, data.trade_body.getElementsByTagName('a'), response.closed);
                            }
                        } else {
                            data.trade_body.innerHTML = 'Error';
                        }

                    } catch (e) {
                        data.trade_body.innerHTML = e;
                    }
                }
            });
        }
    }

    /**
     * Verify any trade urls contained in a post body and tag them
     *
     * @param userSteamId
     * @param links
     * @param tradeClosed
     */
    function verifyTradeUrls(userSteamId, links, tradeClosed) {
        tradeClosed = tradeClosed || 0;
        var verifiedTag = '<i class="trade-url-verified-icon icon-verified" title="This trade link was verified as safe and belongs to the author\'s Steam account! Nice! ❤"></i>';
        var notSafeTag = '<i class="trade-url-x-icon icon-x" title="This is not a valid/safe trade url, you should avoid it."></i>';
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            if (link != null && link.getAttribute('href').indexOf(tradeUrlFirstPart) !== -1) {
                var userTradeUrl = link.getAttribute('href');
                if (validTradeUrl(userTradeUrl, userSteamId)) {
                	if (tradeClosed == "1" && link.getAttribute('data-verified') === "1") {
                		// If we fetch live data after we have already tagged as verified just update the text
                        link.innerHTML = '[CLOSED] Trade Link';
                    } else {
                        link.setAttribute('data-verified', "1");
                        link.classList.add('trade-trade-url-verified');
                        link.insertAdjacentHTML('beforebegin', verifiedTag);
                        if (tradeClosed == "1") {
                            link.innerHTML = '[CLOSED] Trade Link';
                        } else {
                            link.innerHTML = 'Trade Link';
                        }
                    }
                } else {
                    link.classList.add('trade-trade-url-not-safe');
                    link.insertAdjacentHTML('beforebegin', notSafeTag);
                    link.innerHTML = '[NOT SAFE] Trade Link';
                }
            }
        }
    }

    /**
     * Is this a valid Steam trade-url?
     *
     * @param tradeUrl
     * @param steamId
     * @returns {boolean}
     */
    function validTradeUrl(tradeUrl, steamId) {
        var flatId = 76561197960265728;
        var firstStr = tradeUrlFirstPart;
        var secondStr = '&token=';
        if (
            tradeUrl.indexOf(firstStr) !== -1
            && tradeUrl.indexOf(secondStr) !== -1
        ) {
            // Pull out query parameters from tradeUrl
            var match, search = /([^&=]+)=?([^&]*)/g, i = 0;
            while (match = search.exec(tradeUrl)) {
                urlParams[i] = decodeURIPlus(match[2]);
                i++;
            }
            var partnerId = urlParams[0];
            // Adding flatId and partner-id gives us the user's steam 64-bit id! Nice!
            if ((flatId + Number(partnerId)) == Number(steamId)) {
                return true;
            }
        }
        return false;
    }

	/********* Delegated Events *********/

	// handle .trade clicks
	delegatedEvents.on('click', '.trade', function () {
		handleTradeBody(this);
	});

	// handle .trade keyboard events
	delegatedEvents.on('keydown', '.trade-row', function (e) {
		if (e.which == 13) {
			// pressed Enter
			handleTradeBody(this.childNodes[0]);
		}
	});

	// handle .trade-body-wrap clicks
	delegatedEvents.on('click', '.trade-body-wrap', function (e) {
		e.stopPropagation();
		if (e.target.nodeName != 'A') {
			// did not click on a link
			if(!(getSelection().toString().length > 0)) {
				// did not make a text selection
				closeTradeBody(e);
			}
		} else {
			// clicked a link
			tradeBodyLinkClick(e);
		}
	});

	// handle .trade-body-wrap keyboard events
	delegatedEvents.on('keydown', '.trade-body-wrap', function (e) {
		e.stopPropagation();
		if (e.which == 27) {
			// pressed ESC
			closeTradeBody(e);
		} else if (e.which == 13 && e.target.nodeName == 'A') {
			// pressed Enter on a link
			tradeBodyLinkClick(e);
		}
	});

	function closeTradeBody(e) {
		e.currentTarget.querySelector('.trade-body-top').style.display = 'none';
		e.currentTarget.querySelector('.trade-body').style.display = 'none';
		// set .trade parent data-opened to 0
		e.currentTarget.parentNode.querySelector('.trade').setAttribute('data-opened', "0");
	}

	function tradeBodyLinkClick(e) {
		e.preventDefault();
		// add this for better performance
		e.target.setAttribute('rel', 'noopener');
		// open link in a new tab
		window.open(e.target.getAttribute('href'));
	}

	// handle trade-body inline image view +/- button clicks
	delegatedEvents.on('click', '.trade-body-img-open', function (e) {
		if (e.type == 'click' || e.which == 13) {
			handleInlineImgBtnClicks(e);
		}
	});

	// handle trade-body clicks on images (close them)
	delegatedEvents.on('click', '.trade-body-img-wrap', function (e) {
        handleInlineImgClicks(e);
    });

	// Remove highlight when reddit link is clicked as well -- middle mouse-click doesn't work ;(
    delegatedEvents.on('click', '.trade-reddit-link', function () {
        this.parentNode.classList.remove('highlight');
    });

	/****** Trade Body View ******/

	var tradeUrlFirstPart = '//steamcommunity.com/tradeoffer/new/?partner=';

	// fetch trade body when a trade is clicked
	function handleTradeBody(trade) {

		var trade_id = trade.getAttribute('data-id'),
			trade_row = trade.parentNode,
			trade_body = trade_row.querySelector('.trade-body'),
			trade_body_top = trade_row.querySelector('.trade-body-top'),
			trade_body_open = trade.getAttribute('data-opened'),
			trade_closed = trade.getAttribute('data-closed'),
			trade_steamid = trade.getAttribute('data-steamid'),
			trade_link = trade.getAttribute('data-link'),
			trade_closed_elem = trade_body_top.querySelector('.trade-status-inner'),
			trade_body_loading = '<div class="trade-body-ajax-text">Loading post' + loading_dots + '</div>';

		var parseBodyData = {
			trade: trade,
            trade_id: trade_id,
            trade_body: trade_body,
            trade_closed: trade_closed,
            trade_steamid: trade_steamid,
            trade_link: trade_link,
            trade_closed_elem: trade_closed_elem,
		};

		trade_row.classList.remove('highlight');

		if (trade_body_open === "1") {

			trade.setAttribute('data-opened', "0");
			trade_body.style.display = 'none';
			trade_body_top.style.display = 'none';
			trade_body.innerHTML = '';
			trade_body.classList.remove('fade-in');

		} else {

			trade.setAttribute('data-opened', "1");
			trade_body.innerHTML = trade_body_loading;
			trade_body.style.display = 'block';
			trade_body_top.style.display = 'block';

			_ajax({
				type: 'POST',
				url: 'ajax/get_trade_body',
				data: {id: trade_id},

				success: function (response) {
					try {

						response = JSON.parse(response);

						if (response.status == 1) {

							trade_body.innerHTML = response.trade_body;
							parseTradeBody(parseBodyData);

						} else {
							trade_body.innerHTML = '<div class="trade-body-ajax-text">Database error 🤖</div>';
						}

					} catch (e) {
						trade_body.innerHTML = '<div class="trade-body-ajax-text">' + e + '</div>';
					}
				}
			});
		}
	}

    /************ Our Neat Switches *************/

	var _live = true;
	var live_switch = document.getElementById('live-updates');

	if (localStorageAvailable) {

		var storage = window.localStorage;

		/*** Live Switch ***/

		if (live_switch !== null) {

			if (live_switch.checked && storage.getItem('liveUpdates') == 0) {
				_live = false;
				live_switch.click();
			}

			live_switch.addEventListener('click', function () {

				_live = live_switch.checked;

				if (_live) {

					_live = true;
					document.title = 'GOTrade+';
					storage.setItem('liveUpdates', 1);

					var _new_trades_btn = document.querySelector('.new-trades-btn');

					if (_new_trades_btn !== null) {
						urlRedirect('/?hl=' + new_trade_count);
					}

				} else {
					_live = false;
					storage.setItem('liveUpdates', 0);
				}
			});
		}

		/*** Show [Store] Switch ***/

		var show_store_switch = document.getElementById('show-store');

		if (show_store_switch !== null) {

			if (show_store_switch.checked && storage.getItem('showStore') == 0) {
				show_store_switch.click();
			}

			show_store_switch.addEventListener('click', function () {

				if (show_store_switch.checked) {
					storage.setItem('showStore', 1);
				} else {
					storage.setItem('showStore', 0);
				}
			});
		}

	}

	/*** Dark Mode Switch ***/

	var dark_mode_switch = document.getElementById('dark-mode');
	var htmlElem = document.getElementsByTagName('html')[0];

	if (dark_mode_switch !== null) {

		dark_mode_switch.addEventListener('click', function () {

			if (dark_mode_switch.checked) {
				Cookies.set('darkMode', 1);
				htmlElem.classList.add('dark-mode');
			} else {
				Cookies.set('darkMode', 0);
				htmlElem.classList.remove('dark-mode');
			}
		});
	}

	Cookies.defaults = {
		path: '/',
		domain: window.location.hostname,
		secure: true
	};

	/************** Home Page Specific ****************/

	var new_trade_count = 0;
	var highlighted_count = 0;

	window.addEventListener('focus', function () {
		if (_live && new_trade_count > 0) {
			// Clear page title && new trade count
			document.title = 'GOTrade+';
			new_trade_count = 0;
		}
	});

	window.addEventListener('blur', function () {
		if (_live && highlighted_count > 0) {
			/*
			 When a user navigates out of window after viewing new trades,
			 we should change the highlights to a lighter color; this way there is a clear distinction between
			 brand new trades vs new trades since the page has loaded.
			 */
			highlighted_count = 0;
			var trades = document.querySelectorAll('.highlight');
			for (var i = 0; i < trades.length; i++) {
				trades[i].classList.add('light');
			}
		}
	});

	if (_path == '/') {

		(function homePage() {

			/*** Socket.io (only used on homepage) ***/

			var socket = io.connect();

			socket.on('new trade', function (trade_data) {

				if (live_switch.checked) {

					newTrade(trade_data);

				} else {

					new_trade_count += 1;
					updatePageTitle(new_trade_count);
					newTradeBtnUpdate(new_trade_count);
					document.querySelector('.new-trades-btn').addEventListener('click', function () {
						urlRedirect('/?hl=' + new_trade_count);
					});
				}
			});

		})();
	}

	/************** Search Results Specific ****************/

	var tradesWrap = document.getElementById("trades-wrap");

	if (_path == '/search') {

		(function searchPage() {

			var page_search_count = Number(tradesWrap.getAttribute('data-total-count')),
				search_new_trades_count = 0,
				_type = urlParams['type'],
				_query = urlParams['q'],
				_show_store = 1;

			if (typeof urlParams['show_store'] == 'undefined') {
				_show_store = 0;
			}

			document.title = decodeURIPlus(_query) + ' • GOTrade+';

			// call search query every 15 seconds
			setInterval(function querySearch() {

				_ajax({
					type: 'POST',
					url: 'ajax/search',
					data: {type: _type, query: _query, show_store: _show_store},
					success: function (response) {
						try {

							response = JSON.parse(response);

							if (response.status == 1 && response.count > (page_search_count + search_new_trades_count)) {

								search_new_trades_count = (response.count - page_search_count);
								updatePageTitle(search_new_trades_count, _query);
								newTradeBtnUpdate(search_new_trades_count);

								document.querySelector('.new-trades-btn').addEventListener('click', function () {
									urlRedirect('/search?type=' + _type + '&q=' + _query + '&hl=' + search_new_trades_count);
								});
							}

						} catch (e) {

						}
					}
				});

			}, 15000);

		})();
	}

	/************** New Trades / Live Updates ****************/

	// we update page title to notify user of new trades count
	function updatePageTitle(count, query) {
		query = query || '';
		if (_path == '/') {
			document.title = '(' + count + ') GOTrade+';
		} else {
			document.title = '(' + count + ') ' + query.decodeURIPlus() + ' • GOTrade+';
		}
	}

	var top_text = document.querySelector('.top-text');

	function newTradeBtnUpdate(count) {
		top_text.innerHTML = '<div class="new-trades-wrap"><button class="new-trades-btn btn btn-danger">' + count + ' new trades</button></div>';
	}

	// this contains an empty html markup of a trade-row
	var trade_row_markup = document.getElementById('trade-row-markup'),
		trade_row_header = document.querySelector('.trade-row-header');

	// handle new live-update trade
	function newTrade(data) {

		// clone our sheep
		var dolly = trade_row_markup.cloneNode(true);

		// select individual parts of cloned sheep
		var children = dolly.childNodes,
			trade = children[0],
			trade_children = trade.childNodes,
			time = trade_children[0],
			reddit_link = children[1],
			username = dolly.querySelector('.trade-username');

		// below we will perform corrective surgery on our clone
		// remove extra parts and add missing

		dolly.removeAttribute('id');
		dolly.setAttribute('tabindex', "0");
		dolly.classList.add('highlight');
		dolly.classList.remove('hidden');

		trade.setAttribute('data-id', data.id);
		trade.setAttribute('data-link', data.link);
		trade.setAttribute('data-steamid', data.steamid);
		time.setAttribute('datetime', new Date(data.time * 1000).toISOString());

		var have = trade_children[1],
			want = trade_children[2];

		reddit_link.setAttribute('href', reddit_link.getAttribute('href') + data.link);

		username.innerHTML = 'By <a href="https://www.reddit.com/user/' + data.username + '" target="_blank" rel="noopener">/u/' + data.username + '</a>';

		if (data.type == 1 || data.type == 2) {
			// have || want
			have.innerHTML = data.have;
			want.innerHTML = data.want;

		} else {
			// store || price check (not received or displayed)
			have.classList.remove('col-5');
			have.classList.remove('trade-have');
			have.classList.add('col-10');
			have.innerHTML = '[Store] ' + data.have;
			want.parentNode.removeChild(want);
		}

		// release cloned sheep to be with the herd
		trade_row_header.insertAdjacentElement('afterend', dolly);
		setTimeout(function () {
			trade_row_header.nextElementSibling.classList.add('fade-in');
		}, 10);
		timeagoInstance.render(time);

		highlighted_count += 1;

		if (!document.hasFocus()) {
			new_trade_count += 1;
			updatePageTitle(new_trade_count);
		}
	}

	window._testNewTrade = function () {
		var propData = {
			id: 1, type: 1, username: 'Bob', steamid: 0, link: '', have: 'ihaz', want: 'ineed', body: 'gofest', time: Math.floor(Date.now() / 1000)
		};
		newTrade(propData);
		return 'Done';
	};

	/***** Infinite Scroll *****/

	var loadingNewPage = false,
	    continuePagination = false,
	    firstPagination = document.querySelector('.pagination'),
	    nextPagination = firstPagination,
	    paginationUrl = '?page=2';

	if (firstPagination !== null) {
		continuePagination = true;
		if (_path == '/search') {
			setNextPaginationUrl(nextPagination,1);
		}
	}

	function setNextPaginationUrl(referenceElement,directElement) {
		directElement = directElement || 0;
		if (directElement) {
			nextPagination = referenceElement;
		} else {
			nextPagination = referenceElement.querySelector('.pagination');
		}
		if (nextPagination !== null) {
			paginationUrl = nextPagination.getElementsByTagName('a')[0].getAttribute('href');
		} else {
			continuePagination = false;
		}
	}

	if (continuePagination && (_path == '/' || _path == '/search')) {
		document.addEventListener("scroll", function () {
			if (continuePagination && !loadingNewPage)
				calcPaginationScroll();
		}, {passive: true});
	}

	function calcPaginationScroll() {
		var lastDivOffset = tradesWrap.offsetTop + tradesWrap.clientHeight,
		    pageOffset = window.pageYOffset + window.innerHeight,
		    bottomPadding = 800;

		if ((pageOffset + bottomPadding) > lastDivOffset) {
			loadingNewPage = true;
			loadNewPage();
		}
	}

	var infiniteScrollLoading = document.getElementById('infinite-scroll-loading');

	function loadNewPage() {

		infiniteScrollLoading.style.display = 'block';

		_ajax({
			type: 'GET',
			url: paginationUrl,
			success: function (response) {

				var newTradesElem = document.createElement('div');
				newTradesElem.innerHTML = response;

				var tradesInnerWrap = newTradesElem.querySelector('.trades-inner-wrap');
				newTradesElem = null;

				infiniteScrollLoading.style.display = 'none';

				tradesWrap.lastChild.insertAdjacentElement('afterend', tradesInnerWrap);

				loadingNewPage = false;
				setNextPaginationUrl(tradesInnerWrap);
				tradesInnerWrap = null;

				timeagoInstance.render(document.querySelectorAll('.trades-inner-wrap:last-of-type .timeago'));
				ga('send', 'pageview');
			}
		});

	}

	ga('create', 'UA-29331540-5', 'auto');
	ga('send', 'pageview');
};

document.addEventListener('DOMContentLoaded', goTradePlus);

/* timeago.js -- Copyright (c) 2016 hustcc */
!function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory(root); // nodejs support
		module.exports['default'] = module.exports; // es6 support
	}
	else
		root.timeago = factory(root);
}(typeof window !== 'undefined' ? window : this,
	function () {
		var indexMapEn = 's_min_hr_day_week_month_year'.split('_'),
			// build-in locales: en
			locales = {
				'en': function(number, index) {
					if (index === 0 || index === 1) return ['just now', 'just now'];
					var unit = indexMapEn[parseInt(index / 2)];
					if (number > 1 && index != 3) unit += 's';
					return [number + ' ' + unit + ' ago', 'in ' + number + ' ' + unit];
				}
			},
			// second, minute, hour, day, week, month, year(365 days)
			SEC_ARRAY = [60, 60, 24, 7, 365/7/12, 12],
			SEC_ARRAY_LEN = 6,
			// ATTR_DATETIME = 'datetime',
			ATTR_DATA_TID = 'data-tid',
			timers = {}; // real-time render timers

		// format Date / string / timestamp to Date instance.
		function toDate(input) {
			if (input instanceof Date) return input;
			if (!isNaN(input)) return new Date(toInt(input));
			if (/^\d+$/.test(input)) return new Date(toInt(input));
			input = (input || '').trim().replace(/\.\d+/, '') // remove milliseconds
				.replace(/-/, '/').replace(/-/, '/')
				.replace(/(\d)T(\d)/, '$1 $2').replace(/Z/, ' UTC') // 2017-2-5T3:57:52Z -> 2017-2-5 3:57:52UTC
				.replace(/([\+\-]\d\d)\:?(\d\d)/, ' $1$2'); // -04:00 -> -0400
			return new Date(input);
		}
		// change f into int, remove decimal. Just for code compression
		function toInt(f) {
			return parseInt(f);
		}
		// format the diff second to *** time ago, with setting locale
		function formatDiff(diff, locale, defaultLocale) {
			// if locale is not exist, use defaultLocale.
			// if defaultLocale is not exist, use build-in `en`.
			// be sure of no error when locale is not exist.
			locale = locales[locale] ? locale : (locales[defaultLocale] ? defaultLocale : 'en');
			// if (! locales[locale]) locale = defaultLocale;
			var i = 0,
				agoin = diff < 0 ? 1 : 0, // timein or timeago
				total_sec = diff = Math.abs(diff);

			for (; diff >= SEC_ARRAY[i] && i < SEC_ARRAY_LEN; i++) {
				diff /= SEC_ARRAY[i];
			}
			diff = toInt(diff);
			i *= 2;

			if (diff > (i === 0 ? 9 : 1)) i += 1;

			return locales[locale](diff, i, total_sec)[agoin].replace('%s', diff);
		}
		// calculate the diff second between date to be formated an now date.
		function diffSec(date, nowDate) {
			nowDate = nowDate ? toDate(nowDate) : new Date();
			return (nowDate - toDate(date)) / 1000;
		}

		function nextInterval(diff) {
			var rst = 1, i = 0, d = Math.abs(diff);
			for (; diff >= SEC_ARRAY[i] && i < SEC_ARRAY_LEN; i++) {
				diff /= SEC_ARRAY[i];
				rst *= SEC_ARRAY[i];
			}
			// return leftSec(d, rst);
			d = d % rst;
			d = d ? rst - d : rst;
			return Math.ceil(d);
		}
		// get the datetime attribute, `data-timeagp` / `datetime` are supported.
		function getDateAttr(node) {
			return getAttr(node, 'data-timeago') || getAttr(node, 'datetime');
		}
		// get the node attribute, native DOM and jquery supported.
		function getAttr(node, name) {
			if(node.getAttribute) return node.getAttribute(name); // native
			if(node.attr) return node.attr(name); // jquery
		}
		// set the node attribute, native DOM and jquery supported.
		function setTidAttr(node, val) {
			if(node.setAttribute) return node.setAttribute(ATTR_DATA_TID, val); // native
			if(node.attr) return node.attr(ATTR_DATA_TID, val); // jquery
		}
		function Timeago(nowDate, defaultLocale) {
			this.nowDate = nowDate;
			// if do not set the defaultLocale, set it with `en`
			this.defaultLocale = defaultLocale || 'en'; // use default build-in locale
			// for dev test
			// this.nextInterval = nextInterval;
		}
		// what the timer will do
		Timeago.prototype.doRender = function(node, date, locale) {
			var diff = diffSec(date, this.nowDate),
				self = this,
				tid;

			// delete previously assigned timeout's id to node
			node.innerHTML = formatDiff(diff, locale, this.defaultLocale);
			// waiting %s seconds, do the next render
			timers[tid = setTimeout(function () {
				self.doRender(node, date, locale);
				delete timers[tid];
			}, getTimeoutTime(diff))] = 0; // there is no need to save node in object.
			// set attribute date-tid
			setTidAttr(node, tid);
		};

		function getTimeoutTime(diff) {
			if (diff > 60) {
				// diff bigger than 60seconds
				return Math.min(nextInterval(diff) * 1000, 0x7FFFFFFF);
			} else {
				// when considering seconds, next update will be on the 1 minute mark instead of every second
				return (60000 - (diff * 1000));
			}
		}

		Timeago.prototype.format = function(date, locale) {
			return formatDiff(diffSec(date, this.nowDate), locale, this.defaultLocale);
		};

		Timeago.prototype.render = function(nodes, locale) {
			if (nodes.length === undefined) nodes = [nodes];
			for (var i = 0, len = nodes.length; i < len; i++) {
				this.doRender(nodes[i], getDateAttr(nodes[i]), locale); // render item
			}
		};

		Timeago.prototype.setLocale = function(locale) {
			this.defaultLocale = locale;
		};

		function timeagoFactory(nowDate, defaultLocale) {
			return new Timeago(nowDate, defaultLocale);
		}

		timeagoFactory.register = function(locale, localeFunc) {
			locales[locale] = localeFunc;
		};


		timeagoFactory.cancel = function(node) {
			var tid;
			// assigning in if statement to save space
			if (node) {
				tid = getAttr(node, ATTR_DATA_TID); // get the timer of DOM node(native / jq).
				if (tid) {
					clearTimeout(tid);
					delete timers[tid];
				}
			} else {
				for (tid in timers) clearTimeout(tid);
				timers = {};
			}
		};

		return timeagoFactory;
	});

/* https://github.com/josh/selector-set */
!function(e,t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports?module.exports=t():e.SelectorSet=t()}(this,function(){"use strict";function e(){if(!(this instanceof e))return new e;this.size=0,this.uid=0,this.selectors=[],this.indexes=Object.create(this.indexes),this.activeIndexes=[]}function t(e,t){var n,r,i,o,s,c,u=(e=e.slice(0).concat(e.default)).length,a=t,l=[];do{if(f.exec(""),(i=f.exec(a))&&(a=i[3],i[2]||!a))for(n=0;n<u;n++)if(c=e[n],s=c.selector(i[1])){for(r=l.length,o=!1;r--;)if(l[r].index===c&&l[r].key===s){o=!0;break}o||l.push({index:c,key:s});break}}while(i);return l}function n(e,t){var n,r,i;for(n=0,r=e.length;n<r;n++)if(i=e[n],t.isPrototypeOf(i))return i}function r(e,t){return e.id-t.id}var i=window.document.documentElement,o=i.matches||i.webkitMatchesSelector||i.mozMatchesSelector||i.oMatchesSelector||i.msMatchesSelector;e.prototype.matchesSelector=function(e,t){return o.call(e,t)},e.prototype.querySelectorAll=function(e,t){return t.querySelectorAll(e)},e.prototype.indexes=[];var s=/^#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/g;e.prototype.indexes.push({name:"ID",selector:function(e){var t;if(t=e.match(s))return t[0].slice(1)},element:function(e){if(e.id)return[e.id]}});var c=/^\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/g;e.prototype.indexes.push({name:"CLASS",selector:function(e){var t;if(t=e.match(c))return t[0].slice(1)},element:function(e){var t=e.className;if(t){if("string"==typeof t)return t.split(/\s/);if("object"==typeof t&&"baseVal"in t)return t.baseVal.split(/\s/)}}});var u=/^((?:[\w\u00c0-\uFFFF\-]|\\.)+)/g;e.prototype.indexes.push({name:"TAG",selector:function(e){var t;if(t=e.match(u))return t[0].toUpperCase()},element:function(e){return[e.nodeName.toUpperCase()]}}),e.prototype.indexes.default={name:"UNIVERSAL",selector:function(){return!0},element:function(){return[!0]}};var a;a="function"==typeof window.Map?window.Map:function(){function e(){this.map={}}return e.prototype.get=function(e){return this.map[e+" "]},e.prototype.set=function(e,t){this.map[e+" "]=t},e}();var f=/((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g;return e.prototype.logDefaultIndexUsed=function(){},e.prototype.add=function(e,r){var i,o,s,c,u,f,l,p,h=this.activeIndexes,d=this.selectors;if("string"==typeof e){for(i={id:this.uid++,selector:e,data:r},l=t(this.indexes,e),o=0;o<l.length;o++)c=(p=l[o]).key,(u=n(h,s=p.index))||((u=Object.create(s)).map=new a,h.push(u)),s===this.indexes.default&&this.logDefaultIndexUsed(i),(f=u.map.get(c))||(f=[],u.map.set(c,f)),f.push(i);this.size++,d.push(e)}},e.prototype.remove=function(e,n){if("string"==typeof e){var r,i,o,s,c,u,a,f,l=this.activeIndexes,p={},h=1===arguments.length;for(r=t(this.indexes,e),o=0;o<r.length;o++)for(i=r[o],s=l.length;s--;)if(u=l[s],i.index.isPrototypeOf(u)){if(a=u.map.get(i.key))for(c=a.length;c--;)(f=a[c]).selector!==e||!h&&f.data!==n||(a.splice(c,1),p[f.id]=!0);break}this.size-=Object.keys(p).length}},e.prototype.queryAll=function(e){if(!this.selectors.length)return[];var t,n,i,o,s,c,u,a,f={},l=[],p=this.querySelectorAll(this.selectors.join(", "),e);for(t=0,i=p.length;t<i;t++)for(s=p[t],n=0,o=(c=this.matches(s)).length;n<o;n++)f[(a=c[n]).id]?u=f[a.id]:(u={id:a.id,selector:a.selector,data:a.data,elements:[]},f[a.id]=u,l.push(u)),u.elements.push(s);return l.sort(r)},e.prototype.matches=function(e){if(!e)return[];var t,n,i,o,s,c,u,a,f,l,p,h=this.activeIndexes,d={},m=[];for(t=0,o=h.length;t<o;t++)if(u=h[t],a=u.element(e))for(n=0,s=a.length;n<s;n++)if(f=u.map.get(a[n]))for(i=0,c=f.length;i<c;i++)!d[p=(l=f[i]).id]&&this.matchesSelector(e,l.selector)&&(d[p]=!0,m.push(l));return m.sort(r)},e});

/* https://github.com/dgraham/delegated-events */
var delegatedEvents = (function () {

	var bubbleEvents = {};
	var captureEvents = {};
	var propagationStopped = new WeakMap();
	var immediatePropagationStopped = new WeakMap();
	var currentTargets = new WeakMap();
	var currentTargetDesc = Object.getOwnPropertyDescriptor(Event.prototype, 'currentTarget');

	function before(subject, verb, fn) {
		var source = subject[verb];
		subject[verb] = function () {
			fn.apply(subject, arguments);
			return source.apply(subject, arguments);
		};
		return subject;
	}

	function matches(selectors, target, reverse) {
		var queue = [];
		var node = target;

		do {
			if (node.nodeType !== 1) break;
			var _matches = selectors.matches(node);
			if (_matches.length) {
				var matched = { node: node, observers: _matches };
				if (reverse) {
					queue.unshift(matched);
				} else {
					queue.push(matched);
				}
			}
		} while (node = node.parentElement);

		return queue;
	}

	function trackPropagation() {
		propagationStopped.set(this, true);
	}

	function trackImmediate() {
		propagationStopped.set(this, true);
		immediatePropagationStopped.set(this, true);
	}

	function getCurrentTarget() {
		return currentTargets.get(this) || null;
	}

	function defineCurrentTarget(event, getter) {
		if (!currentTargetDesc) return;

		Object.defineProperty(event, 'currentTarget', {
			configurable: true,
			enumerable: true,
			get: getter || currentTargetDesc.get
		});
	}

	function dispatch(event) {
		var events = event.eventPhase === 1 ? captureEvents : bubbleEvents;
		var selectors = events[event.type];
		var queue = matches(selectors, event.target, event.eventPhase === 1);
		if (!queue.length) return;

		before(event, 'stopPropagation', trackPropagation);
		before(event, 'stopImmediatePropagation', trackImmediate);
		defineCurrentTarget(event, getCurrentTarget);

		for (var i = 0, len1 = queue.length; i < len1; i++) {
			if (propagationStopped.get(event)) break;
			var matched = queue[i];
			currentTargets.set(event, matched.node);

			for (var j = 0, len2 = matched.observers.length; j < len2; j++) {
				if (immediatePropagationStopped.get(event)) break;
				matched.observers[j].data.call(matched.node, event);
			}
		}

		currentTargets.delete(event);
		defineCurrentTarget(event);
	}

	function on(name, selector, fn) {
		var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

		var capture = options.capture ? true : false;
		var events = capture ? captureEvents : bubbleEvents;

		var selectors = events[name];
		if (!selectors) {
			selectors = new SelectorSet();
			events[name] = selectors;
			document.addEventListener(name, dispatch, capture);
		}
		selectors.add(selector, fn);
	}

	function off(name, selector, fn) {
		var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

		var capture = options.capture ? true : false;
		var events = capture ? captureEvents : bubbleEvents;

		var selectors = events[name];
		if (!selectors) return;
		selectors.remove(selector, fn);

		if (selectors.size) return;
		delete events[name];
		document.removeEventListener(name, dispatch, capture);
	}

	function fire(target, name, detail) {
		return target.dispatchEvent(new CustomEvent(name, {
			bubbles: true,
			cancelable: true,
			detail: detail
		}));
	}

	return {
		on: on,
		off: off,
		fire: fire
	}
})();

/* minAjax.js -- Author: https://github.com/flouthoc */
function _ajax(e){if(!e.url)return void(1==e.debugLog&&console.log('Undefined URL'));if(!e.type)return void(1==e.debugLog&&console.log("No default type (GET/POST) given!"));e.method||(e.method=!0),e.debugLog||(e.debugLog=!1);var o=new XMLHttpRequest();o.onreadystatechange=function(){4==o.readyState&&200==o.status?(e.success&&e.success(o.responseText,o.readyState),1==e.debugLog&&console.log("SuccessResponse"),1==e.debugLog&&console.log("Response Data: "+o.responseText)):1==e.debugLog&&console.log("FailureResponse --> State: "+o.readyState+" Status: "+o.status)};var t=[],n=e.data;if("string"==typeof n)for(var s=String.prototype.split.call(n,"&"),r=0,a=s.length;a>r;r++){var c=s[r].split("=");t.push(encodeURIComponent(c[0])+"="+encodeURIComponent(c[1]))}else if("object"==typeof n&&!(n instanceof String||FormData&&n instanceof FormData))for(var p in n){var c=n[p];if("[object Array]"==Object.prototype.toString.call(c))for(var r=0,a=c.length;a>r;r++)t.push(encodeURIComponent(p)+"[]="+encodeURIComponent(c[r]));else t.push(encodeURIComponent(p)+"="+encodeURIComponent(c))}t=t.join("&"),"GET"==e.type.toUpperCase()&&(o.open("GET",e.url+t,e.method),o.send(),1==e.debugLog&&console.log("GET fired at:"+e.url+t)),"POST"==e.type.toUpperCase()&&(o.open("POST",e.url,e.method),o.setRequestHeader("Content-type","application/x-www-form-urlencoded"),o.send(t),1==e.debugLog&&console.log("POST fired at: "+e.url+" || Data:"+t))}

/* Cookies.js - 1.2.4-pre -- https://github.com/ScottHamper/Cookies */
(function(d,f){"use strict";var h=function(d){if("object"!==typeof d.document)throw Error("Cookies.js requires a `window` with a `document` object");var b=function(a,e,c){return 1===arguments.length?b.get(a):b.set(a,e,c)};b._document=d.document;b._cacheKeyPrefix="cookey.";b._maxExpireDate=new Date("Fri, 31 Dec 9999 23:59:59 UTC");b.defaults={path:"/",secure:!1};b.get=function(a){b._cachedDocumentCookie!==b._document.cookie&&b._renewCache();a=b._cache[b._cacheKeyPrefix+a];return a===f?f:decodeURIComponent(a)}; b.set=function(a,e,c){c=b._getExtendedOptions(c);c.expires=b._getExpiresDate(e===f?-1:c.expires);b._document.cookie=b._generateCookieString(a,e,c);return b};b.expire=function(a,e){return b.set(a,f,e)};b._getExtendedOptions=function(a){return{path:a&&a.path||b.defaults.path,domain:a&&a.domain||b.defaults.domain,expires:a&&a.expires||b.defaults.expires,secure:a&&a.secure!==f?a.secure:b.defaults.secure}};b._isValidDate=function(a){return"[object Date]"===Object.prototype.toString.call(a)&&!isNaN(a.getTime())}; b._getExpiresDate=function(a,e){e=e||new Date;"number"===typeof a?a=Infinity===a?b._maxExpireDate:new Date(e.getTime()+1E3*a):"string"===typeof a&&(a=new Date(a));if(a&&!b._isValidDate(a))throw Error("`expires` parameter cannot be converted to a valid Date instance");return a};b._generateCookieString=function(a,b,c){a=a.replace(/[^#$&+\^`|]/g,encodeURIComponent);a=a.replace(/\(/g,"%28").replace(/\)/g,"%29");b=(b+"").replace(/[^!#$&-+\--:<-\[\]-~]/g,encodeURIComponent);c=c||{};a=a+"="+b+(c.path?";path="+ c.path:"");a+=c.domain?";domain="+c.domain:"";a+=c.expires?";expires="+c.expires.toUTCString():"";return a+=c.secure?";secure":""};b._getCacheFromString=function(a){var e={};a=a?a.split("; "):[];for(var c=0;c<a.length;c++){var d=b._getKeyValuePairFromCookieString(a[c]);e[b._cacheKeyPrefix+d.key]===f&&(e[b._cacheKeyPrefix+d.key]=d.value)}return e};b._getKeyValuePairFromCookieString=function(a){var b=a.indexOf("="),b=0>b?a.length:b,c=a.substr(0,b),d;try{d=decodeURIComponent(c)}catch(k){console&&"function"=== typeof console.error&&console.error('Could not decode cookie with key "'+c+'"',k)}return{key:d,value:a.substr(b+1)}};b._renewCache=function(){b._cache=b._getCacheFromString(b._document.cookie);b._cachedDocumentCookie=b._document.cookie};b._areEnabled=function(){var a="1"===b.set("cookies.js",1).get("cookies.js");b.expire("cookies.js");return a};b.enabled=b._areEnabled();return b},g=d&&"object"===typeof d.document?h(d):h;"function"===typeof define&&define.amd?define(function(){return g}):"object"=== typeof exports?("object"===typeof module&&"object"===typeof module.exports&&(exports=module.exports=g),exports.Cookies=g):d.Cookies=g})("undefined"===typeof window?this:window);

/* Google Analytics */
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){ (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o), m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m) })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
