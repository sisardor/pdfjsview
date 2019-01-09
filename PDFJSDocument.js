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
        me.pdfDocument.getPage(pageIndex + 1)
          .then(function(pdfPage) {
            return pdfPage.getTextContent({
              normalizeWhitespace: true,
              combineTextItems: true
            });
          })
          .then(function(textContent) {
            exports.utils.log('text', 'Text Received ' + pageIndex);

            let c = document.getElementById("page1");
            let ctx = c.getContext("2d");
            let MULTIPLIER = exports.utils.getCanvasMultiplier();
            let scale = 1//MULTIPLIER * me.pages[0].scale
            let _scale = MULTIPLIER * me.pages[0].scale
            let line_y = 0
            var data_quads = []
            var data_struct = []
            let xod_struct = ["number_of_lines"]
            let xod_str = ''
            let num_of_lines = 0;
            let number_of_words = 0;
            let char_pos = 0;
            let page = me.pages[0];

            for (var j = 0; j < textContent.items.length; j++) {
              let item = textContent.items[j]
              let transform = item.transform;
              let xline = item.str
              if (xline.charAt(xline.length-1) === ' ') {
                xline = xline.replace(/.$/,"\n")
              } else {
                xline = xline + '\n'
              }
              let line_struct = []

              let x = transform[4];
              let y = transform[5];
              let width = item.width;
              let height = transform[0];
              let p = page.matrix.mult({x,y})
              xod_str += xline

              let char_length = width / (xline.length - 1)
              let line_quad = me._get_quad(x, p.y, width * scale, height, scale)

              let xWord = ''
              let words = xline.split(' ')
              // console.log(words);

              let _0 = 0;
              let _1 = xline.split(' ').length;
              let _2 = xline.length;
              let _3 = line_quad.x1;
              let _4 = line_quad.y3;
              let _5 = line_quad.x2;
              let _6 = line_quad.y1;
              console.log('l',[_1, _2, _3, _4, _5, _6]);
              data_struct = data_struct.concat([_1, _2, _3, _4, _5, _6])
              let aWord = '';
              for(let i = 0, len = xline.length - 1; i < len; i++) {
                char_pos++;

                let char_x = x + (char_length * i)
                var char_quad = me._get_quad(char_x, p.y, char_length, height, scale)
                // if (xline[i] !== ' ') {
                  var q = [char_quad.x1, char_quad.y1, char_quad.x2, char_quad.y2 ,char_quad.x3, char_quad.y3, char_quad.x4, char_quad.y4]
                  data_quads = data_quads.concat(q)
                  // me._debug_ctx(ctx, _scale, char_quad, char_length, height)
                // }


                // console.log(xline[i],char_pos,  q[0], q[1]);
                xWord += xline[i]
                aWord += xline[i]
                if (xline[i] === ' ' || xline[i + 1] === "\n") {
                  aWord = aWord.trim()
                  // console.log(xWord, '|', aWord, char_x, char_quad.x2);

                  let _0 = aWord.length
                  let _1 = char_pos - aWord.length;
                  let _2 = aWord.length
                  // let _3 = char_pos - (char_length  * aWord.length);
                  let _3 = char_quad.x2 - (char_length  * aWord.length);
                  let _4 = char_quad.x2;
                  console.log('w', [_0, _1, _2, _3, _4]);
                  data_struct = data_struct.concat([_0, _1, _2, _3, _4])
                  aWord = ''
                }

                if (xline[i + 1] === "\n") {
                  var newline_quad = me._get_quad(char_x, p.y, 0, height, scale)
                  var q = [newline_quad.x1, newline_quad.y1, newline_quad.x2, newline_quad.y2 ,newline_quad.x3, newline_quad.y3, newline_quad.x4, newline_quad.y4]
                  data_quads = data_quads.concat(q)
                  // me._debug_ctx(ctx, _scale, newline_quad, char_length, height)
                  // console.log("\\n", char_pos,  q[0], q[1]);
                  // xWord += xline[i + 1]
                  continue
                }

              }

              // console.log(xWord + '   x:' + line_quad.x1 + ', y:' +line_quad.y1 + ', width:' + width + ', height:' + height);
              // let strPos = char_pos;
              // let strLen = xWord.length;
                // let _0 = xWord.length
                // let _1 = char_pos;
                // let _2 = xWord.length
                // let _3 =;
                // let _4 =;
              // console.log(xWord, strPos, strLen);

              // me._debug_ctx(ctx, _scale, line_quad, width, height)
            }
            data_struct = [textContent.items.length].concat(data_struct)
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










            for (var j = 0; j < textContent.items.length; j++) {
              let line_struct = ["number_of_words"]
              if (item.str === ' ') continue
              let transform = item.transform;
              let x = transform[4];
              let y = transform[5];
              let width = item.width;
              let height = transform[0];
              let page = me.pages[0];
              let p = page.matrix.mult({x,y})
              // if (line_y !== p.y) {
                // console.log('new line');
                console.log(item.str);
              xod_str += item.str;
                // line_y = p.y
                num_of_lines++;
              // }
              // line_y = p.y
              let str = item.str;
              var quad = me._get_quad(x, p.y, width * scale, height, scale)
              // var _quad = me._get_quad(x, p.y, width * _scale, height, _scale)
              // ctx.rect(_quad.x1, _quad.y1,  _quad.x2 - _quad.x1, _quad.y4 - _quad.y1);
              // ctx.stroke();
              let line_points = [11, quad.x1, quad.y4, quad.x2, quad.y2]
              line_struct = line_struct.concat(line_points)
              let l_len = width / item.str.length
              let word = ''
              let word_len = 0
              let _word_len = 0
              let word_x = x
              for(let i = 0, len = item.str.length; i < len; i++) {
                char_pos++;
                let new_x = x + (l_len * i)
                if (item.str[i] === ' ') { // space
                  console.log('  ', word, word_len);

                  var quad = me._get_quad(word_x, p.y, word_len, height, scale)
                  // var _quad = me._get_quad(word_x, p.y, _word_len, height, _scale)
                  // ctx.rect(_quad.x1, _quad.y1,  _quad.x2 - _quad.x1, _quad.y4 - _quad.y1);
                  // ctx.stroke();
                  var strPos = char_pos - word.length - 1
                  var word_x_left_right = [word.length, strPos, word.length, quad.x1,quad.x2]
                  line_struct = line_struct.concat(word_x_left_right)
                  word = '';
                  word_len = 0;
                  _word_len = 0;
                  word_x = x + (l_len * (i + 1))
                  number_of_words++;
                  continue
                }

                word += item.str[i]

                word_len += l_len * scale
                _word_len += l_len * _scale
                if (len - 1 === i) { // last character
                  console.log('  ', word, word_len);

                  var quad = me._get_quad(word_x, p.y, word_len, height, scale)
                  var strPos = char_pos - word.length
                  var word_x_left_right = [word.length, strPos, word.length, quad.x1,quad.x2]
                  line_struct = line_struct.concat(word_x_left_right)
                  word = '';
                  // var _quad = me._get_quad(word_x, p.y, _word_len, height, _scale)
                  // ctx.rect(_quad.x1, _quad.y1,  _quad.x2 - _quad.x1, _quad.y4 - _quad.y1);
                  // ctx.stroke();
                  word_x = new_x
                  word_len = 0;
                  _word_len = 0;
                  number_of_words++;
                }

                var quad = me._get_quad(new_x, p.y, l_len * scale, height, scale)

                data_quads = data_quads.concat([quad.x1, quad.y1, quad.x2, quad.y2 ,quad.x3, quad.y3, quad.x4, quad.y4])
                // ctx.rect(quad.x1, quad.y1,  quad.x2 - quad.x1, quad.y4 - quad.y1);
                // ctx.stroke();
              }
              line_struct[0] = item.str.split(' ').length;
              xod_struct = xod_struct.concat(line_struct)

            }
            // data_quads.concat(data_quads.slice(data_quads.length - 8, data_quads.length))
            // line_struct[0] = num_of_lines;
            // line_struct[1] = number_of_words;
            // var struct = [num_of_lines].concat(xod_struct)
            xod_struct[0] = num_of_lines
            console.log(data_quads);
            console.log(xod_struct);
            var xod_data = {
              // offsets: [0, 1, 2, 3, 4, 5, 6, 7, 8, -2],
              quads: data_quads,
              str: xod_str,
              struct: xod_struct
            }
            console.log(xod_data);
            console.log('\n\n');























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
      var x1 = x * scale
      var y1 = (y - height) * scale
      var x2 = x1 + width
      var y2 = y1
      var x3 = x2
      var y3 = y1 + height * scale
      var x4 = x1
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
