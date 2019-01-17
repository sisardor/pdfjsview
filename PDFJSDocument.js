(function(exports) {
  'use strict';

  pdfjsLib['GlobalWorkerOptions']['workerSrc'] = 'external/pdfjs/pdf.js/build/generic/build/pdf.worker.js';

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
    loadAsync: function functionName(partRetriever, onDocumentLoaded, options) {
      var me = this;
      var getUserPassword = options['getPassword'];
      var extension = options['extension'];
      var defaultPageSize = options['defaultPageSize'];
      var pageSizes = options['pageSizes'];
      var file = partRetriever.getFile();


      if (file && file.url) {
        fetchDocument(file.url);
      } else {
        partRetriever.getFileData(function(source) {
          fetchDocument({ data: source });
        });
      }

      function fetchDocument(params) {
        var loadingTask = pdfjsLib.getDocument(params);

        // handle passpord prompt
        loadingTask.onPassword = (updateCallback, reason) => {
          getUserPassword(updateCallback)
        };

        loadingTask.promise.then(function(pdf) {
          me.pdfDocument = pdf;
          var pageCount = pdf.numPages;

          // this promise will resolve itself when
          // "for loop" is finished
          var pagesCapability = createPromiseCapability();
          pagesCapability.promise.then(function() {

            // callback is called after pdf pages class is created
            onDocumentLoaded();
            me.trigger('documentComplete');
          });

          var getPagesLeft = pageCount;

          var _loop = function _loop(pageNum) {
            pdf['getPage'](pageNum).then(function(pdfPage) {
              var viewport = pdfPage['getViewport']({ scale: me.scale });
              var pageView = new exports.PDFJSPageView({
                id: pageNum,
                matrix: me.sanitisePageMatrix(viewport.transform, { w: viewport.width, h: viewport.height }),
                scale: me.scale,
                defaultViewport: viewport.clone()
              });
              pageView.setPdfPage(pdfPage);

              me.pages.push(pageView);
              me.pagesById[pageNum] = pageView;

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
        })
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

      pageView.paintOnCanvas(pageZoom, rotation).promise.then(function(result) {
        options['drawProgressive'](result);
        options['drawComplete'](result, pageIdx);
      }, function(err) {
        console.error(err);
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
          var pageNumber = me._getNumberFromRef(destRef);
          // _getXYDest function will parse "dest" data passed by pdfjs
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
        // if (typeof dest === 'string') {
        //   this.pdfDocument.getDestination(dest).then((destArray) => {
        //     resolve({
        //       namedDest: dest,
        //       explicitDest: destArray,
        //     });
        //   });
        //   return;
        // }
        return _b
      }

      return me.pdfDocument['getOutline']().then(function(outlines) {
        if (!outlines) {
          return [];
        }
        var bookmarks = [];
        for (var i = 0, len = outlines.length; i < len; i++) {
          console.log(outlines[i]);
          bookmarks.push(copyBookmark(outlines[i]));
        }
        return bookmarks;
      });
    },
    loadThumbnailAsync: function PDFDocumentLoadThumbnailAsync(pageNumber, onLoadThumbnail, name) {
      var highResThumbnail = name === 'page';

      var me = this;
      var page = me.pages[pageNumber];
      var multiplier = exports.utils.getCanvasMultiplier();
      var thumbSize = highResThumbnail ? 2000.0 : 150.0 * multiplier;
      var zoomVal = page.width > page.height ? thumbSize / page.width : thumbSize / page.height;
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
      // console.log('loadTextData', pageIndex);
      var me = this;


      if (me.pages[pageIndex].text !== null) {
        onComplete(me.pages[pageIndex].text);
      } else if (pageIndex in me.textCallbacksLookup) {
        me.textCallbacksLookup[pageIndex].push(onComplete);
      } else {
        // console.log('.... ', pageIndex);
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
            // TODO:
            // handle case where there is no text at all
            let xod_data = me._parseTextData(pageIndex, textContent, pdfPageCache)
            // exports.utils.log('loadTextData for page ' + (pageIndex + 1));

            var selInfo = new XODText.SelectionInfo();
            selInfo.parseFromOld({
              m_Struct: xod_data['struct'],
              m_Str: xod_data['str'],
              m_Offsets: xod_data['offsets'],
              m_Quads: xod_data['quads'],
              m_Ready: true
            });
            // me.correctQuadsForPageRotation(pageIndex, selInfo);
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





    _parseTextData: function (pageIndex, textContent, pdfPageCache) {
      let me = this;
      let page = me.pages[pageIndex];
      let pdfjs_fonts = me._mapFontData(pdfPageCache.commonObjs._objs)
      // console.log('Page ', pageIndex  + 1, pdfjs_fonts);
      let xod_stucts = [], xod_quads = [], xod_str = '';

      let lines = [];
      let itemsIndex = 0
      for (let i = 0, len = textContent.items.length; i < len; i++) {
        let fontProvider = pdfjs_fonts[textContent.items[i].fontName];

        if (!fontProvider) {
          continue;
        }

        let options = {
          item: textContent.items[i],
          pageMatrix: page.matrix,
          font: fontProvider
        }

        var line = new Line(options);

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
        var struct = []

        // split line by space
        // example ["apple", "cherry", "orange"]
        let words = (line == " ") ? [" "] : line.split(' ')
        for (let j = 0, len2 = words.length; j < len2; j++) {
          let word = words[j]
          let wlength = (word.length) ? word.length : 1 ;
          var offset = (word.length) ? 1 : 0 ;

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
        var st = [wordCount,line.length, line_left_x, line_bottom, line_right_x, line_top]
        var wt = struct.flat()
        var _l = st.concat(wt)
        line_struct = line_struct.concat(_l)
      }

      var data_struct = [_lines.length].concat(line_struct)
      var offsets = me._parseTextOffsets(xod_str)

      var xod_data = {
        offsets: offsets,
        quads: xod_quads.flat(),
        str: xod_str,
        struct: data_struct
      }
      return xod_data
    },
    _mapFontData: function (_objs) {
      let fonts = {}
      for (let key in _objs) {
        fonts[_objs[key].data.loadedName] = _objs[key];
      }
      return fonts;
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
    _cachePageRef: function(pageNum, pageRef) {
      if (!pageRef) {
        return;
      }
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      this._pagesRefCache[refStr] = pageNum;
    },
    _getNumberFromRef: function(pageRef) {
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      return this._pagesRefCache && this._pagesRefCache[refStr] || null;
    },

  });



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

})(window);
