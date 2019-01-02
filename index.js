Promise.all([
  SystemJS.import('pdfjs-lib'),
  // SystemJS.import('pdfjs-web/PDFJSDocument'),
  // SystemJS.import('pdfjs-web/pdfjs_page_view'),
  // SystemJS.import('pdfjs-web/pdfjs_annotation_layer_builder'),
  // SystemJS.import('pdfjs-web/pdfjs_text_layer_builder'),
  // SystemJS.import('pdfjs-web/pdfjs_find_controller'),
  // SystemJS.import('pdfjs-web/pdfjs_thumbnail_view'),

]).then(function([pdfjsLib]) {
  // console.log(pdfjsLib);
  window.pdfjsLib = pdfjsLib
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '//mozilla.github.io/pdf.js/build/pdf.worker.js';
  // SystemJS.import('pdfjs-web/PDFJSDocument')
  // SystemJS.import('pdfjs-web/pdfjs_page_view')
  // SystemJS.import('pdfjs-web/pdfjs_annotation_layer_builder')
  // SystemJS.import('pdfjs-web/pdfjs_text_layer_builder')
  // SystemJS.import('pdfjs-web/pdfjs_find_controller')
  // SystemJS.import('pdfjs-web/pdfjs_thumbnail_view')
});



this.doc = exports['CoreControls']['Document'].getDocumentType(type)(id)

var DOCUMENT_TYPES = Object.create({})
exports.CoreControls.Document.getDocumentType = function(type) {
  if (_.isUndefined(type)) {
    type = 'xod'
  }
  if (!DOCUMENT_TYPES.hasOwnProperty(type)) {
    console.warn('there is no type', type);
    return
  }
  return function(id) {
    return new DOCUMENT_TYPES[type](id)
  }
}
exports.CoreControls.Document.registerDocumentType = function(type, source) {
  if (_.isUndefined(type) || _.isUndefined(source)) {
    return;
  }
  if (!exports.hasOwnProperty('DOCUMENT_TYPES')) {
    exports.DOCUMENT_TYPES = Object.create({})
  }

  if (source.prototype instanceof exports.CoreControls.BaseDocument) {
    DOCUMENT_TYPES[type] = source
    console.log('registered document type "'+ type +'"');
    return;
  }
  console.log('Does not extand CoreControls.BaseDocument');
  return;
}
exports.CoreControls.Document.unregisterDocumentType = function(type) {
  if (DOCUMENT_TYPES.hasOwnProperty(type)) {
    delete DOCUMENT_TYPES[type]
  } else {
    console.warn('no type like this');
  }
}
