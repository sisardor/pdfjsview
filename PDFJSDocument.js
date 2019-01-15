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
    this.page = 1;
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
                  // textLayerFactory: me,
                  // textLayerMode: me.textLayerMode,
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
      var MULTIPLIER = exports.utils.getCanvasMultiplier();
      // var canvasMan = exports.CoreControls.CanvasManager.setUpCanvas(pageView,pageZoom,pageRotation,pageTransform, undefined, undefined)
      // var canvas = canvasMan.canvas
      // var canvas = document.createElement('canvas');
      //
      // options['drawProgressive'](canvas);
      // me.pdfDocument.getPage(pageIdx + 1).then(function(pdfPage) {
      //   var totalRotation = (pageRotation) % 4 * 90;
      //   var viewport = pdfPage['getViewport']({
      //     scale: me.scale * MULTIPLIER,
      //     rotation: totalRotation
      //   });
      //
      //   var ctx = canvas.getContext('2d');
      //
      //   var bufferWidth = viewport.width || 1;
      //   var bufferHeight = viewport.height || 1;
      //
      //   canvas.width = bufferWidth || 1;
      //   canvas.height = bufferHeight || 1;
      //   canvas.style.width = Math.floor(viewport.width / MULTIPLIER) + 'px';
      //   canvas.style.height = Math.floor(viewport.height / MULTIPLIER) + 'px';
      //
      //   var renderContext = {
      //     canvasContext: ctx,
      //     viewport: viewport,
      //     enableWebGL: true,
      //     renderInteractiveForms: true
      //
      //   };
      //   pdfPage.render(renderContext).then(function() {
      //     options['drawComplete'](canvas, pageIdx);
      //   })
      //
      //
      // })
      //
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
    parseQuad: function parseQuad(arr, offset){
        return arr.slice(offset, offset +  8);
    },
    // 2.828280866222207 correct
    // 2.5454527795999864 wrong
    'loadTextData': function(pageIndex, onComplete) {
      // var c = document.getElementById("page" +(pageIndex + 1));
      // var ctx = c.getContext("2d");
      // ctx.translate(0.5, 0.5)
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
              normalizeWhitespace: true,
              combineTextItems: true
            });
          })
          .then(function(textContent) {





            window.textContent = textContent




            let page = me.pages[0];
            let pdfjs_fonts = me._map_font_data(pdfPageCache.commonObjs._objs)
            let xod_stucts = [], xod_quads = [], xod_str = '';
            let line_count = 0;
            let lines = [];
            for (let i = 0, len = textContent.items.length; i < len; i++) {
              let fontProvider = pdfjs_fonts[textContent.items[i].fontName];

              let options = {
                item: textContent.items[i],
                pageMatrix: page.matrix,
                font: fontProvider,
                charCount: xod_str.length
              }

              var line = new Line(options);
              // console.log(line);
              if (i > 0) {
                let prev_line = lines[i - 1];
                if (prev_line.top === line.top && prev_line.bottom === line.bottom) {
                  lines.push(line);
                  continue;
                }
                let top1 = prev_line.top;
                let top2 = line.top;
                let bottom1 = prev_line.bottom;
                let bottom2 = line.bottom;
                let res1 = bottom1 - top2;
                let res2 = top1 - bottom2;
                let proximity = line.left_x - prev_line.right_x
                if (
                  (res1 >= 0 && res2 <= 0 || res1 <= 0 && res2 >= 0)
                  && proximity < 10) {
                  let new_top = Math.min(top1, top2, bottom1, bottom2)
                  let new_bottom = Math.max(top1, top2, bottom1, bottom2)
                  // prev_line.setTop(new_top)
                  // line.setTop(new_top)
                  // prev_line.setBottom(new_bottom)
                  // line.setBottom(new_bottom)
                } else {
                  prev_line.addNewline()
                }
              }
              lines.push(line);
            }


            for (let i = 0, len = lines.length; i < len; i++) {
              // lines[i]._drawRect(ctx, page.scale)

              lines[i].run()
              // console.log(lines[i]);
              xod_quads.push(lines[i].getQuads())
              xod_str += lines[i].text
            }
            xod_quads = xod_quads.flat()





            let _lines = xod_str.split('\n')
            let pivot = 0
            let pi = 0
            var line_struct = []
            for (let i = 0, len = _lines.length; i < len; i++) {
              let line = _lines[i]
              let lastIndex = pivot + line.length
              pivot += line.length + 1
              var struct = []

              let words = line.split(' ')
              for (let j = 0, len2 = words.length; j < len2; j++) {
                let word = words[j]
                let wlength = (word.length) ? word.length : 1 ;
                var offset = (word.length) ? 1 : 0 ;

                if (word.length) {
                  let q = xod_quads.slice(pi, pi + word.length) //me.parseQuad(xod_quads, pi + word.length)
                  let first_g = q[0]
                  let last_g = q[q.length-1]
                  let word_left_x = first_g[0]
                  let word_right_x = last_g[2]
                  // console.log(word,q);
                  struct.push([wlength, pi, wlength, word_left_x, word_right_x])

                }
                // if (word.length === 0) {
                //   console.error('length error');
                //   let q = xod_quads.slice(pi, pi + 1) //me.parseQuad(xod_quads, pi + word.length)
                //   let first_g = q[0]
                //   let last_g = q[q.length-1]
                //   let word_left_x = first_g[0]
                //   let word_right_x = last_g[2]
                //   // console.log(word,q);
                //   struct.push([1, pi, 1, word_left_x, word_right_x])
                // }

                pi += wlength + offset
              }
              if (words[words.length-1] === '') {
                words.pop()
              }
              let line_quads = xod_quads.slice(pi - line.length - 1, pi - 1)
              let line_first_g = line_quads[0]
              let line_last_g = line_quads[line_quads.length - 1]
              let line_left_x = line_first_g[0];
              let line_right_x = line_last_g[2];
              let line_top = line_first_g[1]
              let line_bottom = line_first_g[7]
              var st = [words.length,line.length, line_left_x, line_bottom, line_right_x, line_top]
              var wt = struct.flat()
              var _l = st.concat(wt)
              line_struct = line_struct.concat(_l)
            }

            // console.log(line_struct)




















            var data_struct = [_lines.length].concat(line_struct)
            // console.log(xod_str);
            // console.log(data_quads);
            // console.log(data_struct);
            var offsets = [];
            for(let i = 0, len = xod_str.length; i < len; i++) {
              offsets[i] = (xod_str.charAt(i) === ' ') ? -1 : i ;
            }
            var xod_data = {
              offsets: offsets,
              quads: xod_quads.flat(),
              str: xod_str,
              struct: data_struct
            }

            // console.log(xod_data);
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

    _get_quad: function(x, y, width, height, scale) {
      // var extraButtomSpace = height * 0.23
      var x1 = x
      var y1 = (y - height)
      var x2 = x1 + width
      var y2 = y1
      var x3 = x2
      var y3 = (y1 + height)
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
})(window);
