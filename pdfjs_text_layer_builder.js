(function(exports) {
  'use strict';

  var renderTextLayer = pdfjsLib.renderTextLayer;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  var PDFJSTextLayerBuilder = function PDFJSTextLayerBuilder(_ref) {
    var textLayerDiv = _ref.textLayerDiv,
      eventBus = _ref.eventBus,
      pageIndex = _ref.pageIndex,
      viewport = _ref.viewport,
      _ref$findController = _ref.findController,
      findController = _ref$findController === undefined ? null : _ref$findController,
      _ref$enhanceTextSelec = _ref.enhanceTextSelection,
      enhanceTextSelection = _ref$enhanceTextSelec === undefined ? false : _ref$enhanceTextSelec;

    _classCallCheck(this, PDFJSTextLayerBuilder);
    this.eventBus = eventBus
    this.textLayerDiv = textLayerDiv;
    this.textContent = null;
    this.textContentItemsStr = [];
    this.textContentStream = null;
    this.renderingDone = false;
    this.pageIdx = pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = viewport;
    this.textDivs = [];
    this.canvasInfo = {};
    this.findController = findController;
    this.textLayerRenderTask = null;
    this.enhanceTextSelection = enhanceTextSelection;

    this._boundEvents = Object.create(null);
    this._bindEvents();

    this._bindMouse();
  };

  PDFJSTextLayerBuilder.prototype = {
    _finishRendering: function _finishRendering() {
      this.renderingDone = true;

      if (!this.enhanceTextSelection) {
        var endOfContent = document.createElement('div');
        endOfContent.className = 'endOfContent';
        this.textLayerDiv.appendChild(endOfContent);
      }
    },

    render: function render() {
      var _this = this;

      var timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

      if (!(this.textContent || this.textContentStream) || this.renderingDone) {
        return;
      }
      this.cancel();

      this.textDivs = [];
      var textLayerFrag = document.createDocumentFragment();

      this.textLayerRenderTask = renderTextLayer({
        textContent: this.textContent,
        textContentStream: this.textContentStream,
        container: textLayerFrag,
        viewport: this.viewport,
        textDivs: this.textDivs,
        textContentItemsStr: this.textContentItemsStr,
        timeout: timeout,
        enhanceTextSelection: this.enhanceTextSelection
      });
      this.textLayerRenderTask.promise.then(function(res) {
        _this.textLayerDiv.appendChild(textLayerFrag);
        _this._finishRendering();
        _this._updateMatches();
      }, function(reason) {
        // Cancelled or failed to render text layer; skipping errors.
      });
    },
    setTextContentStream: function setTextContentStream(readableStream) {
      this.cancel();
      this.textContentStream = readableStream;
    },

    cancel: function cancel() {
      if (this.textLayerRenderTask) {
        this.textLayerRenderTask.cancel();
        this.textLayerRenderTask = null;
      }
    },

    _convertMatches: function _convertMatches(matches, matchesLength) {
      // Early exit if there is nothing to convert.
      if (!matches) {
        return [];
      }
      var findController = this.findController,
          textContentItemsStr = this.textContentItemsStr;


      var i = 0,
          iIndex = 0;
      var end = textContentItemsStr.length - 1;
      var queryLen = findController.state.query.length;
      var result = [];

      for (var m = 0, mm = matches.length; m < mm; m++) {
        // Calculate the start position.
        var matchIdx = matches[m];

        // Loop over the divIdxs.
        while (i !== end && matchIdx >= iIndex + textContentItemsStr[i].length) {
          iIndex += textContentItemsStr[i].length;
          i++;
        }

        if (i === textContentItemsStr.length) {
          console.error('Could not find a matching mapping');
        }

        var match = {
          begin: {
            divIdx: i,
            offset: matchIdx - iIndex
          }
        };

        // Calculate the end position.
        if (matchesLength) {
          // Multiterm search.
          matchIdx += matchesLength[m];
        } else {
          // Phrase search.
          matchIdx += queryLen;
        }

        // Somewhat the same array as above, but use > instead of >= to get
        // the end position right.
        while (i !== end && matchIdx > iIndex + textContentItemsStr[i].length) {
          iIndex += textContentItemsStr[i].length;
          i++;
        }

        match.end = {
          divIdx: i,
          offset: matchIdx - iIndex
        };
        result.push(match);
      }
      return result;
    },

    _renderMatches: function _renderMatches(matches) {
      // Early exit if there is nothing to render.
      if (matches.length === 0) {
        return;
      }
      var findController = this.findController,
        pageIdx = this.pageIdx,
        textContentItemsStr = this.textContentItemsStr,
        textDivs = this.textDivs;


      var isSelectedPage = pageIdx === findController.selected.pageIdx;
      var selectedMatchIdx = findController.selected.matchIdx;
      var highlightAll = findController.state.highlightAll;
      var prevEnd = null;
      var infinity = {
        divIdx: -1,
        offset: undefined
      };

      function beginText(begin, className) {
        var divIdx = begin.divIdx;
        textDivs[divIdx].textContent = '';
        appendTextToDiv(divIdx, 0, begin.offset, className);
      }

      function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
        var div = textDivs[divIdx];
        var content = textContentItemsStr[divIdx].substring(fromOffset, toOffset);
        var node = document.createTextNode(content);
        if (className) {
          var span = document.createElement('span');
          span.className = className;
          span.appendChild(node);
          div.appendChild(span);
          return;
        }
        div.appendChild(node);
      }

      var i0 = selectedMatchIdx,
        i1 = i0 + 1;
      if (highlightAll) {
        i0 = 0;
        i1 = matches.length;
      } else if (!isSelectedPage) {
        // Not highlighting all and this isn't the selected page, so do nothing.
        return;
      }

      for (var i = i0; i < i1; i++) {
        var match = matches[i];
        var begin = match.begin;
        var end = match.end;
        var isSelected = isSelectedPage && i === selectedMatchIdx;
        var highlightSuffix = isSelected ? ' selected' : '';

        if (isSelected) {
          // Attempt to scroll the selected match into view.
          findController.scrollMatchIntoView({
            element: textDivs[begin.divIdx],
            pageIndex: pageIdx,
            matchIndex: selectedMatchIdx
          });
        }

        // Match inside new div.
        if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
          // If there was a previous div, then add the text at the end.
          if (prevEnd !== null) {
            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
          }
          // Clear the divs and set the content until the starting point.
          beginText(begin);
        } else {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
        }

        if (begin.divIdx === end.divIdx) {
          appendTextToDiv(begin.divIdx, begin.offset, end.offset, 'highlight' + highlightSuffix);
        } else {
          appendTextToDiv(begin.divIdx, begin.offset, infinity.offset, 'highlight begin' + highlightSuffix);
          for (var n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
            textDivs[n0].className = 'highlight middle' + highlightSuffix;
          }
          beginText(end, 'highlight end' + highlightSuffix);
        }
        prevEnd = end;
      }

      if (prevEnd) {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
      }


      var me = this
      function convertToCanvasCoords([x, y, width, height]) {
        var scale = me.canvasInfo.scale;
        var canvasHeight = me.canvasInfo.canvasHeight;
        return [x * scale, canvasHeight - ((y + height) * scale), width * scale, height * scale];
      }

      const textContent = this.findController._pageTextContents[0]
      const item = textContent.items[0];
      const transform = item.transform;
      const x = transform[4];
      const y = transform[5];
      const width = item.width;
      const height = item.height;
      var x1 = x;
      var x2 = x + width
      var x3 = x + width
      var x4 = x

      var xy = pdfjsLib.Util.transform(this.viewport.transform, textContent.items[0].transform)
      var res = convertToCanvasCoords([x, y, width, height])
      // console.log('===========');
      // console.log(xy);
      // console.log('===========');


    },

    _updateMatches: function _updateMatches() {
      // Only show matches when all rendering is done.
      if (!this.renderingDone) {
        return;
      }
      var findController = this.findController,
        matches = this.matches,
        pageIdx = this.pageIdx,
        textContentItemsStr = this.textContentItemsStr,
        textDivs = this.textDivs;

      var clearedUntilDivIdx = -1;

      // Clear all current matches.
      for (var i = 0, ii = matches.length; i < ii; i++) {
        var match = matches[i];
        var begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
        for (var n = begin, end = match.end.divIdx; n <= end; n++) {
          var div = textDivs[n];
          div.textContent = textContentItemsStr[n];
          div.className = '';
        }
        clearedUntilDivIdx = match.end.divIdx + 1;
      }

      if (!findController || !findController.highlightMatches) {
        return;
      }
      // Convert the matches on the `findController` into the match format
      // used for the textLayer.
      var pageMatches = findController.pageMatches[pageIdx] || null;
      var pageMatchesLength = findController.pageMatchesLength[pageIdx] || null;

      this.matches = this._convertMatches(pageMatches, pageMatchesLength);
      this._renderMatches(this.matches);
    },

    _bindEvents: function _bindEvents() {
      var _this = this;

      var eventBus = this.eventBus,
          _boundEvents = this._boundEvents;


      _boundEvents.pageCancelled = function (evt) {
        if (evt.pageNumber !== _this.pageNumber) {
          return;
        }
        if (_this.textLayerRenderTask) {
          console.error('TextLayerBuilder._bindEvents: `this.cancel()` should ' + 'have been called when the page was reset, or rendering cancelled.');
          return;
        }
        // Ensure that all event listeners are cleaned up when the page is reset,
        // since re-rendering will create new `TextLayerBuilder` instances and the
        // number of (stale) event listeners would otherwise grow without bound.
        for (var name in _boundEvents) {
          eventBus.off(name.toLowerCase(), _boundEvents[name]);
          delete _boundEvents[name];
        }
      };
      _boundEvents.updateTextLayerMatches = function (evt) {
        console.log(evt);
        if (evt.pageIndex !== _this.pageIdx && evt.pageIndex !== -1) {
          return;
        }
        _this._updateMatches();
      };

      eventBus.on('pagecancelled', _boundEvents.pageCancelled);
      eventBus.on('updatetextlayermatches', _boundEvents.updateTextLayerMatches);
    },

    _bindMouse: function _bindMouse() {
      let div = this.textLayerDiv;
      let expandDivsTimer = null;

      div.addEventListener('mousedown', (evt) => {
        if (this.enhanceTextSelection && this.textLayerRenderTask) {
          this.textLayerRenderTask.expandTextDivs(true);
          if ((typeof PDFJSDev === 'undefined' ||
               !PDFJSDev.test('FIREFOX || MOZCENTRAL')) &&
              expandDivsTimer) {
            clearTimeout(expandDivsTimer);
            expandDivsTimer = null;
          }
          return;
        }

        let end = div.querySelector('.endOfContent');
        if (!end) {
          return;
        }
        if (typeof PDFJSDev === 'undefined' ||
            !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
          // On non-Firefox browsers, the selection will feel better if the height
          // of the `endOfContent` div is adjusted to start at mouse click
          // location. This avoids flickering when the selection moves up.
          // However it does not work when selection is started on empty space.
          let adjustTop = evt.target !== div;
          if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
            adjustTop = adjustTop && window.getComputedStyle(end).
              getPropertyValue('-moz-user-select') !== 'none';
          }
          if (adjustTop) {
            let divBounds = div.getBoundingClientRect();
            let r = Math.max(0, (evt.pageY - divBounds.top) / divBounds.height);
            end.style.top = (r * 100).toFixed(2) + '%';
          }
        }
        end.classList.add('active');
      });

      div.addEventListener('mouseup', () => {
        if (this.enhanceTextSelection && this.textLayerRenderTask) {
          if (typeof PDFJSDev === 'undefined' ||
              !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
            expandDivsTimer = setTimeout(() => {
              if (this.textLayerRenderTask) {
                this.textLayerRenderTask.expandTextDivs(false);
              }
              expandDivsTimer = null;
            }, EXPAND_DIVS_TIMEOUT);
          } else {
            this.textLayerRenderTask.expandTextDivs(false);
          }
          return;
        }

        let end = div.querySelector('.endOfContent');
        if (!end) {
          return;
        }
        if (typeof PDFJSDev === 'undefined' ||
            !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
          end.style.top = '';
        }
        end.classList.remove('active');
      });
    }
  };

  exports.PDFJSTextLayerBuilder = PDFJSTextLayerBuilder;
})(window);