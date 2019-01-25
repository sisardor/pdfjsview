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



CoreControls.Document.registerDocumentType('pdf', CoreControls.PDFDocument)


this.doc = CoreControls.Document.getDocumentType(type)(id)

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



















if (CoreControls.PDFJSDocument !== undefined
  && this.doc.doc instanceof CoreControls.PDFJSDocument) {
  var mainArguments = Array.prototype.slice.call(arguments);
  mainArguments.unshift(this.currentPattern);
  this.doc.doc.textSearch.apply(this.doc.doc, mainArguments)
  return
}































var me = this
const textContent = this.findController._pageTextContents[0]
// const item = textContent.items[0];
// const transform = item.transform;
// const x = transform[4];
// const y = transform[5];
// const width = item.width;
// const height = item.height;
// var x1 = x;
// var x2 = x + width
// var x3 = x + width
// var x4 = x

// var xy = pdfjsLib.Util.transform(this.viewport.transform, textContent.items[0].transform)
// var res = convertToCanvasCoords([x, y, width, height])
// var tx = pdfjsLib.Util.transform(
//   pdfjsLib.Util.transform(this.viewport.transform, item.transform),
// [1, 0, 0, -1, 0, 0]);
// console.log('===========');
// console.log(tx);
let c = document.getElementById("page1");
let ctx = c.getContext("2d");
let MULTIPLIER = exports.utils.getCanvasMultiplier();
let scale = MULTIPLIER * this.doc.scale
// for (var j = 0; j < textContent.items.length; j++) {
//   let item = textContent.items[j]
//   if (item.str === ' ') continue
//   let transform = item.transform;
//   let x = transform[4];
//   let y = transform[5];
//   let width = item.width;
//   let height = transform[0] // item.height;
//   let page = this.doc.pages[0]
//   let p = page.matrix.mult({x,y})
//
//   // let str = item.str;
//   let l_len = width / item.str.length
//   for(let i = 0; i < item.str.length; i++) {
//     if (item.str[i] === ' ') continue
//     // let _i = i > 0 ?  i : 1
//     let new_x = x + (l_len * i)
//     let descent = 11//textContent.styles[item.fontName].descent * -1
//     ctx.rect(new_x * scale, (p.y - height) * scale,  l_len * scale, height * scale);
//     ctx.stroke();
//   }
// }















// {
//   "resultCode": 2,
//   "page_num": 0,
//   "result_str": "Dynamic",
//   "ambient_str": "for Dynamic Languages Andreas Gal∗+, Brendan Eich∗,",
//   "result_str_start": 4,
//   "result_str_end": 11,
//   "quads": [
//   {
//     "x1": 460.87058800000034,
//     "y1": 95.07735519999994,
//     "x2": 529.6070104000004,
//     "y2": 95.07735519999994,
//     "x3": 529.6070104000004,
//     "y3": 74.11391199999991,
//     "x4": 460.87058800000034,
//     "y4": 74.11391199999991
//   }
//   ]
// }


var temp = `Trace-based Just-in-Time Type Specialization for Dynamic
Languages
1.  Introduction
Andreas Gal∗+, Brendan Eich∗, Mike Shaver∗, David Anderson∗, David Mandelin∗,`
let r = temp.split('\n')
let pivot = 0, pi = 0
var struct = []
r.forEach((line, i) => {
    let lastIndex = pivot + line.length
	console.log(pivot, line, lastIndex)
	pivot += line.length + 1
	let w = line.split(' ')
    w.forEach((word, j) => {
        var m = 1;
        var length = word.length;
    		if (length === 0) {
              length = 1
              m = 0;
    		}
        // 		var char = temp[pi]
        // 		console.log(' ',pi, `"${word}"  "${char}"`)
        //         console.log(`"${word}" -- index: ${pi}, length: ${length}`)
        if (word.length) {
          struct.push([length, pi, length])
        }
    		pi += length + m
    })
})
var line = [

]
console.log(struct)

















var temp = `WebViewer
JavaScript-based dfsdf`
let lines = temp.split('\n')
let pivot = 0
let pi = 0
var struct = []
console.log(lines)
for (let i = 0, len = lines.length; i < len; i++) {
  let line = lines[i]
  let lastIndex = pivot + line.length
  pivot += line.length + 1
  let words = line.split(' ')
  for (let j = 0, len2 = words.length; j < len2; j++) {
    let word = words[j]
    let wlength = (word.length) ? word.length : 1 ;
    var offset = (word.length) ? 1 : 0 ;

    if (word.length) {
      struct.push([wlength, pi, wlength])
    }
    pi += wlength + offset
  }
}
var line = []
console.log(struct)










var c = document.getElementById('page1')
var ctx = c.getContext('2d')
var rect = [322.842, 694.556, 429.452, 717.886]
var mul = utils.getCanvasMultiplier();
var scale = 1.52 * mul;
ctx.rect(rect[0] * scale, rect[1] * scale, rect[2] * scale, rect[3] * scale);
ctx.stroke()






<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
	<annots>
		<link style="solid" width="1" page="0" rect="322.842,   694.556,   429.452,   717.886">
			<OnActivation>
				<Action Trigger="U">
					<URI Name="https://www.pdftron.com/" />
				</Action>
			</OnActivation>
		</link>
		<link style="solid" width="1" page="0" rect="80.5159, 694.556, 124.003, 717.886">
			<OnActivation>
				<Action Trigger="U">
					<GoTo>
						<Dest>
							<FitH Top="727" Page="2" />
						</Dest>
					</GoTo>
				</Action>
			</OnActivation>
		</link>
		<redact color="#E52237" creationdate="D:20190118102555-08'00'" flags="print" interior-color="#000000" date="D:20190118102555-08'00'" name="dffd3050-fd67-3d4e-a8f1-f79ca97a80bc" page="0" coords="460.87,717.886,529.607,717.886,460.87,694.556,529.607,694.556" rect="459.37,693.056,531.107,719.386" subject="Redact" title="zeromax">
			<popup flags="print,nozoom,norotate" open="no" page="0" rect="612,603.886,816,717.886" />
			<defaultappearance>1 0 0 RG 0 g 0 Tc 0 Tw 100 Tz 0 TL 0 Ts 0 Tr /Helv 10 Tf</defaultappearance>
			<apref y="719.386" x="459.37" gennum="0" objnum="1016" />
			<apref annotation-state="Rollover" y="719.386" x="459.37" gennum="0" objnum="1016" />
			<apref annotation-state="Down" y="719.386" x="459.37" gennum="0" objnum="1016" />
		</redact>
		<strikeout color="#E52237" creationdate="D:20190118103650-08'00'" flags="print" date="D:20190118103919-08'00'" name="541b1b31-3e2f-df49-8952-86be01aca9e0" page="0" coords="158.441,442.236,195.391,442.236,158.441,431.432,195.391,431.432" rect="155.219,430.756,198.613,442.911" subject="Cross-Out" title="zeromax">
			<contents-richtext><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" xfa:APIVersion="Acrobat:19.10.0" xfa:spec="2.0.2" ><p dir="ltr"><span dir="ltr" style="font-size:14.0pt;text-align:left;color:#000000;font-weight:normal;font-style:normal">Some comment</span></p></body></contents-richtext>
			<popup flags="print,nozoom,norotate" open="no" page="0" rect="612,328.236,816,442.236" />
			<contents>Some comment</contents>
		</strikeout>
		<highlight color="#FFD100" opacity="0.399994" creationdate="D:20190118103657-08'00'" flags="print" date="D:20190118103931-08'00'" name="c378a64e-eca8-c841-80b8-5813f6d61051" page="0" coords="89.8207,442.236,125.677,442.236,89.8207,431.432,125.677,431.432" rect="86.9365,431.094,128.562,442.574" subject="Highlight" title="zeromax">
			<contents-richtext><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" xfa:APIVersion="Acrobat:19.10.0" xfa:spec="2.0.2" ><p dir="ltr"><span dir="ltr" style="font-size:14.0pt;text-align:left;color:#000000;font-weight:normal;font-style:normal">I highlighted text</span></p></body></contents-richtext>
			<popup flags="print,nozoom,norotate" open="no" page="0" rect="612,328.236,816,442.236" />
			<contents>I highlighted text</contents>
			<apref y="442.574" x="86.9365" gennum="0" objnum="1028" />
		</highlight>
	</annots>
	<pages>
		<defmtx matrix="1.333333,0.000000,0.000000,-1.333333,0.000000,1056.000000" />
	</pages>
	<pdf-info version="2" xmlns="http://www.pdftron.com/pdfinfo" />
</xfdf>
