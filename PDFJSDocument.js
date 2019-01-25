(function(exports) {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdfjs/pdf.worker.js';
  exports.utils = exports.utils || {};
  exports.utils.isPdfjs = true;

  exports.CoreControls.PDFJSDocument = function PDFJSDocument() {
    this.bookmarks = [];
    this.pagesById = {};
    this.textCallbacksLookup = {};
    this.docId = null;
    this.scale = 1;
    this._pagesRefCache = Object.create(null);
    this.destinations = null;
  };
  exports.CoreControls.PDFJSDocument.prototype = Object.create(exports.CoreControls.BaseDocument.prototype);
  exports.CoreControls.PDFJSDocument.prototype.constructor = exports.CoreControls.PDFJSDocument;
  exports.CoreControls.Document.registerDocumentType('pdf', exports.CoreControls.PDFJSDocument);

  $.extend(exports.CoreControls.PDFJSDocument.prototype, {
    'loadAsync': function functionName(partRetriever, onDocumentLoaded, options) {
      let me = this;
      let getUserPassword = options['getPassword'];
      let extension = options['extension'];
      let defaultPageSize = options['defaultPageSize'];
      let pageSizes = options['pageSizes'];
      let file = partRetriever.getFile();


      if (file && file.url) {
        fetchDocument(file.url);
      } else {
        partRetriever.getFileData(function(source) {
          fetchDocument({ data: source });
        });
      }

      function fetchDocument(params) {
        let loadingTask = pdfjsLib.getDocument(params);

        // handle passpord prompt
        loadingTask.onPassword = (updateCallback, reason) => {
          getUserPassword(updateCallback)
        };

        loadingTask.promise.then(function(pdf) {
          me.pdfDocument = pdf;
          me.docId = pdf.fingerprint
          let pageCount = pdf.numPages;
          me.pdfDocument.getDestinations().then(function(destinations) {
            me.destinations = destinations
          })
          // this promise will resolve itself when
          // "for loop" is finished
          let pagesCapability = createPromiseCapability();
          pagesCapability.promise.then(function() {
            // callback is called after pdf pages class is created
            onDocumentLoaded();
            me.trigger('documentComplete');
          });

          let getPagesLeft = pageCount;

          let _loop = function _loop(pageNum) {
            pdf.getPage(pageNum).then(function(pdfPage) {
              let viewport = pdfPage.getViewport({ scale: me.scale });
              let pageView = new exports.PDFJSPageView({
                id: pageNum,
                matrix: me['sanitisePageMatrix'](viewport.transform, { w: viewport.width, h: viewport.height }),
                scale: me.scale,
                defaultViewport: viewport.clone()
              });
              pageView.setPdfPage(pdfPage);
              me.addPage(pageView)
              me.pagesById[pageNum - 1] = pageView;

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
          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            _loop(pageNum);
          }
        })
        .catch(function(err) {
          onDocumentLoaded(err)
          fireError(err)
        })
      }
    },
    'loadCanvasAsync': function PDFJSDocumentLoadCanvasAsync(pageIndex, zoom, pageRotation, drawComplete, drawProgressive, canvasNum) {
      let me = this;
      let options = getLoadCanvasOptions(pageIndex, zoom, pageRotation, drawComplete, drawProgressive, canvasNum);

      let pageIdx = options['pageIndex'];
      let pageZoom = options['getZoom']();
      let rotation = options['getPageRotation']();
      let multiplier = exports.utils.getCanvasMultiplier();
      let pageView = me.pagesById[pageIdx];
      pageRotation = options['getPageRotation']();
      let pageTransform = options['getPageTransform']();

      pageView.paintOnCanvas(pageZoom, rotation, multiplier).promise.then(function(result) {
        options['drawProgressive'](result);
        options['drawComplete'](result, pageIdx);
      }, function(err) {
        console.error(err);
      });
    },
    'getBookmarks': function getBookmarks() {
      let me = this;
      return me.pdfDocument.getOutline().then(function(outlines) {
        return (!outlines) ? [] : outlines.map(function (outline) {
          return me._parseOutline(outline, undefined, me.destinations)
        });
      })
    },
    'loadThumbnailAsync': function PDFDocumentLoadThumbnailAsync(pageNumber, onLoadThumbnail, name) {
      let highResThumbnail = name === 'page';

      let me = this;
      let pageView = me.pagesById[pageNumber];
      let multiplier = exports.utils.getCanvasMultiplier();
      let thumbSize = highResThumbnail ? 2000.0 : 150.0 * multiplier;
      let zoomVal = pageView.width > pageView.height ? thumbSize / pageView.width : thumbSize / pageView.height;
      zoomVal /= multiplier;
      // No thumbnails so render it and send back image

      return this['loadCanvasAsync']({
        'pageIndex': pageNumber,
        'getZoom': function() {
          return zoomVal;
        },
        'getPageRotation': function() {
          return exports.CoreControls.PageRotation.e_0;
        },
        'drawComplete': function(canvas) {
          onLoadThumbnail(canvas);
        },
        'drawProgressive': function() {

        },
        'useProgress': false,
        'pageCanvas': true
      });
    },
    'getPageCount': function PDFJSDocumentGetPageCount() {
      return this.pdfDocument.numPages;
    },
    'shouldRequestAnnotations': function PDFJSDocumentShouldRequestAnnotations() {
      return true; //!this.hasDownloader;
    },
    'getFileData': function getFileData(options) {
      if (('printDocument' in options) && options['printDocument']) {
        return Promise.reject('not supported')
      }
      return this.pdfDocument.getData()
    },
    'sanitisePageMatrix': function(matrix, currentPage) {
      // Rectify the page matrix so it keeos scaling and such but does not retain rotation
      // this is so the rotation can then be applied live later, but this page matrix can be applied at load time to
      // make sure the coordinate system in which we are operating is always the same
      let tmtx = new XODText.Matrix2D();
      tmtx.initCoordinates.apply(tmtx, matrix);
      let bb = this.calculateBoundingBox(tmtx, currentPage);
      tmtx.initCoordinates(1, 0, 0, -1, -bb.x1, bb.y2);
      return tmtx;
    },
    'loadTextData': function(pageIndex, onComplete) {
      let me = this;

      if (me.getPage(pageIndex).text !== null) {
        onComplete(me.getPage(pageIndex).text);
      } else if (pageIndex in me.textCallbacksLookup) {
        me.textCallbacksLookup[pageIndex].push(onComplete);
      } else {
        exports.utils.log('text', 'Load text ' + (pageIndex + 1));
        let pdfPageCache = null;

        me.pdfDocument.getPage(pageIndex + 1)
          .then(function(pdfPage) {
            pdfPageCache = pdfPage
            return pdfPage.getTextContent({
              normalizeWhitespace: true,
              combineTextItems: true
            });
          })
          .then(function(textContent) {
            // handle case where there is no text at all
            if (textContent && textContent.items.length === 0) {
              me.textCallbacksLookup[pageIndex].forEach(function(completeCB) {
                exports.utils.log('text', 'Callback ' + pageIndex);
                completeCB(null);
              });
              delete me.textCallbacksLookup[pageIndex];
              return;
            }

            // delaying text parsing, because font infomation
            // will not be available or cached to pdf page
            setTimeout(function () {
              me._parseFontData(pdfPageCache.commonObjs._objs, function(err, fonts) {
                if (err) {
                  console.error(err);
                  return;
                }

                let xod_data = me._parseTextData(pageIndex, textContent, fonts)
                exports.utils.log('loadTextData for page ' + (pageIndex + 1));

                let selInfo = new XODText.SelectionInfo();
                selInfo.parseFromOld({
                  'm_Struct': xod_data['struct'],
                  'm_Str': xod_data['str'],
                  'm_Offsets': xod_data['offsets'],
                  'm_Quads': xod_data['quads'],
                  'm_Ready': true
                });
                // me.correctQuadsForPageRotation(pageIndex, selInfo);
                me.getPage(pageIndex).text = selInfo;
                me.textCallbacksLookup[pageIndex].forEach(function(completeCB) {
                  exports.utils.log('text', 'Callback ' + pageIndex);
                  completeCB(selInfo);
                });
                delete me.textCallbacksLookup[pageIndex];
              })
            }, 100);
          })
        me.textCallbacksLookup[pageIndex] = [onComplete];
      }
    },
    'extractXFDF': function (pageNum) {
      let me = this;
      let _pageNum = pageNum[0]
      let pageview = me.pagesById[_pageNum - 1]
      return pageview.pdfPage.getAnnotations().then(function(data) {
        let results = me._buildAnnotation(data, _pageNum, pageview.matrix)
          return {
            'pages': pageNum,
            'annots': results
          }
      });

    },

    _parseOutline: function (outline, parent, destinations) {
      let me = this;

      let children = outline.items.map(function(item, i) {
        return me._parseOutline(item, outline.title, destinations)
      })

      let destination = null;

      if (Array.isArray(outline.dest)) {
        destination = outline.dest;
      } else if (typeof outline.dest === 'string') {
        destination = destinations[outline.dest];
      }

      return this._createBookmark(outline, parent, children, destination);
    },
    _createBookmark: function(outline, parent, children, destination) {
      let name = outline.title, pageNumber, verticalOffset, horizontalOffset
      if (destination) {
        pageNumber = this._getNumberFromRef(destination[0]);
        let xy = this._getXYDest(pageNumber, destination);
        verticalOffset = xy.verticalOffset;
        horizontalOffset = xy.x;
      }
      let url = outline.url;
      return new exports.CoreControls.Bookmark(
        children,
        name,
        pageNumber,
        parent,
        verticalOffset,
        horizontalOffset,
        url
      )
    },
    _buildAnnotation: function (data, pageNum, pageMatrix) {
      let me = this;
      return data.filter(item => item.subtype === 'Link')
        .map((link, index) => {
          let opts = {
            data: link,
            pageMatrix: pageMatrix,
            pageNum: pageNum,
            parseDest: me._getXYDest.bind(me),
            parsePageNumber: me._getNumberFromRef.bind(me),
            destinations: me.destinations
          }
          return AnnotationElementFactory.create(opts)
        })
    },
    _parseTextData: function (pageIndex, textContent, fonts) {
      let me = this;
      let page = me.pagesById[pageIndex];
      let xod_stucts = [], xod_quads = [], xod_str = '';

      let lines = [];
      let itemsIndex = 0
      for (let i = 0, len = textContent.items.length; i < len; i++) {
        let fontProvider = fonts[textContent.items[i].fontName];

        if (!fontProvider) {
          continue;
        }

        let options = {
          item: textContent.items[i],
          pageMatrix: page.matrix,
          font: fontProvider
        }

        let line = new Line(options);

        // check if previous and current items are in the same lines
        // by checking y coordinates
        if (lines.length > 0 && itemsIndex > 0) {
          let prev_line = lines[itemsIndex - 1];
          let proximity = line.leftX - prev_line.rightX
          if (prev_line.top === line.top && prev_line.bottom === line.bottom && proximity < 10) {
            lines.push(line);
            itemsIndex++;
            continue;
          }
          let top1 = prev_line.top;
          let top2 = line.top;
          let bottom1 = prev_line.bottom;
          let bottom2 = line.bottom;
          let res1 = bottom1 - top2;
          let res2 = top1 - bottom2;
          if (
            (res1 >= 0 && res2 <= 0 || res1 <= 0 && res2 >= 0)
            && proximity < 10) {
            let new_top = Math.min(top1, top2, bottom1, bottom2)
            let new_bottom = Math.max(top1, top2, bottom1, bottom2)
          } else {
            // if current item has different y then previous item is
            // seperate line, and add newline character to previous item
            prev_line.addNewline()
          }
        }
        lines.push(line);
        itemsIndex++;
      }

      if (!lines.length) {
        throw new Error('lines is empty array')
        return
      }

      for (let i = 0, len = lines.length; i < len; i++) {
        lines[i].parse()

        xod_quads.push(lines[i].getQuads())
        xod_str += lines[i].text
      }

      // array flat quad array
      xod_quads = xod_quads.flat()

      // after lines are normlized split it by \n
      // and get struct data for XODText
      // example "apple cherry orange\n"
      let _lines = xod_str.split('\n');
      let pivot = 0, _pos = 0, line_struct = [];

      for (let i = 0, len = _lines.length; i < len; i++) {
        let line = _lines[i]
        let lastIndex = pivot + line.length
        pivot += line.length + 1
        let struct = []

        // split line by space
        // example ["apple", "cherry", "orange"]
        let words = (line == " ") ? [" "] : line.split(' ')
        for (let j = 0, len2 = words.length; j < len2; j++) {
          let word = words[j]
          let wlength = (word.length) ? word.length : 1 ;
          let offset = (word.length) ? 1 : 0 ;

          if (word.length) {
            let q = xod_quads.slice(_pos, _pos + word.length)
            let first_g = q[0]
            let last_g = q[q.length-1]
            let word_left_x = first_g[0]
            let word_right_x = last_g[2]
            struct.push([wlength, _pos, wlength, word_left_x, word_right_x])
          }
          _pos += wlength + offset
        }

        let line_quads = xod_quads.slice(_pos - line.length - 1, _pos - 1)
        let line_first_g = line_quads[0]

        let line_last_g = line_quads[line_quads.length - 1]
        let line_left_x = line_first_g[0];
        let line_right_x = line_last_g[2];
        let line_top = line_first_g[1]
        let line_bottom = line_first_g[7]
        // filter out only words, if text has multi
        // space we don't include it in struct
        let wordCount = words.filter(item => item.length).length
        let st = [wordCount,line.length, line_left_x, line_bottom, line_right_x, line_top]
        let wt = struct.flat()
        let _l = st.concat(wt)
        line_struct = line_struct.concat(_l)
      }

      let data_struct = [_lines.length].concat(line_struct)
      let offsets = me._parseTextOffsets(xod_str)

      let xod_data = {
        offsets: offsets,
        quads: xod_quads.flat(),
        str: xod_str,
        struct: data_struct
      }
      return xod_data
    },
    _parseFontData: function (_objs, callback) {
      // font information needs to be resolved
      // by pdf.js core before we can use it
      var arr = []
      for (let key in _objs) {
        arr.push(_objs[key].capability.promise)
      }
      Promise.all(arr).then(function(values) {
        let fonts = {}
        for (var i = 0; i < values.length; i++) {
          fonts[values[i].loadedName] = values[i]
        }
        callback(null, fonts)
      }).catch(callback)
    },
    _parseTextOffsets: function (xod_str) {
      let offsets = [];
      for(let i = 0, len = xod_str.length; i < len; i++) {
        offsets[i] =(xod_str.charAt(i) === ' ')
          ? -1
          : (xod_str.charAt(i) === '\n')
            ? -2
            : i ;
      }
      return offsets;
    },
    _getXYDest: function(pageNumber, destArray) {
      if (!this.pdfDocument) {
        return;
      }
      let pageView = (Number.isInteger(pageNumber) && this.pagesById[pageNumber - 1]);
      if (!pageView) {
        console.error(pageNumber + " is not a valid pageNumber parameter.");
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
          x = x !== null ? x : 0;
          y = y !== null ? y : pageHeight;
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
          width = pageWidth;
          height = pageHeight;
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
      let coor = pageView.matrix.mult({x: x, y: y})
      return {
        x: coor.x,
        y: coor.y,
        verticalOffset: verticalOffset,
        fit: destArray[1].name,
        width: width,
        height: height,
      };
    },
    _cachePageRef: function(pageNum, pageRef) {
      if (!pageRef) {
        return;
      }
      let refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      this._pagesRefCache[refStr] = pageNum;
    },
    _getNumberFromRef: function(pageRef) {
      let refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      return this._pagesRefCache && this._pagesRefCache[refStr] || null;
    },

  });



  function getLoadCanvasOptions(pageIndex, zoom, pageRotation, drawComplete, drawProgressive, canvasNum) {
    let options = {
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

  const isIE11 = navigator.userAgent.indexOf('Trident/7.0') > -1;
  const fireEvent = (eventName, data) => {
    let event;
    if (CustomEvent && !isIE11) {
      event = new CustomEvent(eventName, { detail: data, bubbles: true, cancelable: true });
    } else {
      event = document.createEvent('Event');
      event.initEvent(eventName, true, true);
      event.detail = data;
    }
    window.dispatchEvent(event);
  };
  const fireError = message => {
    fireEvent('loaderror', message);
  };

})(window);
