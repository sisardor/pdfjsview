(function(exports) {
  'use strict';

  pdfjsLib['GlobalWorkerOptions']['workerSrc'] = '//mozilla.github.io/pdf.js/build/pdf.worker.js';

  exports.CoreControls.PDFJSDocument = function PDFJSDocument() {
    this.bookmarks = [];
    this.pages = [];
    this._thumbnails = [];
    this.pagesById = {};
    this.textCallbacksLookup = {};
    this.docId = null;
    this.scale = 1;
    this.rotation = 0;
    this.firstRun = true;
    this._pagesRefCache = Object.create(null);
    this.textLayerMode = 1;
    this.eventBus = getGlobalEventBus(false)
    this.findController = new exports.PDFFindController({
      linkService: this,
      eventBus: this.eventBus
    });

    this.page = 1;
    var me = this
    if (document.getElementById('nextSearchResult')) {
      this.nextSearchResult = document.getElementById('nextSearchResult')
      this.nextSearchResult.addEventListener('click', function() {
        console.log('nextSearchResult');
        me.dispatchEvent('again', false);
      });
      this.prevSearchResult = document.getElementById('prevSearchResult')
      this.prevSearchResult.addEventListener('click', function() {
        console.log('prevSearchResult');
        me.dispatchEvent('again', true);
      });
      this.caseSensitive = document.getElementById('caseSensitiveSearch')
      this.caseSensitive.addEventListener('click', function() {
        me.dispatchEvent();
      });
      this.wholeWordSearch = document.getElementById('wholeWordSearch')
      this.wholeWordSearch.addEventListener('click', function() {
        me.dispatchEvent('entirewordchange');
      });
      this.clearSearchResults = document.getElementById('clearSearchResults')
      this.clearSearchResults.addEventListener('click', function() {
        me.eventBus.dispatch('findbarclose');
      });
    }


    // exports.CoreControls.DocumentViewer.prototype.textSearch = function (fullSearch, onSearchCallback) {
    //   var pattern = this.currentPattern
    //   me.textSearch(pattern, fullSearch, onSearchCallback)
    // }

    console.log(this);
  };
  exports.CoreControls.PDFJSDocument.prototype = Object.create(exports.CoreControls.BaseDocument.prototype);
  exports.CoreControls.PDFJSDocument.prototype.constructor = exports.CoreControls.PDFJSDocument;
  exports.CoreControls.Document.registerDocumentType('pdfjs', exports.CoreControls.PDFJSDocument);

  $.extend(exports.CoreControls.PDFJSDocument.prototype, {
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


      function fetchDocument(docData) {
        var pageDimensions = {}

        var loadingTask = pdfjsLib.getDocument({ data: docData.value});

        loadingTask.onPassword = function(updateCallback, reason) {
          console.log('onPassword');
          getUserPassword(updateCallback)
        };
        loadingTask.promise.then(function(pdf) {
          me.pdfDocument = pdf;
          me.findController.setDocument(pdf)
          console.log(pdf);

          var pagesCount = pdf.numPages;
          var firstPagePromiseX = pdf['getPage'](1);
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

            var firstPagePromise = pdf['getPage'](1);
            me.firstPagePromise = firstPagePromise;


            firstPagePromise.then(function(pdfPage) {
              for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
                var viewport = pdfPage['getViewport']({ scale: me.scale });
                var pageDimension = {
                  height: viewport.height,
                  id: pageNum,//'pdf-page-' + pdfPage.pageIndex,
                  matrix: viewport.transform,
                  rotation: viewport.rotation,
                  width: viewport.width
                }
                pageDimensions[pageNum] = pageDimension
                var pageView = new exports.PDFJSPageView({
                  container: null,
                  id: pageNum,
                  matrix: me.sanitisePageMatrix(viewport.transform, { w: viewport.width, h: viewport.height }),
                  scale: me.scale,
                  renderingQueue: me.renderingQueue,
                  defaultViewport: viewport.clone(),
                  // annotationLayerFactory: me,
                  textLayerFactory: me,
                  textLayerMode: me.textLayerMode,
                  eventBus: me.eventBus
                });
                me.pages.push(pageView);
                me.pagesById[pageNum] = pageView;

                var thumbnail = new exports.PDFJSThumbnailView({
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
              if (pdf['loadingParams']['disabledAutoFetch']) {
                pagesCapability.resolve();
                return;
              }
              var getPagesLeft = pagesCount;

              var _loop = function _loop(pageNum) {
                pdf['getPage'](pageNum).then(function(pdfPage) {

                  var _viewport = pdfPage['getViewport']({ scale: me.scale });
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

      // var canvasMan = exports.CoreControls.CanvasManager.setUpCanvas(pageView,pageZoom,pageRotation,pageTransform, undefined, undefined)
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
            var _b = new exports.CoreControls.Bookmark(
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

      return me.pdfDocument['getOutline']().then(function(outlines) {
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
    'loadTextData': function(pageIndex, onComplete) {
      var me = this;
      if (me.pages[pageIndex].text !== null) {
        onComplete(me.pages[pageIndex].text);
      } else if (pageIndex in me.textCallbacksLookup) {
        me.textCallbacksLookup[pageIndex].push(onComplete);
      } else {
        exports.utils.log('text', 'Load text ' + (pageIndex + 1));
        var pdfPageCache = null;
        me.pdfDocument.getPage(pageIndex + 1)
          .then(function(pdfPage) {
            pdfPageCache = pdfPage
            return pdfPage.getTextContent({
              // normalizeWhitespace: true,
              // combineTextItems: true
            });
          })
          .then(function(textContent) {










            let page = me.pages[0];
            let pdfjs_fonts = me._map_font_data(pdfPageCache.commonObjs._objs)
            let xod_stucts = [], xod_quads = [], xod_str = '';
            let line_count = 0;
            for (let i = 0, len = textContent.items.length; i < len; i++) {
              let fontProvider = pdfjs_fonts[textContent.items[i].fontName];
              let text = textContent.items[i].str
              if (text.length === 1 && text === ' ') {
                xod_str += text;
                continue;
              }
              let options = {
                item: textContent.items[i],
                pageMatrix: page.matrix,
                fontProvider: fontProvider,
                charCount: xod_str.length
              }

              var line = new XLine(options);
              line.run()
              xod_stucts = xod_stucts.concat(line.lineStruct)
              xod_quads = xod_quads.concat(line.quads)
              xod_str += line.textLine;
              console.log(line);
              line_count++;
              // console.log('\n');
            }
            var data_struct = [line_count].concat(xod_stucts)
            // console.log(xod_str);
            // console.log(data_quads);
            // console.log(data_struct);
            var xod_data = {
              offsets: [],// [0, 1, 2, 3, 4, 5, 6, 7, 8, -2],
              quads: xod_quads,
              str: xod_str,
              struct: data_struct
            }

            console.log(xod_data);
            var selInfo = new XODText.SelectionInfo();
            selInfo.parseFromOld({
              m_Struct: xod_data['struct'],
              m_Str: xod_data['str'],
              m_Offsets: xod_data['offsets'],
              m_Quads: xod_data['quads'],
              m_Ready: true
            });
            me.correctQuadsForPageRotation(pageIndex, selInfo);
            me.pages[pageIndex].text = selInfo;
            me.textCallbacksLookup[pageIndex].forEach(function(completeCB) {
              exports.utils.log('text', 'Callback ' + pageIndex);
              completeCB(selInfo);
            });
            delete me.textCallbacksLookup[pageIndex];















          })
        me.textCallbacksLookup[pageIndex] = [onComplete];
      }
    },






    'loadTextDataX': function(pageIndex, onComplete) {
      var me = this;
      if (me.pages[pageIndex].text !== null) {
        onComplete(me.pages[pageIndex].text);
      } else if (pageIndex in me.textCallbacksLookup) {
        me.textCallbacksLookup[pageIndex].push(onComplete);
      } else {
        exports.utils.log('text', 'Load text ' + (pageIndex + 1));
        var pdfPageCache = null;
        me.pdfDocument.getPage(pageIndex + 1)
          .then(function(pdfPage) {
            pdfPageCache = pdfPage
            return pdfPage.getTextContent({
              // normalizeWhitespace: true,
              // combineTextItems: true
            });
          })
          .then(function(textContent) {
            // "ff": String.fromCharCode(0xFB00),
            // "fi": String.fromCharCode(0xFB01),
            // "fl": String.fromCharCode(0xFB02),
            // "ffi": String.fromCharCode(0xFB03),
            // "ffl": String.fromCharCode(0xFB04),
            // "ft": String.fromCharCode(0xFB05),
            // "st": String.fromCharCode(0xFB06)
            exports.utils.log('text', 'Text Received ' + pageIndex);
            console.log(pdfPageCache);
            var unnormalUnicode = {
              'f': 317,
              'i': 240,
              '\n': 0
            }
            // let c = document.getElementById("page1");
            // let ctx = c.getContext("2d");
            let MULTIPLIER = exports.utils.getCanvasMultiplier();
            let scale = 1//MULTIPLIER * me.pages[0].scale
            let _scale = MULTIPLIER * me.pages[0].scale
            let line_y = 0
            var data_quads = []
            var line_structs = []
            let xod_struct = ["number_of_lines"]
            let xod_str = ''
            let num_of_lines = 0;
            let number_of_words = 0;
            let char_pos = 0;
            let page = me.pages[0];
            let line_count = 0;
            let pdfjs_fonts = me._map_font_data(pdfPageCache.commonObjs._objs)
            for (var j = 0; j < 3; j++) {
              let item = textContent.items[j]
              let font = pdfjs_fonts[item.fontName]
              var unicodeMap = {}
              let xline = item.str
              font.data.toUnicode._map.filter(function (el, i) {
                if (el != null) {
                	unicodeMap[el] = i;
                }
                return el != null;
              });
              if (font.data.cMap) {
                font.data.toUnicode._map.filter(function (el, i) {
                  if (el != null) {
                    // console.log(el);
                    switch (el.charCodeAt(0)) {
                      case 0xFB03:
                        xline = xline.replace(/ffi/g, String.fromCharCode(0xFB03))
                        break;
                      default:
                        break;
                    }
                  	unicodeMap[el] = i;
                  }
                  return el != null;
                });
              }
              if (xline == '1.  Introduction') {
                console.log('BINGO');
              }



              let fontMatrix = (font.data.fontMatrix) ? font.data.fontMatrix : [0.001]
              let _transform = item.transform;

              // if (xline === ' ') continue;
              line_count++;
              if (xline.charAt(xline.length-1) === ' ') {
                xline = xline + '\n' //xline.replace(/.$/,"\n")
              } else {
                xline = xline + '\n'
              }


              let x = _transform[4];
              let y = _transform[5];
              let width = item.width;
              let height = _transform[0];
              let p = page.matrix.mult({x,y})
              xod_str += xline

              let char_length = width / (xline.length - 1)

              let xWord = ''
              let word_structs = []
              let aWord = '';
              let transform = item.transform.concat()
              let word_quads = []
              let w_quad = []
              let space_width = me.calculate_space_width(item, font, page)
              for(let i = 0, len = xline.length; i < len; i++) {
                char_pos++;
                xWord += xline[i]
                aWord += xline[i]
                var charWidth, charcode, widthCode;
                if (font.data.cMap) {
                  charcode = unicodeMap[xline.charAt(i)]
                } else {
                  charcode = xline.charCodeAt(i);
                }
                if (font.data.cMap && !charcode) {
                  // special case unicode e.g 'ffi'

                }

                widthCode = charcode;

                charWidth = font.data.widths[widthCode]
                if(!isNum(charWidth)) {
                  charWidth = unnormalUnicode[xline.charAt(i)]
                }
                charWidth = isNum(charWidth) ? charWidth : 0

                  var charSpacing = 0;
                  var textState = {fontSize: 1, textHScale:1 }
                  var w0 = charWidth * fontMatrix[0];
                  var tx = (w0 * textState.fontSize + charSpacing) *  textState.textHScale;
                  // transform[4] = transform[0] * tx + transform[2] * 0 + transform[4]
                  char_length = transform[0] * tx
                  if (tx === 0 ){
                    char_length = space_width
                  }
                  console.log(xline.charAt(i), char_length);

                let char_x = transform[4]//x + (char_length * i)
                // console.log(xline[i], char_length, transform);
                var char_quad = me._get_quad(char_x, p.y, char_length, height, scale)
                var q = [char_quad.x1, char_quad.y1, char_quad.x2, char_quad.y2 ,char_quad.x3, char_quad.y3, char_quad.x4, char_quad.y4]
                // data_quads = data_quads.concat(q)
                w_quad = w_quad.concat(q)



                // console.log(xline[i],char_pos,  q[0], q[1]);

                if (xline[i] === ' ') {
                  // aWord = aWord.trim()
                  // console.log(xWord, '|', aWord, char_x, char_quad.x2);
                  var offset = (aWord.length - 1 === 0) ? 0 : 1

                  let p0 = aWord.length - offset;
                  let p1 = char_pos - aWord.length;
                  let p2 = aWord.length - offset;
                  // let p3 = char_quad.x1 - (char_length  * (aWord.length - offset));
                  // let p4 = char_quad.x2 - char_length;
                  let p3 = w_quad[0]//char_quad.x1 - (char_length  * (aWord.length - offset));
                  let p4 = w_quad[w_quad.length - 1 - 7]//char_quad.x2 - char_length;
                  var w_struct = [p0, p1, p2, p3, p4]
                  console.log(aWord, w_struct);
                  word_structs = word_structs.concat(w_struct)
                  aWord = ''
                  data_quads = data_quads.concat(w_quad)
                  w_quad = []
                } else if (xline[i] === '\n') {

                  // aWord = aWord.trim()
                  // console.log(xWord, '|', aWord, char_x, char_quad.x2);
                  var offset = (aWord.length - 1 === 0) ? 0 : 1
                  let p0 = aWord.length - offset
                  let p1 = char_pos - aWord.length;
                  let p2 = aWord.length - offset
                  let p3 = w_quad[0]//char_quad.x1 - (char_length  * (aWord.length - offset));
                  let p4 = w_quad[w_quad.length - 1 - 7]//char_quad.x2 - char_length;
                  var w_struct = [p0, p1, p2, p3, p4]
                  console.log(aWord, w_struct);
                  word_structs = word_structs.concat(w_struct)
                  aWord = ''
                  data_quads = data_quads.concat(w_quad)
                  w_quad = []
                }

                transform[4] = char_length + transform[2] * 0 + transform[4]
              }
              // console.log(word_structs);
              let line_quad = me._get_quad(x, p.y, width, height)
              let _0 = 0;
              let _1 = xline.split(' ').length;
              let _2 = xline.length;
              let _3 = line_quad.x1;
              let _4 = line_quad.y3;
              let _5 = line_quad.x2;
              let _6 = line_quad.y1;
              let l_struct = [_1, _2, _3, _4, _5, _6];
              line_structs = line_structs.concat(l_struct).concat(word_structs)//data_struct.concat([_1, _2, _3, _4, _5, _6])
            }

            var data_struct = [line_count].concat(line_structs)
            // console.log(xod_str);
            // console.log(data_quads);
            // console.log(data_struct);
            var xod_data = {
              offsets: [],// [0, 1, 2, 3, 4, 5, 6, 7, 8, -2],
              quads: data_quads,
              str: xod_str,
              struct: data_struct
            }
            console.log(xod_data);
            var selInfo = new XODText.SelectionInfo();
            selInfo.parseFromOld({
              m_Struct: xod_data['struct'],
              m_Str: xod_data['str'],
              m_Offsets: xod_data['offsets'],
              m_Quads: xod_data['quads'],
              m_Ready: true
            });
            me.correctQuadsForPageRotation(pageIndex, selInfo);
            me.pages[pageIndex].text = selInfo;
            me.textCallbacksLookup[pageIndex].forEach(function(completeCB) {
              exports.utils.log('text', 'Callback ' + pageIndex);
              completeCB(selInfo);
            });
            delete me.textCallbacksLookup[pageIndex];
            return

          })
        me.textCallbacksLookup[pageIndex] = [onComplete];
      }
    },
    calculate_space_width: function(item, font, page){
      if (!/\s/.test(item.str)) {
        return 0;
      }
      let x = item.transform[4];
      let y = item.transform[5];
      let width = item.width;
      let height = item.transform[0];
      let transform = item.transform.concat()
      let fontMatrix = (font.data.fontMatrix) ? font.data.fontMatrix : [0.001]
      let tranformed_xy = page.matrix.mult({x,y})
      y = tranformed_xy.y
      let str = item.str;
      let isSpaceOccured = false;
      let cMapSpaceWidth = 0;
      var unicodeMap = {}
      if (font.data.cMap) {
        font.data.toUnicode._map.filter(function (el, i) {
          if (el != null) {
          	unicodeMap[el] = i;
          }
          return el != null;
        });
      }
      for(let i = 0, len = str.length; i < len; i++) {
        let widthCode, charWidth, charcode;
        if (font.data.cMap) {
          charcode = unicodeMap[str.charAt(i)];
        } else {
          charcode = str.charCodeAt(i);
        }
        widthCode = charcode;

        charWidth = font.data.widths[widthCode]
        charWidth = isNum(charWidth) ? charWidth : 1000
        if (!font.data.cMap && charcode === 32 && charWidth !== 0) {
          charWidth = 0;
        }


        let charSpacing = 0;
        let textState = {fontSize: 1, textHScale:1 }
        let w0 = charWidth * fontMatrix[0];
        let tx = (w0 * textState.fontSize + charSpacing) *  textState.textHScale;
        let char_length = transform[0] * tx

        transform[4] = char_length + transform[2] * 0 + transform[4]

        if (!font.data.cMap && charcode === 32) {
          isSpaceOccured = true;
        } else if(font.data.cMap && str.charAt(i) === ' ') {
          isSpaceOccured = true;
          cMapSpaceWidth = char_length;
        }
        // console.log(str.charAt(i),charcode, char_length);
      }
      let originalWidth = item.width + item.transform[4]
      let newWidth = transform[4]
      let calculatedWidth = (originalWidth - newWidth) / (str.split(' ').length - 1)
      if (!isSpaceOccured) {
        calculatedWidth = 0;
      }
      if (font.data.cMap && isSpaceOccured) {
        calculatedWidth = cMapSpaceWidth
      }
      console.log(item.transform, "width: ", originalWidth)
      console.log(transform, 'width: ', newWidth);
      // console.log(originalWidth, newWidth);
      console.log(str);
      console.log('Calculated width', calculatedWidth);
      console.log('\n--------------------------');
      return calculatedWidth
    },
    charsToGlyphs: function(chars) {
      var charsCashe = this.charsCache
      var glyphs, glyph, charcode;

      // if we translated this string before, just grab it from the cache
      if (charsCache) {
        glyphs = charsCache[chars];
        if (glyphs) {
          return glyphs;
        }
      }

      // lazily create the translation cache
      if (!charsCache) {
        charsCache = this.charsCache = Object.create(null);
      }

    },
    _map_font_data: function (_objs) {
      var fonts = {}
      for (var key in _objs) {
        fonts[_objs[key].data.loadedName] = _objs[key];
      }
      return fonts;
    },
    // 'loadTextData': function(pageIndex, onComplete) {
    //   var me = this;
    //
    //   var data = {
    //     "offsets":[0,1,2,3,4,5,6,7,8,-2],
    //     "quads":[30.493199999999998,80.91402960000016,48.6952575,80.91402960000016,48.6952575,54.43830960000014,30.493199999999998,54.43830960000014,48.011301399999994,80.91402960000016,60.013627799999995,80.91402960000016,60.013627799999995,54.43830960000014,48.011301399999994,54.43830960000014,60.013627799999995,80.91402960000016,71.9497649,80.91402960000016,71.9497649,54.43830960000014,60.013627799999995,54.43830960000014,71.94976489999999,80.91402960000016,86.1363382,80.91402960000016,86.1363382,54.43830960000014,71.94976489999999,54.43830960000014,86.1363382,80.91402960000016,91.5859239,80.91402960000016,91.5859239,54.43830960000014,86.1363382,54.43830960000014,91.5859239,80.91402960000016,103.5882503,80.91402960000016,103.5882503,54.43830960000014,91.5859239,54.43830960000014,103.4779348,80.91402960000016,120.8195314,80.91402960000016,120.8195314,54.43830960000014,103.4779348,54.43830960000014,120.4885849,80.91402960000016,132.49091130000002,80.91402960000016,132.49091130000002,54.43830960000014,120.4885849,54.43830960000014,132.49091130000002,80.91402960000016,140.0364915,80.91402960000016,140.0364915,54.43830960000014,132.49091130000002,54.43830960000014,132.49091130000002,80.91402960000016,140.0364915,80.91402960000016,140.0364915,54.43830960000014,132.49091130000002,54.43830960000014],
    //     "str":"WebViewer\n",
    //     "struct":[1,1,11,30.493199999999998,80.91402960000016,140.0364915,54.43830960000014,9,0,9,30.493199999999998,140.0364915]
    //   }
    //
    //   exports.utils.log('text', 'Text Received ' + pageIndex);
    //   var selInfo = new XODText.SelectionInfo();
    //   selInfo.parseFromOld({
    //     m_Struct: data['struct'],
    //     m_Str: data['str'],
    //     m_Offsets: data['offsets'],
    //     m_Quads: data['quads'],
    //     m_Ready: true
    //   });
    //   me.correctQuadsForPageRotation(pageIndex, selInfo);
    //   me.pages[pageIndex].text = selInfo;
    //   onComplete(selInfo)
    // },
    _get_quad: function(x, y, width, height, scale) {
      var extraButtomSpace = height * 0.23
      var x1 = x
      var y1 = (y - height)
      var x2 = x1 + width
      var y2 = y1
      var x3 = x2
      var y3 = (y1 + height) + extraButtomSpace
      var x4 = x1 + extraButtomSpace
      var y4 = y3
      return { x1, y1, x2, y2, x3, y3, x4, y4  }
    },
    _debug_ctx: function (ctx, _scale, line_quad, width, height) {
      ctx.rect(line_quad.x1 * _scale, line_quad.y1* _scale,  width* _scale, height* _scale);
      ctx.stroke();
    },
    _getXYDest: function(pageNumber, destArray) {
      if (!this.pdfDocument) {
        return;
      }
      var pageView = (Number.isInteger(pageNumber) && this.pages[pageNumber - 1]);
      if (!pageView) {
        console.error(pageNumber + " is not a valid pageNumber parameter.");
        return;
      }
      var x = 0,
        y = 0;
      var verticalOffset = 0;
      var horizontalOffset = 0;
      var width = 0,
        height = 0,
        widthScale, heightScale;
      var changeOrientation = (pageView.rotation % 180 === 0 ? false : true);
      var pageWidth = (changeOrientation ? pageView.height : pageView.width) / pageView.scale;
      var pageHeight = (changeOrientation ? pageView.width : pageView.height) / pageView.scale;
      // console.log(' pageWidth', pageWidth);
      // console.log(' pageHeight', pageHeight);
      var scale = 0;
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
          console.error(destArray[1].name + "is not a valid destination type.");
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
      var promise = this.pdfDocument['getPage'](pageNumber).then(function(pdfPage) {
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
    createAnnotationLayerBuilder: function(pdfPage) {
      var renderInteractiveForms = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      return new exports.PDFJSAnnotationLayerBuilder({
        pdfPage: pdfPage,
        renderInteractiveForms: renderInteractiveForms,
      });
    },
    createTextLayerBuilder: function(textLayerDiv, pageIndex, viewport) {
      var enhanceTextSelection = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
      return new exports.PDFJSTextLayerBuilder({
        textLayerDiv: textLayerDiv,
        eventBus: this.eventBus,
        doc: this,
        pageIndex: pageIndex,
        viewport: viewport,
        findController: this.findController,
        enhanceTextSelection: false
      });
    },
    textSearch: function searchText(pattern, fullSearch, onSearchCallback) {
      this.pattern = pattern
      this.findController.executeCommand('find', {
        query: pattern,
        phraseSearch: true,
        caseSensitive: this.caseSensitive.checked,
        entireWord: this.wholeWordSearch.checked,
        highlightAll: true,
        findPrevious: undefined,
      })
    },
    findNextButton: function findNextButton() {

    },
    findPreviousButton: function findPreviousButton() {

    },
    dispatchEvent2: function(type, findPrev) {
      this.findController.executeCommand('find', {
        source: this,
        type: type,
        query: this.pattern,
        phraseSearch: true,
        caseSensitive: this.caseSensitive.checked,
        entireWord: this.wholeWordSearch.checked,
        highlightAll: true,
        findPrevious: findPrev,
      });
    },
    dispatchEvent: function(type, findPrev) {
      this.findController.executeCommand('find' + type, {
        // source: this,
        type: type,
        query: this.pattern,//this.findField.value,
        phraseSearch: true,
        caseSensitive: this.caseSensitive.checked,
        entireWord: this.wholeWordSearch.checked,
        highlightAll: true, //this.highlightAll.checked,
        findPrevious: findPrev,
      });
    }
  });

  function isNum(v) {
    return typeof v === 'number';
  }

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
        return exports.CoreControls.PageRotation.e_0;
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
