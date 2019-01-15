(function(exports) {
  'use strict';

  var RenderingCancelledException = pdfjsLib['RenderingCancelledException'];
  var DEFAULT_SCALE = 1.0;
  var CSS_UNITS = 96.0 / 72.0;
  var MULTIPLIER = exports.utils.getCanvasMultiplier();
  var TextLayerMode = {
    DISABLE: 0,
    ENABLE: 1,
    ENABLE_ENHANCE: 2
  };


  var PDFJSPageView = function PDFJSPageView(options) {
    exports.PageInfo.call(this, options.defaultViewport.width, options.defaultViewport.height);
    var container = options.container;
    var defaultViewport = options.defaultViewport;
    this.id = options.id;
    this.renderingId = 'page' + this.id;
    this.pdfPage = null;
    this.pageLabel = null;
    this.rotation = 0;
    this._rotation = 0;
    this.matrix = options.matrix;
    // this.width = defaultViewport.width;
    // this.height = defaultViewport.height;
    this.scale = options.scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this.textLayerMode = Number.isInteger(options.textLayerMode) ? options.textLayerMode : TextLayerMode.ENABLE;
    this.imageResourcesPath = options.imageResourcesPath || '';
    this.renderInteractiveForms = options.renderInteractiveForms || false;


    this.renderingQueue = options.renderingQueue;
    this.textLayerFactory = options.textLayerFactory;
    this.annotationLayerFactory = options.annotationLayerFactory;
    this.renderer = 'canvas';
    this.enableWebGL = options.enableWebGL || false;

    this.paintTask = null;
    this.paintedViewportMap = new WeakMap();
    this.renderingState = exports.RenderingStates.INITIAL;
    this.resume = null;
    this.error = null;

    this.onBeforeDraw = null;
    this.onAfterDraw = null;

    this.annotationLayer = null;
    this.zoomLayer = null;
  };

  PDFJSPageView.prototype = $.extend(Object.create(exports.PageInfo.prototype), {

    setPdfPage: function setPdfPage(pdfPage) {
      this.pdfPage = pdfPage;
      this.pdfPageRotate = pdfPage.rotate;

      var totalRotation = (this._rotation + this.pdfPageRotate) % 4 * 90;
      this.viewport = pdfPage['getViewport']({ scale: this.scale * MULTIPLIER, rotation: totalRotation });
      this.stats = pdfPage.stats;
      this.reset();
    },

    destroy: function destroy() {
      this.reset();
      if (this.pdfPage) {
        this.pdfPage['cleanup']();
      }
    },

    _resetZoomLayer: function _resetZoomLayer() {
      var removeFromDOM = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

      if (!this.zoomLayer) {
        return;
      }
      var zoomLayerCanvas = this.zoomLayer.firstChild;
      this.paintedViewportMap.delete(zoomLayerCanvas);
      // Zeroing the width and height causes Firefox to release graphics
      // resources immediately, which can greatly reduce memory consumption.
      zoomLayerCanvas.width = 0;
      zoomLayerCanvas.height = 0;

      if (removeFromDOM) {
        // Note: `ChildNode.remove` doesn't throw if the parent node is undefined.
        this.zoomLayer.remove();
      }
      this.zoomLayer = null;
    },

    reset: function reset() {
      var keepZoomLayer = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      var keepAnnotations = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      this.cancelRendering(keepAnnotations);

      var currentZoomLayerNode = keepZoomLayer && this.zoomLayer || null;
      var currentAnnotationNode = keepAnnotations && this.annotationLayer && this.annotationLayer.div || null;

      if (currentAnnotationNode) {
        // Hide the annotation layer until all elements are resized
        // so they are not displayed on the already resized page.
        this.annotationLayer.hide();
      } else if (this.annotationLayer) {
        this.annotationLayer.cancel();
        this.annotationLayer = null;
      }

      if (!currentZoomLayerNode) {
        if (this.canvas) {
          this.paintedViewportMap.delete(this.canvas);
          // Zeroing the width and height causes Firefox to release graphics
          // resources immediately, which can greatly reduce memory consumption.
          this.canvas.width = 0;
          this.canvas.height = 0;
          delete this.canvas;
        }
        this._resetZoomLayer();
      }
      if (this.svg) {
        this.paintedViewportMap.delete(this.svg);
        delete this.svg;
      }
    },

    update: function update(scale, rotation) {
      this.scale = scale || this.scale;
      if (typeof rotation !== 'undefined') {
        // The rotation may be zero.
        this._rotation = rotation;
      }

      var totalRotation = (this._rotation + this.pdfPageRotate) % 4 * 90;
      this.viewport = this.viewport.clone({
        scale: this.scale * MULTIPLIER,
        rotation: totalRotation
      });

      var isScalingRestricted = false;
      if (this.canvas && this.maxCanvasPixels > 0) {
        var outputScale = this.outputScale;
        if ((Math.floor(this.viewport.width) * outputScale.sx | 0) * (Math.floor(this.viewport.height) * outputScale.sy | 0) > this.maxCanvasPixels) {
          isScalingRestricted = true;
        }
      }

      if (this.canvas) {
        if (this.useOnlyCssZoom || this.hasRestrictedScaling && isScalingRestricted) {
          this.cssTransform(this.canvas, true);
          return;
        }
        if (!this.zoomLayer && !this.canvas.hasAttribute('hidden')) {
          if (this.canvas.parentNode) {
            this.zoomLayer = this.canvas.parentNode;
            this.zoomLayer.style.position = 'absolute';
          }
        }
      }

      // if (this.zoomLayer) {
      //   if (this.zoomLayer.firstChild) {
      //     this.cssTransform(this.zoomLayer.firstChild);
      //   }
      // }
      this.reset( /* keepZoomLayer = */ true, /* keepAnnotations = */ true);
    },

    cancelRendering: function cancelRendering(keepAnnotations = false) {
      const renderingState = this.renderingState;

      if (this.paintTask) {
        this.paintTask.cancel();
        this.paintTask = null;
      }
      this.renderingState = RenderingStates.INITIAL;
      this.resume = null;

      if (this.textLayer) {
        this.textLayer.cancel();
        this.textLayer = null;
      }
      if (!keepAnnotations && this.annotationLayer) {
        this.annotationLayer.cancel();
        this.annotationLayer = null;
      }

      if (renderingState !== RenderingStates.INITIAL) {
        // this.eventBus.dispatch('pagecancelled', {
        //   source: this,
        //   pageNumber: this.id,
        //   renderingState,
        // });
      }
    },

    cssTransform: function cssTransform(target) {
      var redrawAnnotations = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var width = this.viewport.width / MULTIPLIER;
      var height = this.viewport.height / MULTIPLIER;
      target.style.width = target.parentNode.style.width = Math.floor(width) + 'px';
      target.style.height = target.parentNode.style.height = Math.floor(height) + 'px';

      var relativeRotation = this.viewport.rotation - this.paintedViewportMap.get(target).rotation;
      var absRotation = Math.abs(relativeRotation);
      var scaleX = 1,
        scaleY = 1;
      if (absRotation === 90 || absRotation === 270) {
        // Scale x and y because of the rotation.
        scaleX = height / width;
        scaleY = width / height;
      }
      var cssTransformX = 'rotate(' + relativeRotation + 'deg) ' + 'scale(' + scaleX + ',' + scaleY + ')';
      target.style.transform = cssTransformX;
    },
    getWidgetContainerParent: function(pageIndex) {
      return $('#pageContainer' + pageIndex);
    },
    draw: function draw() {
      var _this = this;

      if (!this.pdfPage) {
        this.renderingState = exports.RenderingStates.FINISHED;
        return Promise.reject(new Error('Page is not loaded'));
      }

      this.renderingState = exports.RenderingStates.RUNNING;

      var pdfPage = this.pdfPage;

      /////////////////////////////////////////////
      // TEXT LAYER BEGIN
      var textLayer = null;
      var _viewport = this.viewport.clone({
        scale: this.scale
      });

      if (this.textLayerMode !== TextLayerMode.DISABLE && this.textLayerFactory) {
        var textLayerDiv = document.createElement('div');
        var pageContDiv = this.getWidgetContainerParent(pdfPage.pageIndex);
        if (pageContDiv.length) {
          pageContDiv = pageContDiv[0];
          textLayerDiv.className = 'textLayer';
          textLayerDiv.style.width = pageContDiv.style.width;
          textLayerDiv.style.height = pageContDiv.style.height;

          if (this.annotationLayer && this.annotationLayer.div) {
            // The annotation layer needs to stay on top.
            // pageContDiv.insertBefore(textLayerDiv, this.annotationLayer.div);
            pageContDiv.appendChild(textLayerDiv);
          } else {
            pageContDiv.appendChild(textLayerDiv);
          }
        }

        textLayer = this.textLayerFactory.createTextLayerBuilder(textLayerDiv, this.id - 1, _viewport, this.textLayerMode === TextLayerMode.ENABLE_ENHANCE);
      }

      this.textLayer = textLayer;
      // TEXT LAYER End
      /////////////////////////////////////////////


      var renderContinueCallback = null;
      if (this.renderingQueue) {
        renderContinueCallback = function renderContinueCallback(cont) {
          if (!_this.renderingQueue.isHighestPriority(_this)) {
            _this.renderingState = exports.RenderingStates.PAUSED;
            _this.resume = function() {
              _this.renderingState = exports.RenderingStates.RUNNING;
              cont();
            };
            return;
          }
          cont();
        };
      }

      var finishPaintTask = function finishPaintTask(error, cw) {
        // The paintTask may have been replaced by a new one, so only remove
        // the reference to the paintTask if it matches the one that is
        // triggering this callback.
        if (paintTask === _this.paintTask) {
          _this.paintTask = null;
        }

        if (error instanceof RenderingCancelledException) {
          _this.error = null;
          return Promise.resolve(undefined);
        }

        _this.renderingState = exports.RenderingStates.FINISHED;

        // this._resetZoomLayer(/* removeFromDOM = */ true);

        _this.error = error;
        _this.stats = pdfPage.stats;
        // if (this.onAfterDraw) {
        //   this.onAfterDraw();
        // }

        if (error) {
          return Promise.reject(error);
        }
        return Promise.resolve(undefined);
      };

      var paintTask = this.paintOnCanvas();

      // paintTask.onRenderContinue = renderContinueCallback;
      this.paintTask = paintTask;

      var resultPromise = paintTask.promise.then(function(cw) {
        return finishPaintTask(null, cw).then(function() {
          if (textLayer) {
            var readableStream = pdfPage['streamTextContent']({
              normalizeWhitespace: true
            });
            textLayer.setTextContentStream(readableStream);
            textLayer.render();
          }
        });
      }, function(reason) {
        return finishPaintTask(reason);
      });


      if (this.annotationLayerFactory) {
        if (!this.annotationLayer) {
          this.annotationLayer = this.annotationLayerFactory.createAnnotationLayerBuilder(pdfPage, this.imageResourcesPath, this.renderInteractiveForms);
        }
        var viewport = this.viewport.clone({
          scale: this.scale,
          dontFlip: true
        });
        this.annotationLayer.render(viewport, 'display');
      }

      return paintTask;
      // return resultPromise;
      // return Promise.reject(new Error('Ok good'));
    },

    paintOnCanvas: function paintOnCanvas() {
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

      var viewport = this.viewport;
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


      this.canvas = canvas;

      var ctx = canvas.getContext('2d', { alpha: false });

      var bufferWidth = viewport.width || 1;
      var bufferHeight = viewport.height || 1;

      canvas.width = bufferWidth || 1;
      canvas.height = bufferHeight || 1;
      canvas.style.width = Math.floor(viewport.width / MULTIPLIER) + 'px';
      canvas.style.height = Math.floor(viewport.height / MULTIPLIER) + 'px';

      var renderContext = {
        canvasContext: ctx,
        viewport: this.viewport,
        enableWebGL: this.enableWebGL,
        renderInteractiveForms: this.renderInteractiveForms
      };

      var renderTask = this.pdfPage['render'](renderContext);
      renderTask.onContinue = function(cont) {
        showCanvas();
        if (result.onRenderContinue) {
          result.onRenderContinue(cont);
        } else {
          cont();
        }
      };

      renderTask.promise.then(function() {
        showCanvas();
        renderCapability.resolve(canvas);
      }, function(error) {
        showCanvas();
        renderCapability.reject(error);
        console.error(canvas);
      });
      return result;
    },

    getPagePoint: function getPagePoint(x, y) {
      return this.viewport.convertToPdfPoint(x, y);
    }
  });

  exports.PDFJSPageView = PDFJSPageView;
})(window);
