(function(exports) {
  'use strict';

  var RenderingCancelledException = pdfjsLib['RenderingCancelledException'];
  var DEFAULT_SCALE = 1.0;

  var MULTIPLIER = exports.utils.getCanvasMultiplier();
  var TextLayerMode = {
    DISABLE: 0,
    ENABLE: 1,
    ENABLE_ENHANCE: 2
  };
  var RenderingStates = {
    INITIAL: 0,
    RUNNING: 1,
    PAUSED: 2,
    FINISHED: 3,
  };


  var PDFJSPageView = function PDFJSPageView(options) {
    exports.PageInfo.call(this, options.defaultViewport.width, options.defaultViewport.height);
    var container = options.container;
    var defaultViewport = options.defaultViewport;
    this.id = options.id;
    this.renderingId = 'page' + this.id;
    this.pdfPage = null;


    this.rotation = 0; // needed for PageInfo class
    this._rotation = 0; // internal user
    this.matrix = options.matrix; // needed for PageInfo class

    this.scale = options.scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;

    // used by annotation layer if need
    this.imageResourcesPath = options.imageResourcesPath || '';

    // used by pdfjs render function
    this.renderer = 'canvas';
    this.enableWebGL = options.enableWebGL || false;
    this.renderInteractiveForms = options.renderInteractiveForms || false;

    // internal used
    this.resume = null;
    this.error = null;
  };

  PDFJSPageView.prototype = $.extend(Object.create(exports.PageInfo.prototype), {

    setPdfPage: function setPdfPage(pdfPage) {
      this.pdfPage = pdfPage;
      this.pdfPageRotate = pdfPage.rotate;

      var totalRotation = (this._rotation + this.pdfPageRotate) % 4 * 90;
      this.viewport = pdfPage['getViewport']({ scale: this.scale * MULTIPLIER, rotation: totalRotation });
      this.stats = pdfPage.stats;
      // this.reset();
    },

    destroy: function destroy() {
      this.reset();
      if (this.pdfPage) {
        this.pdfPage['cleanup']();
      }
    },


    getWidgetContainerParent: function(pageIndex) {
      return $('#pageContainer' + pageIndex);
    },


    paintOnCanvas: function paintOnCanvas(scale, rotation) {
      // this.update(scale, rotation)
      this.scale = scale || this.scale;
      if (typeof rotation !== 'undefined') {
        // The rotation may be zero.
        this._rotation = rotation % 4 * 90;
      }

      var totalRotation = (this._rotation + this.pdfPageRotate) % 360;
      this.viewport = this.viewport.clone({
        scale: this.scale * MULTIPLIER,
        rotation: totalRotation
      });


      var renderCapability = createPromiseCapability();
      var result = {
        promise: renderCapability.promise,
        onRenderContinue: function onRenderContinue(cont) {
          cont();
        },
        cancel: function cancel() {
          renderTask.cancel();
        }
      };

      var canvas = document.createElement('canvas');
      canvas.id = this.renderingId ;

      // Keep the canvas hidden until the first draw callback, or until drawing
      // is complete when `!this.renderingQueue`, to prevent black flickering.
      // canvas.setAttribute('hidden', 'hidden');
      var isCanvasHidden = true;
      var showCanvas = function showCanvas() {
        if (isCanvasHidden) {
          // canvas.removeAttribute('hidden');
          isCanvasHidden = false;
        }
      };


      // this.canvas = canvas;

      var ctx = canvas.getContext('2d', { alpha: false });

      var bufferWidth = this.viewport.width || 1;
      var bufferHeight = this.viewport.height || 1;

      canvas.width = bufferWidth || 1;
      canvas.height = bufferHeight || 1;
      canvas.style.width = Math.floor(this.viewport.width / MULTIPLIER) + 'px';
      canvas.style.height = Math.floor(this.viewport.height / MULTIPLIER) + 'px';

      var renderContext = {
        canvasContext: ctx,
        viewport: this.viewport,
        enableWebGL: this.enableWebGL,
        renderInteractiveForms: this.renderInteractiveForms
      };

      var renderTask = this.pdfPage['render'](renderContext);

      renderTask.promise.then(function() {
        showCanvas();
        renderCapability.resolve(canvas);
      }, function(error) {
        showCanvas();
        renderCapability.reject(error);
        console.warn(canvas);
      });
      return result;
    },
  });

  exports.PDFJSPageView = PDFJSPageView;
})(window);
