(function(exports) {
  'use strict';

  const RenderingCancelledException = pdfjsLib.RenderingCancelledException;
  const DEFAULT_SCALE = 1.0;

  const MULTIPLIER = exports.utils.getCanvasMultiplier();
  const TextLayerMode = {
    DISABLE: 0,
    ENABLE: 1,
    ENABLE_ENHANCE: 2
  };
  const RenderingStates = {
    INITIAL: 0,
    RUNNING: 1,
    PAUSED: 2,
    FINISHED: 3,
  };


  let PDFJSPageView = function PDFJSPageView(options) {
    exports.PageInfo.call(this, options.defaultViewport.width, options.defaultViewport.height);

    let defaultViewport = options.defaultViewport;
    this.id = options.id;
    this.renderingId = 'page' + this.id;
    this.pdfPage = null;

    let pageDimensions = {
        'width': options.defaultViewport.width,
        'height': options.defaultViewport.height,
        'matrix': options.matrix,
        'rotation': defaultViewport.rotation,
        'id': this.renderingId,
        'pageNum': this.id
    }
    this.setFromPageData(pageDimensions)
    this.text = null;
    this.rotation = defaultViewport.rotation; // needed for PageInfo class
    this._rotation = 0; // internal user
    this.matrix = options.matrix; // needed for PageInfo class
    this.scale = options.scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;

    // used by pdfjs render function
    this.enableWebGL = options.enableWebGL || false;
    this.renderInteractiveForms = options.renderInteractiveForms || false;
  };

  PDFJSPageView.prototype = $.extend(Object.create(exports.PageInfo.prototype), {

    setPdfPage: function setPdfPage(pdfPage) {
      this.pdfPage = pdfPage;
      this.pdfPageRotate = pdfPage.rotate;

      let totalRotation = (this._rotation + this.pdfPageRotate) % 4 * 90;
      this.viewport = pdfPage.getViewport({ scale: this.scale * MULTIPLIER, rotation: totalRotation });
      this.stats = pdfPage.stats;
    },

    destroy: function destroy() {
      if (this.pdfPage) {
        this.pdfPage.cleanup();
      }
    },

    paintOnCanvas: function paintOnCanvas(scale, rotation, multiplier) {
      this.scale = scale || this.scale;
      if (typeof rotation !== 'undefined') {
        // The rotation may be zero.
        this._rotation = rotation % 4 * 90;
      }

      let totalRotation = (this._rotation + this.pdfPageRotate) % 360;
      this.viewport = this.viewport.clone({
        scale: this.scale * multiplier,
        rotation: totalRotation
      });


      let renderCapability = createPromiseCapability();
      let result = {
        promise: renderCapability.promise,
        onRenderContinue: function onRenderContinue(cont) {
          cont();
        },
        cancel: function cancel() {
          renderTask.cancel();
        }
      };

      let canvas = document.createElement('canvas');
      canvas.id = this.renderingId ;

      // Keep the canvas hidden until the first draw callback, or until drawing
      // is complete when `!this.renderingQueue`, to prevent black flickering.
      canvas.setAttribute('hidden', 'hidden');
      let isCanvasHidden = true;
      let showCanvas = function showCanvas() {
        if (isCanvasHidden) {
          canvas.removeAttribute('hidden');
          isCanvasHidden = false;
        }
      };


      let ctx = canvas.getContext('2d', { alpha: false });

      let bufferWidth = this.viewport.width || 1;
      let bufferHeight = this.viewport.height || 1;

      canvas.width = bufferWidth || 1;
      canvas.height = bufferHeight || 1;
      canvas.style.width = Math.floor(this.viewport.width / multiplier) + 'px';
      canvas.style.height = Math.floor(this.viewport.height / multiplier) + 'px';

      let renderContext = {
        canvasContext: ctx,
        viewport: this.viewport,
        enableWebGL: this.enableWebGL,
        renderInteractiveForms: this.renderInteractiveForms
      };

      let renderTask = this.pdfPage.render(renderContext);

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
