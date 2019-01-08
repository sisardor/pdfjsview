(function(exports) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.PDFFindController = exports.FindState = undefined;


  function getCharacterType() {
    return false;
  }

  function scrollIntoView(element, spot) {
    var skipOverflowHiddenElements = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    // element.scrollIntoView()
    // Assuming offsetParent is available (it's not available when viewer is in
    // hidden iframe or object). We have to scroll: if the offsetParent is not set
    // producing the error. See also animationStarted.
    var parent = element.offsetParent;
    if (!parent) {
      console.error('offsetParent is not set -- cannot scroll');
      return;
    }
    var offsetY = element.offsetTop + element.clientTop;
    var offsetX = element.offsetLeft + element.clientLeft;
    while ((parent.clientHeight === parent.scrollHeight &&
        parent.clientWidth === parent.scrollWidth) ||
      (skipOverflowHiddenElements &&
        getComputedStyle(parent)
        .overflow === 'hidden')) {
      if (parent.dataset._scaleY) {
        offsetY /= parent.dataset._scaleY;
        offsetX /= parent.dataset._scaleX;
      }
      offsetY += parent.offsetTop;
      offsetX += parent.offsetLeft;
      parent = parent.offsetParent;
      if (!parent) {
        return; // no need to scroll
      }
    }
    if (spot) {
      if (spot.top !== undefined) {
        offsetY += spot.top;
      }
      if (spot.left !== undefined) {
        offsetX += spot.left;
        parent.scrollLeft = offsetX;
      }
    }
    parent.scrollIntoView()
    parent.scrollTop = offsetY;
  }
  var FindState = {
    FOUND: 0,
    NOT_FOUND: 1,
    WRAPPED: 2,
    PENDING: 3
  };
  var FIND_TIMEOUT = 250; // ms
  var MATCH_SCROLL_OFFSET_TOP = -50; // px
  var MATCH_SCROLL_OFFSET_LEFT = -400; // px
  var CHARACTERS_TO_NORMALIZE = {
    '\u2018': '\'', // Left single quotation mark
    '\u2019': '\'', // Right single quotation mark
    '\u201A': '\'', // Single low-9 quotation mark
    '\u201B': '\'', // Single high-reversed-9 quotation mark
    '\u201C': '"', // Left double quotation mark
    '\u201D': '"', // Right double quotation mark
    '\u201E': '"', // Double low-9 quotation mark
    '\u201F': '"', // Double high-reversed-9 quotation mark
    '\xBC': '1/4', // Vulgar fraction one quarter
    '\xBD': '1/2', // Vulgar fraction one half
    '\xBE': '3/4' // Vulgar fraction three quarters
  };
  var normalizationRegex = null;

  function normalize(text) {
    if (!normalizationRegex) {
      // Compile the regular expression for text normalization once.
      var replace = Object.keys(CHARACTERS_TO_NORMALIZE)
        .join('');
      normalizationRegex = new RegExp('[' + replace + ']', 'g');
    }
    return text.replace(normalizationRegex, function(ch) {
      return CHARACTERS_TO_NORMALIZE[ch];
    });
  }


  /**
   * @typedef {Object} PDFFindControllerOptions
   * @property {IPDFLinkService} linkService - The navigation/linking service.
   * @property {EventBus} eventBus - The application event bus.
   */

  /**
   * Provides search functionality to find a given string in a PDF document.
   */

  var PDFFindController = function PDFFindController(_ref) {
    var linkService = _ref.linkService,
      _ref$eventBus = _ref.eventBus,
      eventBus = _ref$eventBus === undefined ? getGlobalEventBus() : _ref$eventBus;

    this._linkService = linkService;
    this._eventBus = eventBus;
    this.canvasInfo = {}

    this._reset();
    eventBus.on('findbarclose', this._onFindBarClose.bind(this));
  }



  PDFFindController.prototype = {
    /**
     * Set a reference to the PDF document in order to search it.
     * Note that searching is not possible if this method is not called.
     *
     * @param {PDFDocumentProxy} pdfDocument - The PDF document to search.
     */
    setDocument: function setDocument(pdfDocument) {
      if (this._pdfDocument) {
        this._reset();
      }
      if (!pdfDocument) {
        return;
      }
      this._pdfDocument = pdfDocument;
      this._firstPageCapability.resolve();
    },
    setCanvasWH: function setCanvasWH(payload) {
      this.canvasInfo = payload
    },
    executeCommand: function executeCommand(cmd, state) {
      var _this = this;
      if (!state) {
        return;
      }
      var pdfDocument = this._pdfDocument;

      if (this._state === null || this._shouldDirtyMatch(cmd, state)) {
        this._dirtyMatch = true;
      }
      this._state = state;
      if (cmd !== 'findhighlightallchange') {
        this._updateUIState(FindState.PENDING);
      }

      this._firstPageCapability.promise.then(function() {
        // If the document was closed before searching began, or if the search
        // operation was relevant for a previously opened document, do nothing.
        if (!_this._pdfDocument || pdfDocument && _this._pdfDocument !== pdfDocument) {
          return;
        }
        _this._extractText();

        var findbarClosed = !_this._highlightMatches;
        var pendingTimeout = !!_this._findTimeout;

        if (_this._findTimeout) {
          clearTimeout(_this._findTimeout);
          _this._findTimeout = null;
        }
        if (cmd === 'find') {
          // Trigger the find action with a small delay to avoid starting the
          // search when the user is still typing (saving resources).
          _this._findTimeout = setTimeout(function() {
            _this._nextMatch();
            _this._findTimeout = null;
          }, FIND_TIMEOUT);
        } else if (_this._dirtyMatch) {
          // Immediately trigger searching for non-'find' operations, when the
          // current state needs to be reset and matches re-calculated.
          _this._nextMatch();
        } else if (cmd === 'findagain') {
          _this._nextMatch();

          // When the findbar was previously closed, and `highlightAll` is set,
          // ensure that the matches on all active pages are highlighted again.
          if (findbarClosed && _this._state.highlightAll) {
            _this._updateAllPages();
          }
        } else if (cmd === 'findhighlightallchange') {
          // If there was a pending search operation, synchronously trigger a new
          // search *first* to ensure that the correct matches are highlighted.
          if (pendingTimeout) {
            _this._nextMatch();
          } else {
            _this._highlightMatches = true;
          }
          _this._updateAllPages(); // Update the highlighting on all active pages.
        } else {
          _this._nextMatch();
        }
      });
    },
    scrollMatchIntoView: function scrollMatchIntoView(_ref2) {
      var _ref2$element = _ref2.element,
        element = _ref2$element === undefined ? null : _ref2$element,
        _ref2$pageIndex = _ref2.pageIndex,
        pageIndex = _ref2$pageIndex === undefined ? -1 : _ref2$pageIndex,
        _ref2$matchIndex = _ref2.matchIndex,
        matchIndex = _ref2$matchIndex === undefined ? -1 : _ref2$matchIndex;

      if (!this._scrollMatches || !element) {
        return;
      } else if (matchIndex === -1 || matchIndex !== this._selected.matchIdx) {
        return;
      } else if (pageIndex === -1 || pageIndex !== this._selected.pageIdx) {
        return;
      }
      this._scrollMatches = false; // Ensure that scrolling only happens once.

      var spot = {
        top: MATCH_SCROLL_OFFSET_TOP,
        left: MATCH_SCROLL_OFFSET_LEFT
      };
      scrollIntoView(element, spot, /* skipOverflowHiddenElements = */ true);
    },
    _reset: function _reset() {
      this._highlightMatches = false;
      this._scrollMatches = false;
      this._pdfDocument = null;
      this._pageMatches = [];
      this._pageMatchesLength = [];
      this._state = null;
      this._selected = { // Currently selected match.
        pageIdx: -1,
        matchIdx: -1
      };
      this._offset = { // Where the find algorithm currently is in the document.
        pageIdx: null,
        matchIdx: null,
        wrapped: false
      };
      this._extractTextPromises = [];
      this._pageContents = []; // Stores the normalized text for each page.
      this._pageTextContents = [];
      this._matchesCountTotal = 0;
      this._pagesToSearch = null;
      this._pendingFindMatches = Object.create(null);
      this._resumePageIdx = null;
      this._dirtyMatch = false;
      clearTimeout(this._findTimeout);
      this._findTimeout = null;

      this._firstPageCapability = createPromiseCapability();
    },
    _shouldDirtyMatch: function _shouldDirtyMatch(cmd, state) {
      // When the search query changes, regardless of the actual search command
      // used, always re-calculate matches to avoid errors (fixes bug 1030622).
      if (state.query !== this._state.query) {
        return true;
      }
      switch (cmd) {
        case 'findagain':
          var pageNumber = this._selected.pageIdx + 1;
          var linkService = this._linkService;
          // Only treat a 'findagain' event as a new search operation when it's
          // *absolutely* certain that the currently selected match is no longer
          // visible, e.g. as a result of the user scrolling in the document.
          //
          // NOTE: If only a simple `this._linkService.page` check was used here,
          // there's a risk that consecutive 'findagain' operations could "skip"
          // over matches at the top/bottom of pages thus making them completely
          // inaccessible when there's multiple pages visible in the viewer.
          if (pageNumber >= 1 && pageNumber <= linkService.getPageCount() && linkService.page !== pageNumber && linkService.isPageVisible && !linkService.isPageVisible(pageNumber)) {
            break;
          }
          return false;
        case 'findhighlightallchange':
          return false;
      }
      return true;
    },
    _prepareMatches: function _prepareMatches(matchesWithLength, matches, matchesLength) {
      function isSubTerm(matchesWithLength, currentIndex) {
        var currentElem = matchesWithLength[currentIndex];
        var nextElem = matchesWithLength[currentIndex + 1];

        // Check for cases like "TAMEd TAME".
        if (currentIndex < matchesWithLength.length - 1 && currentElem.match === nextElem.match) {
          currentElem.skipped = true;
          return true;
        }

        // Check for cases like "thIS IS".
        for (var i = currentIndex - 1; i >= 0; i--) {
          var prevElem = matchesWithLength[i];
          if (prevElem.skipped) {
            continue;
          }
          if (prevElem.match + prevElem.matchLength < currentElem.match) {
            break;
          }
          if (prevElem.match + prevElem.matchLength >= currentElem.match + currentElem.matchLength) {
            currentElem.skipped = true;
            return true;
          }
        }
        return false;
      }

      // Sort the array of `{ match: <match>, matchLength: <matchLength> }`
      // objects on increasing index first and on the length otherwise.
      matchesWithLength.sort(function(a, b) {
        return a.match === b.match ? a.matchLength - b.matchLength : a.match - b.match;
      });
      for (var i = 0, len = matchesWithLength.length; i < len; i++) {
        if (isSubTerm(matchesWithLength, i)) {
          continue;
        }
        matches.push(matchesWithLength[i].match);
        matchesLength.push(matchesWithLength[i].matchLength);
      }
    },
    _isEntireWord: function _isEntireWord(content, startIdx, length) {
      if (startIdx > 0) {
        var first = content.charCodeAt(startIdx);
        var limit = content.charCodeAt(startIdx - 1);
        if (getCharacterType(first) === getCharacterType(limit)) {
          return false;
        }
      }
      var endIdx = startIdx + length - 1;
      if (endIdx < content.length - 1) {
        var last = content.charCodeAt(endIdx);
        var _limit = content.charCodeAt(endIdx + 1);
        if (getCharacterType(last) === getCharacterType(_limit)) {
          return false;
        }
      }
      return true;
    },
    _calculatePhraseMatch: function _calculatePhraseMatch(query, pageIndex, pageContent, entireWord) {
      var matches = [];
      var queryLen = query.length;

      var matchIdx = -queryLen;
      while (true) {
        matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
        if (matchIdx === -1) {
          break;
        }
        if (entireWord && !this._isEntireWord(pageContent, matchIdx, queryLen)) {
          continue;
        }
        matches.push(matchIdx);
      }
      this._pageMatches[pageIndex] = matches;
    },
    _calculateWordMatch: function _calculateWordMatch(query, pageIndex, pageContent, entireWord) {
      var matchesWithLength = [];

      // Divide the query into pieces and search for text in each piece.
      var queryArray = query.match(/\S+/g);
      for (var i = 0, len = queryArray.length; i < len; i++) {
        var subquery = queryArray[i];
        var subqueryLen = subquery.length;

        var matchIdx = -subqueryLen;
        while (true) {
          matchIdx = pageContent.indexOf(subquery, matchIdx + subqueryLen);
          if (matchIdx === -1) {
            break;
          }
          if (entireWord && !this._isEntireWord(pageContent, matchIdx, subqueryLen)) {
            continue;
          }
          // Other searches do not, so we store the length.
          matchesWithLength.push({
            match: matchIdx,
            matchLength: subqueryLen,
            skipped: false
          });
        }
      }

      // Prepare arrays for storing the matches.
      this._pageMatchesLength[pageIndex] = [];
      this._pageMatches[pageIndex] = [];

      // Sort `matchesWithLength`, remove intersecting terms and put the result
      // into the two arrays.
      this._prepareMatches(matchesWithLength, this._pageMatches[pageIndex], this._pageMatchesLength[pageIndex]);
    },
    _calculateMatch: function _calculateMatch(pageIndex) {
      var pageContent = this._pageContents[pageIndex];
      var query = this._query;
      var _state = this._state,
        caseSensitive = _state.caseSensitive,
        entireWord = _state.entireWord,
        phraseSearch = _state.phraseSearch;


      if (query.length === 0) {
        // Do nothing: the matches should be wiped out already.
        return;
      }

      if (!caseSensitive) {
        pageContent = pageContent.toLowerCase();
        query = query.toLowerCase();
      }

      if (phraseSearch) {
        this._calculatePhraseMatch(query, pageIndex, pageContent, entireWord);
      } else {
        this._calculateWordMatch(query, pageIndex, pageContent, entireWord);
      }

      // When `highlightAll` is set, ensure that the matches on previously
      // rendered (and still active) pages are correctly highlighted.
      if (this._state.highlightAll) {
        this._updatePage(pageIndex);
      }
      if (this._resumePageIdx === pageIndex) {
        this._resumePageIdx = null;
        this._nextPageMatch();
      }

      // Update the match count.
      var pageMatchesCount = this._pageMatches[pageIndex].length;
      if (pageMatchesCount > 0) {
        this._matchesCountTotal += pageMatchesCount;
        this._updateUIResultsCount();
      }
    },
    _extractText: function _extractText() {
      var _this2 = this;

      // Perform text extraction once if this method is called multiple times.
      if (this._extractTextPromises.length > 0) {
        return;
      }

      var promise = Promise.resolve();

      var _loop = function _loop(i, ii) {
        var extractTextCapability = createPromiseCapability();
        _this2._extractTextPromises[i] = extractTextCapability.promise;
        var cach = null
        promise = promise.then(function() {
          return _this2._pdfDocument.getPage(i + 1)
            .then(function(pdfPage) {
              // _this2._viewport = pdfPage.getViewport(1);
              cach = pdfPage
              return pdfPage.getTextContent({
                normalizeWhitespace: true,
                combineTextItems: true
              });
            })
            .then(function(textContent) {

              var textItems = textContent.items;
              var strBuf = [];

              for (var j = 0, jj = textItems.length; j < jj; j++) {
                strBuf.push(textItems[j].str);
                // console.log(cach.commonObjs._objs[textItems[j].fontName].data.data);
              }

              // Store the normalized page content (text items) as one string.
              _this2._pageContents[i] = normalize(strBuf.join(''));
              _this2._pageTextContents[i] = textContent
              extractTextCapability.resolve(i);
            }, function(reason) {
              console.error('Unable to get text content for page ' + (i + 1), reason);
              // Page error -- assuming no text content.
              _this2._pageContents[i] = '';
              _this2._pageTextContents[i] = {}
              extractTextCapability.resolve(i);
            });
        });
      };

      for (var i = 0, ii = this._linkService.getPageCount(); i < ii; i++) {
        _loop(i, ii);
      }
    },
    _updatePage: function _updatePage(index) {
      if (this._scrollMatches && this._selected.pageIdx === index) {
        // If the page is selected, scroll the page into view, which triggers
        // rendering the page, which adds the text layer. Once the text layer
        // is built, it will attempt to scroll the selected match into view.
        this._linkService.page = index + 1;
      }
      this._eventBus.dispatch('updatetextlayermatches', {
        source: this,
        pageIndex: index
      });
    },
    _updateAllPages: function _updateAllPages() {
      this._eventBus.dispatch('updatetextlayermatches', {
        source: this,
        pageIndex: -1
      });
    },
    _nextMatch: function _nextMatch() {
      var _this3 = this;

      var previous = this._state.findPrevious;
      var currentPageIndex = this._linkService.page - 1;
      var numPages = this._linkService.getPageCount();

      this._highlightMatches = true;

      if (this._dirtyMatch) {
        // Need to recalculate the matches, reset everything.
        this._dirtyMatch = false;
        this._selected.pageIdx = this._selected.matchIdx = -1;
        this._offset.pageIdx = currentPageIndex;
        this._offset.matchIdx = null;
        this._offset.wrapped = false;
        this._resumePageIdx = null;
        this._pageMatches.length = 0;
        this._pageMatchesLength.length = 0;
        this._matchesCountTotal = 0;

        this._updateAllPages(); // Wipe out any previously highlighted matches.

        for (var i = 0; i < numPages; i++) {
          // Start finding the matches as soon as the text is extracted.
          if (this._pendingFindMatches[i] === true) {
            continue;
          }
          this._pendingFindMatches[i] = true;
          this._extractTextPromises[i].then(function(pageIdx) {
            delete _this3._pendingFindMatches[pageIdx];
            _this3._calculateMatch(pageIdx);
          });
        }
      }

      // If there's no query there's no point in searching.
      if (this._query === '') {
        this._updateUIState(FindState.FOUND);
        return;
      }
      // If we're waiting on a page, we return since we can't do anything else.
      if (this._resumePageIdx) {
        return;
      }

      var offset = this._offset;
      // Keep track of how many pages we should maximally iterate through.
      this._pagesToSearch = numPages;
      // If there's already a `matchIdx` that means we are iterating through a
      // page's matches.
      if (offset.matchIdx !== null) {
        var numPageMatches = this._pageMatches[offset.pageIdx].length;
        if (!previous && offset.matchIdx + 1 < numPageMatches || previous && offset.matchIdx > 0) {
          // The simple case; we just have advance the matchIdx to select
          // the next match on the page.
          offset.matchIdx = previous ? offset.matchIdx - 1 : offset.matchIdx + 1;
          this._updateMatch( /* found = */ true);
          return;
        }
        // We went beyond the current page's matches, so we advance to
        // the next page.
        this._advanceOffsetPage(previous);
      }
      // Start searching through the page.
      this._nextPageMatch();
    },
    _matchesReady: function _matchesReady(matches) {
      var offset = this._offset;
      var numMatches = matches.length;
      var previous = this._state.findPrevious;

      if (numMatches) {
        // There were matches for the page, so initialize `matchIdx`.
        offset.matchIdx = previous ? numMatches - 1 : 0;
        this._updateMatch( /* found = */ true);
        return true;
      }
      // No matches, so attempt to search the next page.
      this._advanceOffsetPage(previous);
      if (offset.wrapped) {
        offset.matchIdx = null;
        if (this._pagesToSearch < 0) {
          // No point in wrapping again, there were no matches.
          this._updateMatch( /* found = */ false);
          // While matches were not found, searching for a page
          // with matches should nevertheless halt.
          return true;
        }
      }
      // Matches were not found (and searching is not done).
      return false;
    },
    _nextPageMatch: function _nextPageMatch() {
      if (this._resumePageIdx !== null) {
        console.error('There can only be one pending page.');
      }

      var matches = null;
      do {
        var pageIdx = this._offset.pageIdx;
        matches = this._pageMatches[pageIdx];
        if (!matches) {
          // The matches don't exist yet for processing by `_matchesReady`,
          // so set a resume point for when they do exist.
          this._resumePageIdx = pageIdx;
          break;
        }
      } while (!this._matchesReady(matches));
    },
    _advanceOffsetPage: function _advanceOffsetPage(previous) {
      var offset = this._offset;
      var numPages = this._linkService.getPageCount();
      offset.pageIdx = previous ? offset.pageIdx - 1 : offset.pageIdx + 1;
      offset.matchIdx = null;

      this._pagesToSearch--;

      if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
        offset.pageIdx = previous ? numPages - 1 : 0;
        offset.wrapped = true;
      }
    },
    _updateMatch: function _updateMatch() {
      var found = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      var state = FindState.NOT_FOUND;
      var wrapped = this._offset.wrapped;
      this._offset.wrapped = false;

      if (found) {
        var previousPage = this._selected.pageIdx;
        this._selected.pageIdx = this._offset.pageIdx;
        this._selected.matchIdx = this._offset.matchIdx;
        state = wrapped ? FindState.WRAPPED : FindState.FOUND;

        // Update the currently selected page to wipe out any selected matches.
        if (previousPage !== -1 && previousPage !== this._selected.pageIdx) {
          this._updatePage(previousPage);
        }
      }

      this._updateUIState(state, this._state.findPrevious);
      if (this._selected.pageIdx !== -1) {
        // Ensure that the match will be scrolled into view.
        this._scrollMatches = true;

        this._updatePage(this._selected.pageIdx);
      }
    },
    _onFindBarClose: function _onFindBarClose(evt) {
      var _this4 = this;

      var pdfDocument = this._pdfDocument;
      // Since searching is asynchronous, ensure that the removal of highlighted
      // matches (from the UI) is async too such that the 'updatetextlayermatches'
      // events will always be dispatched in the expected order.
      this._firstPageCapability.promise.then(function() {
        // Only update the UI if the document is open, and is the current one.
        if (!_this4._pdfDocument || pdfDocument && _this4._pdfDocument !== pdfDocument) {
          return;
        }
        // Ensure that a pending, not yet started, search operation is aborted.
        if (_this4._findTimeout) {
          clearTimeout(_this4._findTimeout);
          _this4._findTimeout = null;
        }
        // Abort any long running searches, to avoid a match being scrolled into
        // view *after* the findbar has been closed. In this case `this._offset`
        // will most likely differ from `this._selected`, hence we also ensure
        // that any new search operation will always start with a clean slate.
        if (_this4._resumePageIdx) {
          _this4._resumePageIdx = null;
          _this4._dirtyMatch = true;
        }
        // Avoid the UI being in a pending state when the findbar is re-opened.
        _this4._updateUIState(FindState.FOUND);

        _this4._highlightMatches = false;
        _this4._updateAllPages(); // Wipe out any previously highlighted matches.
      });
    },
    _requestMatchesCount: function _requestMatchesCount() {
      var _selected = this._selected,
        pageIdx = _selected.pageIdx,
        matchIdx = _selected.matchIdx;

      var current = 0,
        total = this._matchesCountTotal;
      if (matchIdx !== -1) {
        for (var i = 0; i < pageIdx; i++) {
          current += this._pageMatches[i] && this._pageMatches[i].length || 0;
        }
        current += matchIdx + 1;
      }
      // When searching starts, this method may be called before the `pageMatches`
      // have been counted (in `_calculateMatch`). Ensure that the UI won't show
      // temporarily broken state when the active find result doesn't make sense.
      if (current < 1 || current > total) {
        current = total = 0;
      }
      return {
        current: current,
        total: total
      };
    },
    _updateUIResultsCount: function _updateUIResultsCount() {
      this._eventBus.dispatch('updatefindmatchescount', {
        source: this,
        matchesCount: this._requestMatchesCount()
      });
    },
    _updateUIState: function _updateUIState(state, previous) {
      this._eventBus.dispatch('updatefindcontrolstate', {
        source: this,
        state: state,
        previous: previous,
        matchesCount: this._requestMatchesCount()
      });
    },
    get highlightMatches() {
      return this._highlightMatches;
    },
    get pageMatches() {
      return this._pageMatches;
    },
    get pageMatchesLength() {
      return this._pageMatchesLength;
    },
    get selected() {
      return this._selected;
    },
    get state() {
      return this._state;
    },
    get _query() {
      if (this._state.query !== this._rawQuery) {
        this._rawQuery = this._state.query;
        this._normalizedQuery = normalize(this._state.query);
      }
      return this._normalizedQuery;
    }


  }

  exports.FindState = FindState;
  exports.PDFFindController = PDFFindController;

})(window);
