'use strict';

(function (exports) {
  'use strict';

  var AnnotationLayer = pdfjsLib['AnnotationLayer'];

  var PDFJSAnnotationLayerBuilder = function PDFJSAnnotationLayerBuilder(_ref) {
    var pageDiv = _ref.pageDiv,
        pdfPage = _ref.pdfPage,
        _ref$linkService = _ref.linkService,
        linkService = _ref$linkService === undefined ? null : _ref$linkService,
        _ref$downloadManager = _ref.downloadManager,
        downloadManager = _ref$downloadManager === undefined ? null : _ref$downloadManager,
        _ref$renderInteractiv = _ref.renderInteractiveForms,
        renderInteractiveForms = _ref$renderInteractiv === undefined ? false : _ref$renderInteractiv;

    // this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = 'external/images/';
    this.renderInteractiveForms = renderInteractiveForms;

    this.div = null;
    this._cancelled = false;
  };

  PDFJSAnnotationLayerBuilder.prototype = {
    render: function render(clonedViewport) {
      var _this = this;

      var intent = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'display';

      this.pdfPage['getAnnotations']({
        intent: intent
      }).then(function (annotations) {
        if (_this._cancelled) {
          return;
        }

        var parameters = {
          viewport: clonedViewport,
          div: null,
          annotations: annotations,
          page: _this.pdfPage,
          imageResourcesPath: _this.imageResourcesPath,
          renderInteractiveForms: _this.renderInteractiveForms
          // linkService: this.linkService,
          // downloadManager: this.downloadManager,
        };

        if (annotations.length === 0) {
          return;
        }

        var pageDiv = _this.getWidgetContainerParent(_this.pdfPage.pageIndex);
        if (pageDiv.length) {
          var div = document.createElement('div');
          div.className = 'annotationLayer';

          pageDiv = pageDiv[0];
          pageDiv.appendChild(div);
          parameters.div = div;
          AnnotationLayer.render(parameters);
        }
      });
    },
    getWidgetContainerParent: function(pageIndex) {
      return $('#pageContainer' + pageIndex);
    },

    cancel: function cancel() {
      this._cancelled = true;
    },

    hide: function hide() {
      if (!this.div) {
        return;
      }
      this.div.setAttribute('hidden', 'true');
    }
  };

  exports.PDFJSAnnotationLayerBuilder = PDFJSAnnotationLayerBuilder;
})(window);
