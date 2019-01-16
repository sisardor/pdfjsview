'use strict';

(function (exports) {
  'use strict';

  /** @suppress {visibility} */
  var RenderingCancelledException = pdfjsLib['RenderingCancelledException'];

  var MULTIPLIER = exports.utils.getCanvasMultiplier();
  var MAX_NUM_SCALING_STEPS = 3;
  var THUMBNAIL_CANVAS_BORDER_WIDTH = 1; // px
  var THUMBNAIL_WIDTH = 98; // px

  function getOutputScale(ctx) {
    var devicePixelRatio = window.devicePixelRatio || 1;
    var backingStoreRatio = ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1;
    var pixelRatio = devicePixelRatio / backingStoreRatio;
    return {
      sx: pixelRatio,
      sy: pixelRatio,
      scaled: pixelRatio !== 1
    };
  }

  var TempImageFactory = function TempImageFactoryClosure() {
    var tempCanvasCache = null;

    return {
      getCanvas: function getCanvas(width, height) {
        var tempCanvas = tempCanvasCache;
        if (!tempCanvas) {
          tempCanvas = document.createElement('canvas');
          tempCanvasCache = tempCanvas;
        }
        tempCanvas.width = width;
        tempCanvas.height = height;

        // Since this is a temporary canvas, we need to fill it with a white
        // background ourselves. `_getPageDrawContext` uses CSS rules for this.
        if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('MOZCENTRAL || FIREFOX || GENERIC')) {
          tempCanvas.mozOpaque = true;
        }

        var ctx = tempCanvas.getContext('2d', {
          alpha: false
        });
        ctx.save();
        ctx.fillStyle = 'rgb(255, 255, 255)';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        return tempCanvas;
      },
      destroyCanvas: function destroyCanvas() {
        var tempCanvas = tempCanvasCache;
        if (tempCanvas) {
          // Zeroing the width and height causes Firefox to release graphics
          // resources immediately, which can greatly reduce memory consumption.
          tempCanvas.width = 0;
          tempCanvas.height = 0;
        }
        tempCanvasCache = null;
      }
    };
  }();

  var PDFJSThumbnailView = function PDFJSThumbnailView(options) {
    this.id = options.id;
    this.renderingId = 'thumbnail' + options.id;
    this.pageLabel = null;

    this.pdfPage = null;
    this.rotation = 0;
    this.viewport = options.defaultViewport;
    this.pdfPageRotate = options.defaultViewport.rotation;

    this.renderTask = null;
    this.renderingState = exports.RenderingStates.INITIAL;
    this.resume = null;
    this.disableCanvasToImageConversion = options.disableCanvasToImageConversion;

    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;

    this.canvasWidth = THUMBNAIL_WIDTH;
    this.canvasHeight = this.canvasWidth / this.pageRatio | 0;
    this.scale = this.canvasWidth / this.pageWidth;
  };

  PDFJSThumbnailView.prototype = {
    setPdfPage: function setPdfPage(pdfPage) {
      this.pdfPage = pdfPage;
      this.pdfPageRotate = pdfPage.rotate;
      var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
      this.viewport = pdfPage.getViewport({ scale: 1.0, rotation: totalRotation });
      this.reset();
    },

    reset: function reset() {
      return;
      this.cancelRendering();

      this.pageWidth = this.viewport.width;
      this.pageHeight = this.viewport.height;
      this.pageRatio = this.pageWidth / this.pageHeight;

      this.canvasHeight = this.canvasWidth / this.pageRatio | 0;
      this.scale = this.canvasWidth / this.pageWidth;

      // this.div.removeAttribute('data-loaded');
      var ring = this.ring;
      var childNodes = []; //ring.childNodes;
      for (var i = childNodes.length - 1; i >= 0; i--) {
        ring.removeChild(childNodes[i]);
      }
      var borderAdjustment = 2 * THUMBNAIL_CANVAS_BORDER_WIDTH;
      // ring.style.width = this.canvasWidth + borderAdjustment + 'px';
      // ring.style.height = this.canvasHeight + borderAdjustment + 'px';

      if (this.canvas) {
        // Zeroing the width and height causes Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        this.canvas.width = 0;
        this.canvas.height = 0;
        delete this.canvas;
      }
      if (this.image) {
        this.image.removeAttribute('src');
        delete this.image;
      }
    },

    update: function update(zoomVal) {
      if (typeof rotation !== 'undefined') {
        this.rotation = rotation;
      }
      var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
      this.viewport = this.viewport.clone({
        scale: 1,
        rotation: totalRotation
      });
      this.reset();
    },

    cancelRendering: function cancelRendering() {
      if (this.renderTask) {
        this.renderTask.cancel();
        this.renderTask = null;
      }
      this.renderingState = exports.RenderingStates.INITIAL;
      this.resume = null;
    },

    _getPageDrawContext: function _getPageDrawContext() {
      var noCtxScale = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      var canvas = document.createElement('canvas');
      // Keep the no-thumbnail outline visible, i.e. `data-loaded === false`,
      // until rendering/image conversion is complete, to avoid display issues.
      this.canvas = canvas;

      var ctx = canvas.getContext('2d', {
        alpha: false
      });
      var outputScale = getOutputScale(ctx);

      canvas.width = this.canvasWidth * outputScale.sx | 0;
      canvas.height = this.canvasHeight * outputScale.sy | 0;
      canvas.style.width = this.canvasWidth + 'px';
      canvas.style.height = this.canvasHeight + 'px';

      return ctx;
    },

    _convertCanvasToImage: function _convertCanvasToImage() {
      if (!this.canvas) {
        return;
      }
      if (this.renderingState !== exports.RenderingStates.FINISHED) {
        return;
      }
      var id = this.renderingId;
      var className = 'thumbnailImage';

      if (this.disableCanvasToImageConversion) {
        this.canvas.id = id;
        this.canvas.className = className;

        // this.div.setAttribute('data-loaded', true);
        // this.ring.appendChild(this.canvas);
        return;
      }
      var image = document.createElement('img');
      image.id = id;
      image.className = className;

      image.style.width = this.canvasWidth + 'px';
      image.style.height = this.canvasHeight + 'px';

      image.src = this.canvas.toDataURL();
      this.image = image;

      // Zeroing the width and height causes Firefox to release graphics
      // resources immediately, which can greatly reduce memory consumption.
      this.canvas.width = 0;
      this.canvas.height = 0;
      delete this.canvas;
    },

    draw: function draw() {
      var _this = this;

      // if (this.renderingState !== exports.RenderingStates.INITIAL) {
      //   console.error('Must be in new state before drawing');
      //   return Promise.resolve(undefined);
      // }
      this.renderingState = exports.RenderingStates.RUNNING;

      var renderCapability = createPromiseCapability();
      var finishRenderTask = function finishRenderTask(error) {
        // The renderTask may have been replaced by a new one, so only remove
        // the reference to the renderTask if it matches the one that is
        // triggering this callback.
        if (renderTask === _this.renderTask) {
          _this.renderTask = null;
        }

        if (error instanceof RenderingCancelledException) {
          renderCapability.resolve(undefined);
          return;
        }

        _this.renderingState = exports.RenderingStates.FINISHED;
        _this._convertCanvasToImage();
        // console.log(this.image);
        if (!error) {
          if (_this.disableCanvasToImageConversion) {
            renderCapability.resolve(_this.canvas);
          } else {
            renderCapability.resolve(_this.image);
          }
        } else {
          renderCapability.reject(error);
        }
      };

      var ctx = this._getPageDrawContext();
      var drawViewport = this.viewport.clone({
        scale: this.scale * MULTIPLIER
      });
      var renderContinueCallback = function renderContinueCallback(cont) {
        if (!_this.renderingQueue.isHighestPriority(_this)) {
          _this.renderingState = exports.RenderingStates.PAUSED;
          _this.resume = function () {
            _this.renderingState = exports.RenderingStates.RUNNING;
            cont();
          };
          return;
        }
        cont();
      };

      var renderContext = {
        canvasContext: ctx,
        viewport: drawViewport
      };
      var renderTask = this.renderTask = this.pdfPage.render(renderContext);
      // renderTask.onContinue = renderContinueCallback;

      renderTask.promise.then(function () {
        finishRenderTask(null);
      }, function (error) {
        finishRenderTask(error);
      });
      return renderCapability.promise;
    },

    setImage: function setImage() {
      if (this.renderingState !== exports.RenderingStates.INITIAL) {
        return;
      }
      var img = pageView.canvas;
      if (!img) {
        return;
      }
      if (!this.pdfPage) {
        this.setPdfPage(pageView.pdfPage);
      }

      this.renderingState = exports.RenderingStates.FINISHED;

      var ctx = this._getPageDrawContext(true);
      var canvas = ctx.canvas;
      if (img.width <= 2 * canvas.width) {
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
        this._convertCanvasToImage();
        return;
      }

      // drawImage does an awful job of rescaling the image, doing it gradually.
      var reducedWidth = canvas.width << MAX_NUM_SCALING_STEPS;
      var reducedHeight = canvas.height << MAX_NUM_SCALING_STEPS;
      var reducedImage = TempImageFactory.getCanvas(reducedWidth, reducedHeight);
      var reducedImageCtx = reducedImage.getContext('2d');

      while (reducedWidth > img.width || reducedHeight > img.height) {
        reducedWidth >>= 1;
        reducedHeight >>= 1;
      }
      reducedImageCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, reducedWidth, reducedHeight);
      while (reducedWidth > 2 * canvas.width) {
        reducedImageCtx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, reducedWidth >> 1, reducedHeight >> 1);
        reducedWidth >>= 1;
        reducedHeight >>= 1;
      }
      ctx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, canvas.width, canvas.height);
      this._convertCanvasToImage();
    },

    pageId: function pageId() {
      return this.pageLabel !== null ? this.pageLabel : this.id;
    },

    cleanup: function cleanup() {
      TempImageFactory.destroyCanvas();
    }
  };

  exports.PDFJSThumbnailView = PDFJSThumbnailView;
})(window);
