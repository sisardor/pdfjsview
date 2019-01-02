(function(exports) {
  'use strict';
  var CoreControls = exports.CoreControls;
  pdfjsLib.GlobalWorkerOptions.workerSrc = '//mozilla.github.io/pdf.js/build/pdf.worker.js';

  CoreControls.PDFJSDocument = function PDFJSDocument() {
    this.bookmarks = [];
    this.pages = [];
    this._thumbnails = [];
    this.pagesById = {};
    this.docId = null;
    this.scale = 1;
    this.rotation = 0;
    this.firstRun = true;
    this._pagesRefCache = Object.create(null);
    this.textLayerMode = 1;
    this.eventBus = getGlobalEventBus(false)
    this.findController = new PDFFindController({
      linkService: this,
      eventBus: this.eventBus
    });

    this.page = 1;

    if (document.getElementById('nextSearchResult')) {
      this.nextSearchResult = document.getElementById('nextSearchResult')
      this.nextSearchResult.addEventListener('click', () => {
        console.log('nextSearchResult');
        this.dispatchEvent('again', false);
      });
      this.prevSearchResult = document.getElementById('prevSearchResult')
      this.prevSearchResult.addEventListener('click', () => {
        console.log('prevSearchResult');
        this.dispatchEvent('again', true);
      });
      this.caseSensitive = document.getElementById('caseSensitiveSearch')
      this.caseSensitive.addEventListener('click', () => {
        this.dispatchEvent();
      });
    }

    // $('#fullSearchButton').on('click', function() {
    //   console.log($('#fullSearchBox').val());
    // });
    // $('#fullSearchBox').on('keypress', function(e) {
    //   if (e.which === 13) { // Enter keycode
    //     console.log($('#fullSearchBox').val());
    //   }
    // });
  };
  CoreControls.PDFJSDocument.prototype = Object.create(CoreControls.BaseDocument.prototype);
  CoreControls.PDFJSDocument.prototype.constructor = CoreControls.PDFJSDocument;
  // CoreControls.Document.registerDocumentType('pdfjs', CoreControls.PDFJSDocument)
  $.extend(CoreControls.PDFJSDocument.prototype, {
    getLinearizedURLSize: function getLinearizedURLSize(downloadInfo) {
      function arrayIndexOf(arr, toMatch, responsePos) {
        var arrLength = arr.length;
        for (var i = responsePos; i < arrLength; ++i) {
          if (arr[i] === toMatch) {
            return i;
          }
        }
        return -1;
      }

      var capability = createPromiseCapability();
      var xmlhttp = new XMLHttpRequest();
      xmlhttp.open('GET', downloadInfo.url);

      var customHeaders = downloadInfo['customHeaders'];
      if (customHeaders) {
        // set custom headers
        for (var header in customHeaders) {
          xmlhttp.setRequestHeader(header, customHeaders[header]);
        }
      }

      xmlhttp.setRequestHeader('Range', ['bytes=', 1, '-', 150].join(''));
      xmlhttp.responseType = 'arraybuffer';
      xmlhttp.onreadystatechange = function() {
        if (this.readyState === this.DONE) {
          var length = xmlhttp.response.byteLength;
          if (xmlhttp.status !== 206 && xmlhttp.status !== 200) {
            capability.reject({
              message: 'Received http error code ' + xmlhttp.status
            });
          } else if (length !== 150) {
            capability.reject({
              message: 'Byte ranges are not supported by the server.',
              data: new Uint8Array(xmlhttp.response)
            });
          }
          var response = new Uint8Array(xmlhttp.response);

          var toMatch = [76, 105, 110, 101, 97, 114, 105, 122, 101, 100];

          var contentRange = xmlhttp.getResponseHeader('Content-Range') || xmlhttp.getResponseHeader('content-range');

          if (contentRange) {
            // parse the content range to get the length of the file
            var fileLength = contentRange.split('/')[1];

            var responsePos = 0;
            do {
              responsePos = arrayIndexOf(response, toMatch[0], responsePos) + 1;
              for (var toMatchPos = 1; toMatchPos < 10; ++toMatchPos) {
                if (response[responsePos] === toMatch[toMatchPos]) {
                  ++responsePos;
                } else {
                  break;
                }
              }
              if (toMatchPos === 10) {
                // this file is most likely linearized
                capability.resolve(parseInt(fileLength, 10));
                return;
              }
            } while (responsePos !== 0);
            capability.reject({
              message: 'The file is not linearized.'
            });
          } else {
            capability.reject({
              message: 'Could not retrieve Content-Range header.'
            });
          }
        }
      };
      xmlhttp.onerror = function() {
        capability.reject({
          message: 'Network or Cross Domain Access Error.'
        });
      };
      xmlhttp.send();
      return capability.promise;
    },
    loadAsync: function PDFJSDocumentLoadAsync(partRetriever, onDocumentLoaded, options) {

      var getUserPassword = options['getPassword'];
      // console.log('loadAsync', partRetriever);
      var extension = options['extension'];
      var defaultPageSize = options['defaultPageSize'];
      var pageSizes = options['pageSizes'];

      var me = this;
      var haveFileData = function haveFileData(source) {
        me.pages = [];
        me.bind('documentReady', onDocumentLoaded);
        var docMessageKey, docMessageValue;

        var resourceFileLoaded = function resourceFileLoaded() {
          var sourceIsURL = typeof source === 'object' && 'url' in source; {
            // if we are using emscripten make sure we use the file if available
            if (file && isFile(file) && me.transport && me.transport.getWorkerType() === 'ems') {
              docMessageKey = 'file';
              docMessageValue = file;
            } else if (sourceIsURL) {
              docMessageKey = 'url';
              docMessageValue = source;
              me.hasDownloader = true;
            } else if (typeof source === 'string') {
              docMessageKey = 'filepath';
              docMessageValue = source;
            } else if (isArrayBuffer(source)) {
              docMessageKey = 'array';
              docMessageValue = source.buffer;
            } else if (typeof source === 'object' && 'type' in source && source.type === 'id') {
              // existing document
              docMessageKey = 'id';
              docMessageValue = source.id;
            } else {
              console.warn('Invalid parameter in getDocument, need either Uint8Array, ' + 'string or a parameter object');
            }
            var docData = {
              'type': docMessageKey,
              'value': docMessageValue,
              'extension': extension,
              'defaultPageSize': defaultPageSize,
              'pageSizes': pageSizes
            };
            fetchDocument(docData);
          }
        };

        resourceFileLoaded();
      };

      function incrementalDownloadWarning(url, reason) {
        console.warn('Could not use incremental download for url ' + url + '. Reason: ' + reason);
      }

      var isCrossDomainRequest = function isCrossDomainRequest(url) {
        return url.indexOf(window.parent.location.hostname) === -1;
      };

      var file = partRetriever.getFile();
      // if we are on Chrome we will assume that this is going to need buffer data (because it will likely use PNaCl)

      if (exports.utils.isJSWorker && exports.jsworker) {
        file = exports.jsworker.worker.getPlatformFormatFilePath(file);
        haveFileData(file);
      } else if (file && file.url) {
        // file containing url is checked

        this.getLinearizedURLSize(file).then(function(size) {
          file.size = size;
          file['withCredentials'] = isCrossDomainRequest(file.url) ? partRetriever['withCredentials'] : true;
          haveFileData(file);
        }, function(error) {
          incrementalDownloadWarning(file.url, error.message);
          if (error.data) {
            haveFileData(error.data);
          } else {
            partRetriever.getFileData(haveFileData);
          }
        });
      } else if (file && !exports.utils.isChrome) {
        // check if file is a javascript File object
        haveFileData(file);
      } else {
        partRetriever.getFileData(haveFileData);
      }

      function isArrayBuffer(v) {
        return typeof v === 'object' && v !== null && v.byteLength !== undefined;
      }

      function isFile(v) {
        // need to check the toString representation to work around cross window issues, i.e. window.File !== window.top.File (except on Firefox for some reason!)
        // http://tobyho.com/2011/01/28/checking-types-in-javascript/
        var objectToString = Object.prototype.toString.call(v);
        return typeof v === 'object' && v !== null && (objectToString === '[object File]' || objectToString === '[object Blob]');
      }

      function attachTransportListener() {
        // eslint-disable-next-line no-unused-vars
        me.documentCompletePromise = new Promise(function(resolve, reject) {
          // for some annoying reason this code is removed by closure if bind is not in quotes
          me.bind('documentComplete', function() {
            me.unbind('documentComplete');
            resolve();
          });
        });
        me.transport.addEventListener(me.docId, function(data) {
          me.processEvent(data);
        });
      }

      function finishLoading(dimensions) {
        if (me.hasDownloader) {
          me.transport.isLinearizationValid(me.docId).then(function(data) {
            if (data) {
              me.finishLoadingDocument(dimensions, onDocumentLoaded);
            } else {
              incrementalDownloadWarning(file.url, 'Linearization data is invalid.');
              // restart the whole process by cleaning up this document
              me.unloadResources();
              partRetriever.getFileData(haveFileData);
            }
          });
        } else {
          me.finishLoadingDocument(dimensions, onDocumentLoaded);
        }
      }

      function fetchDocument(docData) {
        var pageDimensions = {}

        var loadingTask = pdfjsLib.getDocument({ data: docData.value});

        loadingTask.onPassword = (updateCallback, reason) => {
          console.log('onPassword');
          getUserPassword(updateCallback)
        };
        loadingTask.promise.then(function(pdf) {
          me.pdfDocument = pdf;
          me.findController.setDocument(pdf)
          var pagesCount = pdf.numPages;
          var firstPagePromiseX = pdf.getPage(1);
          var multiplier = exports.utils.getCanvasMultiplier();
          firstPagePromiseX.then(function(pdfPage) {
            var pageCount = pdf.numPages;
            var pagesCapability = createPromiseCapability();
            me.pagesPromise = pagesCapability.promise;
            pagesCapability.promise.then(function() {
              me._pageViewsReady = true;

              // if (!me.pagesHaveBeenUpdated) {
              //   console.log(pageDimensions);
              //   me.applyPagesUpdated({
              //     'pageDimensions': pageDimensions
              //   });
              // }

              onDocumentLoaded();
              me.trigger('documentComplete');
            });

            var isOnePageRenderedResolved = false;
            var onePageRenderedCapability = createPromiseCapability();
            me.onePageRendered = onePageRenderedCapability.promise;

            var firstPagePromise = pdf.getPage(1);
            me.firstPagePromise = firstPagePromise;


            firstPagePromise.then(function(pdfPage) {
              for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
                var viewport = pdfPage.getViewport({ scale: me.scale });
                var pageDimension = {
                  height: viewport.height,
                  id: pageNum,//'pdf-page-' + pdfPage.pageIndex,
                  matrix: viewport.transform,
                  rotation: viewport.rotation,
                  width: viewport.width
                }
                pageDimensions[pageNum] = pageDimension
                var pageView = new PDFJSPageView({
                  container: null,
                  id: pageNum,
                  matrix: me.sanitisePageMatrix(viewport.transform, { w: viewport.width, h: viewport.height }),
                  scale: me.scale,
                  renderingQueue: me.renderingQueue,
                  defaultViewport: viewport.clone(),
                  annotationLayerFactory: me,
                  textLayerFactory: me,
                  textLayerMode: me.textLayerMode
                });
                me.pages.push(pageView);
                me.pagesById[pageNum] = pageView;

                var thumbnail = new PDFJSThumbnailView({
                  container: null,
                  id: pageNum,
                  defaultViewport: viewport.clone(),
                  disableCanvasToImageConversion: false
                });
                me._thumbnails.push(thumbnail);

              }
              onePageRenderedCapability.resolve();
            });

            onePageRenderedCapability.promise.then(function() {
              if (pdf.loadingParams['disabledAutoFetch']) {
                pagesCapability.resolve();
                return;
              }
              var getPagesLeft = pagesCount;

              var _loop = function _loop(pageNum) {
                pdf.getPage(pageNum).then(function(pdfPage) {

                  var _viewport = pdfPage.getViewport({ scale: me.scale });
                  var _pageDimension = {
                    height: _viewport.height,
                    id: pageNum,//'pdf-page-' + pdfPage.pageIndex,
                    matrix: _viewport.transform,
                    rotation: _viewport.rotation,
                    width: _viewport.width
                  }
                  pageDimensions[pageNum] = _pageDimension
                  var pageView = me.pages[pageNum - 1];
                  if (!pageView.pdfPage) {
                    pageView.setPdfPage(pdfPage);
                  }
                  me._cachePageRef(pageNum, pdfPage.ref);
                  if (--getPagesLeft === 0) {
                    pagesCapability.resolve();
                  }
                }, function(err) {
                  console.error(err);
                  if (--getPagesLeft === 0) {
                    pagesCapability.resolve();
                  }
                });
              };

              for (var pageNum = 1; pageNum <= pageCount; ++pageNum) {
                _loop(pageNum);
              }
            });
          });
        });
      }
    },
    loadCanvasAsync: function PDFJSDocumentLoadCanvasAsync(pageIndex, zoom, pageRotation, drawComplete, drawProgressive, canvasNum) {

      var me = this;
      var options = getLoadCanvasOptions(pageIndex, zoom, pageRotation, drawComplete, drawProgressive, canvasNum);

      var pageIdx = options['pageIndex'];
      var pageZoom = options['getZoom']();
      var rotation = options['getPageRotation']();
      var multiplier = exports.utils.getCanvasMultiplier();
      var pageView = me.pages[pageIdx];
      pageRotation = options['getPageRotation']();
      var pageTransform = options['getPageTransform']();

      // var canvasMan = CoreControls.CanvasManager.setUpCanvas(pageView,pageZoom,pageRotation,pageTransform, undefined, undefined)
      // options['drawProgressive'](canvasMan.canvas);
      // options['drawComplete'](canvasMan.canvas, pageIdx);
      // return
      var updateScalePromise = new Promise(function(resolve, reject) {
        if (me.scale !== pageZoom || me.rotation !== rotation || me.firstRun) {
          me.scale = pageZoom;
          me.firstRun = false;
          me.rotation = rotation;
          for (var i = 0, ii = me.pages.length; i < ii; i++) {
            me.pages[i].update(pageZoom, rotation);
          }
          resolve(undefined);
        } else {
          resolve(undefined);
        }
      });

      updateScalePromise.then(function(value) {
        me._ensurePdfPageLoaded(pageView).then(function() {
          pageView.draw().promise.then(function(result) {
            options['drawProgressive'](result);
            options['drawComplete'](result, pageIdx);
          }, function(err) {
            console.error(err);
          });
        });
      });
    },
    getBookmarks: function getBookmarks() {
      var me = this;

      function copyBookmark(outline) {
        var children = [];
        outline.items.forEach(function(child_outline) {
          children.push(copyBookmark(child_outline));
        })

        var destRef = outline.dest[0];

        if (destRef instanceof Object) {
          var name = outline.title
          var pageNumber = me._cachedPageNumber(destRef);
          var xy = me._getXYDest(pageNumber, outline.dest);
          var parent = undefined;
          var verticalOffset = xy.verticalOffset;
          var horizontalOffset = xy.x;
          var url = undefined;
          if (pageNumber !== null) {
            var _b = new CoreControls.Bookmark(
              children,
              name,
              pageNumber,
              parent,
              verticalOffset,
              horizontalOffset,
              url
            )
          }
        }
        return _b
      }

      return me.pdfDocument.getOutline().then(function(outlines) {
        if (!outlines) {
          return [];
        }
        var bookmarks = [];
        for (var i = 0, len = outlines.length; i < len; i++) {
          bookmarks.push(copyBookmark(outlines[i]));
        }
        return bookmarks;
      });
    },
    loadThumbnailAsync: function PDFJSDocumentLoadThumbnailAsync(pageNum, onLoadThumbnail, name) {
      var thumbnailView = this._thumbnails[pageNum];
      this._ensurePdfPageLoaded(thumbnailView).then(function() {
        thumbnailView.draw().then(onLoadThumbnail)
      })
    },
    getPageCount: function PDFJSDocumentGetPageCount() {
      return this.pages.length;
    },
    shouldRequestAnnotations: function PDFJSDocumentShouldRequestAnnotations() {
      return true; //!this.hasDownloader;
    },
    getFileData: function getFileData(options) {
      if (('printDocument' in options) && options['printDocument']) {
        return Promise.reject('not supported')
      }
      return this.pdfDocument.getData()
    },
    applyPagesUpdated: function(data) {
      var me = this;

      me.pagesHaveBeenUpdated = true;
      data = data['pageDimensions'];
      var keys = Object.keys(data);

      var pages = this.pages;
      var oldText = new Array(pages.length);
      for (var i = 0; i < pages.length; ++i) {
        var page = pages[i];
        if (page.text) {
          oldText[i] = page.text;
        }
      }
      this.pages.length = 0;
      var pagesById = this.pagesById;

      var specialUpdates = [];
      var updatedPageIdSet = {};
      keys.forEach(function(pageNum) {
        var dat = data[pageNum];
        var contentChanged = !!dat['contentChanged'];
        dat = {
          'width': dat['width'],
          'height': dat['height'],
          'matrix': me.sanitisePageMatrix(dat['matrix'], { w: dat['width'], h: dat['height'] }),
          'rotation': 90 * dat['rotation'],
          'id': dat['id'],
          'pageNum': pageNum,
          'contentChanged': contentChanged // consumed by the viewer
        };
        if (pagesById[dat['id']]) {
          specialUpdates.push({ 'before': pagesById[dat['id']], 'after': dat });
        }
        pagesById[dat['id']] = new PageInfo(dat['width'], dat['height']);
        var page = pagesById[dat['id']];
        page.setFromPageData(dat);

        // avoid losing the text when this entry is updated
        if (!contentChanged) {
          var textEntry = oldText[pageNum - 1];
          if (textEntry) {
            page.text = textEntry;
          }
        }
        pages[pageNum - 1] = page;

        updatedPageIdSet[dat['id']] = true;
      });

      this.maxViewportZoom = this.calculateMaxViewportZoom();

      // If a page ID is not updated, delete it
      Object.keys(pagesById).forEach(function(currentPageId) {
        if (!(currentPageId in updatedPageIdSet)) {
          delete pagesById[currentPageId];
        }
      });
      return specialUpdates;
    },
    sanitisePageMatrix: function(matrix, currentPage) {
      // Rectify the page matrix so it keeos scaling and such but does not retain rotation
      // this is so the rotation can then be applied live later, but this page matrix can be applied at load time to
      // make sure the coordinate system in which we are operating is always the same
      var tmtx = new XODText.Matrix2D();
      tmtx.initCoordinates.apply(tmtx, matrix);
      var bb = this.calculateBoundingBox(tmtx, currentPage);
      tmtx.initCoordinates(1, 0, 0, -1, -bb.x1, bb.y2);
      return tmtx;
    },
    loadTextData: function(pageIndex, onComplete) {
      var selInfo = new XODText.SelectionInfo();
      if (pageIndex === 1) {
        return onComplete(selInfo)
      }
      onComplete(selInfo)
    },


    _getXYDest: function(pageNumber, destArray) {
      if (!this.pdfDocument) {
        return;
      }
      const pageView = (Number.isInteger(pageNumber) &&
        this.pages[pageNumber - 1]);
      if (!pageView) {
        console.error(`"${pageNumber}" is not a valid pageNumber parameter.`);
        return;
      }
      let x = 0,
        y = 0;
      let verticalOffset = 0;
      let horizontalOffset = 0;
      let width = 0,
        height = 0,
        widthScale, heightScale;
      let changeOrientation = (pageView.rotation % 180 === 0 ? false : true);
      let pageWidth = (changeOrientation ? pageView.height : pageView.width) / pageView.scale;
      let pageHeight = (changeOrientation ? pageView.width : pageView.height) / pageView.scale;
      // console.log(' pageWidth', pageWidth);
      // console.log(' pageHeight', pageHeight);
      let scale = 0;
      switch (destArray[1].name) {
        case 'XYZ':
          x = destArray[2];
          y = destArray[3];
          scale = destArray[4];
          verticalOffset = pageHeight - y
          // If x and/or y coordinates are not supplied, default to
          // _top_ left of the page (not the obvious bottom left,
          // since aligning the bottom of the intended page with the
          // top of the window is rarely helpful).
          // x = x !== null ? x : 0;
          // y = y !== null ? y : pageHeight;
          break;
        case 'Fit':
        case 'FitB':
          scale = 'page-fit';
          break;
        case 'FitH':
        case 'FitBH':
          y = destArray[2];
          scale = 'page-width';
          verticalOffset = pageHeight - y
          // According to the PDF spec, section 12.3.2.2, a `null` value in the
          // parameter should maintain the position relative to the new page.
          // if (y === null && this._location) {
          //   x = this._location.left;
          //   y = this._location.top;
          // }
          break;
        case 'FitV':
        case 'FitBV':
          x = destArray[2];
          // width = pageWidth;
          // height = pageHeight;
          scale = 'page-height';
          break;
        case 'FitR':
          x = destArray[2];
          y = destArray[3];
          verticalOffset = pageHeight - y
          width = destArray[4] - x;
          height = destArray[5] - y;
          // let hPadding = this.removePageBorders ? 0 : SCROLLBAR_PADDING;
          // let vPadding = this.removePageBorders ? 0 : VERTICAL_PADDING;
          //
          // widthScale = (this.container.clientWidth - hPadding) /
          //   width / CSS_UNITS;
          // heightScale = (this.container.clientHeight - vPadding) /
          //   height / CSS_UNITS;
          // scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
          break;
        default:
          console.error(`"${destArray[1].name}" is not a valid destination type.`);
          return;
      }
      return {
        x: x,
        y: y,
        verticalOffset: verticalOffset
      };
    },
    _ensurePdfPageLoaded: function(pageView) {
      var pageNumber = pageView.id;
      var promise = this.pdfDocument.getPage(pageNumber).then(function(pdfPage) {
        if (!pageView.pdfPage) {
          pageView.setPdfPage(pdfPage);
        }
        return pdfPage;
      }).catch(function(reason) {
        console.error('Unable to get page for page view', reason);
      });
      return promise;
    },
    _cachePageRef: function(pageNum, pageRef) {
      if (!pageRef) {
        return;
      }
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      this._pagesRefCache[refStr] = pageNum;
    },
    _cachedPageNumber: function(pageRef) {
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      return this._pagesRefCache && this._pagesRefCache[refStr] || null;
    },
    createAnnotationLayerBuilder: function(pdfPage, renderInteractiveForms = false) {
      return new PDFJSAnnotationLayerBuilder({
        pdfPage: pdfPage,
        renderInteractiveForms: renderInteractiveForms,
      });
    },
    createTextLayerBuilder: function(textLayerDiv, pageIndex, viewport, enhanceTextSelection = false) {
      return new PDFJSTextLayerBuilder({
        textLayerDiv: textLayerDiv,
        eventBus: this.eventBus,
        pageIndex: pageIndex,
        viewport: viewport,
        findController: this.findController,
        enhanceTextSelection: false //this.isInPresentationMode ? false : enhanceTextSelection,
      });
    },
    textSearch: function searchText(pattern, fullSearch, onSearchCallback) {
      // console.log('searchText', pattern, fullSearch, onSearchCallback);
      // PDFViewerApplication.findController.executeCommand('find' + evt.type, {
      //   query: evt.query,
      //   phraseSearch: evt.phraseSearch,
      //   caseSensitive: evt.caseSensitive,
      //   entireWord: evt.entireWord,
      //   highlightAll: evt.highlightAll,
      //   findPrevious: evt.findPrevious,
      // });
      this.pattern = pattern
      this.findController.executeCommand('find', {
        query: pattern,
        phraseSearch: true,
        caseSensitive: this.caseSensitive.checked,
        entireWord: false,
        highlightAll: true,
        findPrevious: undefined,
      })
    },
    findNextButton: function findNextButton() {

    },
    findPreviousButton: function findPreviousButton() {

    },
    dispatchEvent: function(type, findPrev) {
      this.findController.executeCommand('find' + type, {
        source: this,
        type: type,
        query: this.pattern,//this.findField.value,
        phraseSearch: true,
        caseSensitive: this.caseSensitive.checked,
        entireWord: false, //this.entireWord.checked,
        highlightAll: true, //this.highlightAll.checked,
        findPrevious: findPrev,
      });
    }
  });


  var RenderingStates = {
    INITIAL: 0,
    RUNNING: 1,
    PAUSED: 2,
    FINISHED: 3,
  };
  var EventBus = function EventBus() {
    var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref$dispatchToDOM = _ref.dispatchToDOM,
        dispatchToDOM = _ref$dispatchToDOM === undefined ? false : _ref$dispatchToDOM;

    this._listeners = Object.create(null);
    this._dispatchToDOM = dispatchToDOM === true;
  }
  EventBus.prototype = {
    on: function on(eventName, listener) {
      var eventListeners = this._listeners[eventName];
      if (!eventListeners) {
        eventListeners = [];
        this._listeners[eventName] = eventListeners;
      }
      eventListeners.push(listener);
    },
    off: function off(eventName, listener) {
      var eventListeners = this._listeners[eventName];
      var i = void 0;
      if (!eventListeners || (i = eventListeners.indexOf(listener)) < 0) {
        return;
      }
      eventListeners.splice(i, 1);
    },
    dispatch: function dispatch(eventName) {
      var eventListeners = this._listeners[eventName];
      if (!eventListeners || eventListeners.length === 0) {
        if (this._dispatchToDOM) {
          var _args = Array.prototype.slice.call(arguments, 1);
          this._dispatchDOMEvent(eventName, _args);
        }
        return;
      }
      // Passing all arguments after the eventName to the listeners.
      var args = Array.prototype.slice.call(arguments, 1);
      // Making copy of the listeners array in case if it will be modified
      // during dispatch.
      eventListeners.slice(0).forEach(function (listener) {
        listener.apply(null, args);
      });
      if (this._dispatchToDOM) {
        this._dispatchDOMEvent(eventName, args);
      }
    },
    _dispatchDOMEvent: function _dispatchDOMEvent(eventName) {
      var args = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

      var details = Object.create(null);
      if (args && args.length > 0) {
        var obj = args[0];
        for (var key in obj) {
          var value = obj[key];
          if (key === 'source') {
            if (value === window || value === document) {
              return; // No need to re-dispatch (already) global events.
            }
            continue; // Ignore the `source` property.
          }
          details[key] = value;
        }
      }
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent(eventName, true, true, details);
      document.dispatchEvent(event);
    }
  }
  var globalEventBus = null;
  function getGlobalEventBus() {
    var dispatchToDOM = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    if (!globalEventBus) {
      globalEventBus = new EventBus({ dispatchToDOM: dispatchToDOM });
    }
    return globalEventBus;
  }
  function getLoadCanvasOptions(pageIndex, zoom, pageRotation, drawComplete, drawProgressive, canvasNum) {
    var options = {
      'getZoom': function getZoom() {
        return 1;
      },
      'getPageRotation': function getPageRotation() {
        return CoreControls.PageRotation.e_0;
      },
      'finishedLoading': function finishedLoading() {
        return true;
      },
      'acquireResources': function acquireResources() {
        return true;
      },
      'resourcesLoaded': function resourcesLoaded() {
        return true;
      },
      'getPageTransform': function getPageTransform() {},
      'drawProgressive': function drawProgressive() {},
      'drawComplete': function drawComplete() {},
      'onError': function onError() {}
    };

    if (_.isObject(pageIndex)) {
      // if the options are passed in as an object
      options = $.extend(options, pageIndex);
      if (options['zoom']) {
        options['getZoom'] = function() {
          return options['zoom'];
        };
      }
      if (options['pageRotation']) {
        options['getPageRotation'] = function() {
          return options['pageRotation'];
        };
      }
    } else {
      // if the options are passed in the old way as parameters
      options = $.extend(options, {
        'pageIndex': pageIndex,
        'getZoom': function getZoom() {
          return zoom;
        },
        'getPageRotation': function getPageRotation() {
          return pageRotation;
        },
        'drawProgressive': drawProgressive,
        'drawComplete': drawComplete,
        'canvasNum': canvasNum
      });
    }
    return options;
  }
  exports.RenderingStates = RenderingStates
  exports.getGlobalEventBus = getGlobalEventBus;
})(window);
