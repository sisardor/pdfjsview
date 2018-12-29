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
  console.log('loadAsync', partRetriever);
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
