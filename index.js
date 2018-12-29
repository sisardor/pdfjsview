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
