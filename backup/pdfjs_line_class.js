(function(exports) {
  'use strict';

  var XLine = function XLine(options) {
    let item = options.item
    this._pageMatrix = options.pageMatrix;
    this.textLine = item.str;
    this.fontName = item.fontName;
    let transform = item.transform.concat()

    let x = transform[4];
    let y = transform[5];
    let coord = this._pageMatrix.mult({x,y})

    this.x = coord.x;
    this.y = coord.y;
    this.width = item.width;
    this.height = transform[0];
    this._transform = transform.concat();

    this.font = options.fontProvider.data;
    this._fontMatrix = (this.font.fontMatrix) ? this.font.fontMatrix : [0.001]




    // sometimes we have luck finding here
    let unicodeMap = {}
    this.font.toUnicode._map.filter(function (el, i) {
      if (el != null) {
        unicodeMap[el] = i;
      }
      return el != null;
    });
    this._unicodeMap = unicodeMap









    this.glyphs = []
    let word_arr = this.textLine.split('')
    if(word_arr[word_arr.length - 1] === " ") {
      console.log('warn');
    }
    let space_indexes = []
    for (let i = 0, len = word_arr.length; i < len; i++) {
      let opt = {
        char: word_arr[i],
        cMap: this.font.cMap,
        widths: this.font.widths,
        toUnicode: this.font.toUnicode,
        fontMatrix: this._fontMatrix,
        lineHeight: this.height,
        unicodeMap: this._unicodeMap,
        index: options.charCount + i
      }
      let glyph = new XGlyph(opt)
      if (glyph.width === 0) {
        // console.log('!');
      }
      this.glyphs.push(glyph)
      if (glyph.isSpace && glyph.width === 0) {
        space_indexes.push(i)
      }


      // var char_quad = me._get_quad(char_x, this.y, glyph.char_length, this.height)

      // calculating space width
      transform[4] = glyph.char_length + transform[2] * 0 + transform[4]
    }

    if (!this.font.cMap) {
      let originalWidth = this.lineWidth;
      let newWidth = transform[4]
      let calculatedWidth = (originalWidth - newWidth) / (this.wordCount - 1)
      if (calculatedWidth === -Infinity || calculatedWidth === Infinity || isNaN(calculatedWidth)) {
        calculatedWidth = 0;
      }
      for (let i = 0, len = space_indexes.length; i < space_indexes.length; i++) {
        this.glyphs[space_indexes[i]].setCharLength(calculatedWidth)
      }
    }

    this.words = []
    let words = this.textLine.split(' ');
    if (words[words.length - 1] === '') {
    	words = words.slice(0, words.length - 1)
    }
    let index = 0;
    for (let i = 0, len = words.length; i < len; i++) {
      // let res = this.glyphs.slice(index, index + words[i].length )
      let word;
      if (len - 1 === i) {
        word = words[i];
      } else {
        word = words[i] + ' ';
      }


      let start = index;
      let end = index + word.length;
      if (word.length === 0) {
        // console.warn(words[i]);
        end += 1
      }
      // console.log(res);
      let o = {
        word: word,
        // font: this.font,
        line: this,
        start: start,
        end: end
      }
      this.words.push(new XWord(o))
      index += word.length
    }
  }

  XLine.prototype = {
    get length() {
      return this.textLine.length
    },
    get wordCount() {
      let words = this.textLine.split(' ');
      if (words[words.length - 1] === '') {
      	words = words.slice(0, words.length - 1)
      }
      return words.length
    },
    get lineWidth() {
      return this.x + this.width
    },
    get _m_quad() {
      var quad = []
    },
    get quads() {
      if (this._quads) {
        return this._quads
      }
      this._struct = this.lineStruct;
      return this._quads
    },
    get lineStruct() {
      var struct = []
      var quads = []
      for (var i = 0, len = this.words.length; i < len; i++) {
        struct = struct.concat(this.words[i].stucts)
        quads = quads.concat(this.words[i].quads)
      }
      this._quads = quads;
      let _0 = 0;
      let _1 = this.wordCount;
      let _2 = this.length;
      let _3 = this.firstGlyph.points.x1 //'line_quad.x1';
      let _4 = this.firstGlyph.points.y3 // 'line_quad.y3';
      let _5 = this.lastGlyph.points.x2 //'line_quad.x2';
      let _6 = this.lastGlyph.points.y2 //'line_quad.y1';
      let l_struct = [_1, _2, _3, _4, _5, _6];
      return l_struct.concat(struct)

    },
    get firstGlyph() {
      return this.glyphs[0]
    },
    get lastGlyph() {
      return this.glyphs[this.glyphs.length - 1]
    },
    run: function(){
      for (var i = 0, len = this.glyphs.length; i < len; i++) {
        let glyph = this.glyphs[i]
        glyph.setLeftX(this._transform[4])
        var char_quad = this._get_quad(glyph.left_x, this.y, glyph.char_length, this.height)
        glyph.setQuad(char_quad)
        this._transform[4] = glyph.char_length + this._transform[2] * 0 + this._transform[4]
      }
    },
    _get_quad: function(x, y, width, height) {
      var extraButtomSpace = height * 0.23
      var x1 = x
      var y1 = (y - height)
      var x2 = x1 + width
      var y2 = y1
      var x3 = x2
      var y3 = (y1 + height)
      var x4 = x1
      var y4 = y3
      return { x1, y1, x2, y2, x3, y3, x4, y4  }
    },
    toString: function() {
        return this.textLine + ' ' + this.textLine.split(' ').length;
    },
    words: function() {
      return this.textLine.split(' ');
    },
    _drawRect: function(ctx, scale){
      var mul = exports.utils.getCanvasMultiplier();
      scale = scale * mul;
      var y = this.y - this.height;
      ctx.translate(0.5, 0.5)
      ctx.setLineDash([6]);
      ctx.rect(this.x * scale, y * scale, this.width * scale, this.height * scale);
      ctx.stroke()
      return;
    },
    _drawLine(ctx, scale) {
      var mul = exports.utils.getCanvasMultiplier();
      scale = scale * mul;
      var x = this.x;
      var y = this.y - this.height
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(x * scale , y * scale);
      ctx.stroke();
    }
  }

  var XWord = function XWord(options) {
    this.word = options.word
    this._start = options.start;
    this._end = options.end;
    // let font = options.font
    this._line = options.line
    this._quads = null;
    this._struct = null;

    // let p0 = aWord.length - offset;
    // let p1 = char_pos - aWord.length;
    // let p2 = aWord.length - offset;
    // // let p3 = char_quad.x1 - (char_length  * (aWord.length - offset));
    // // let p4 = char_quad.x2 - char_length;
    // let p3 = w_quad[0]//char_quad.x1 - (char_length  * (aWord.length - offset));
    // let p4 = w_quad[w_quad.length - 1 - 7]//char_quad.x2 - char_length;
    // var w_struct = [p0, p1, p2, p3, p4]
  }

  XWord.prototype = {
    get glyphs() {
      return this._line.glyphs.slice(this._start, this._end)
    },
    get firstGlyph() {
      return this._line.glyphs[this._start]
    },
    get _m_quad() {
      var quad = new Array(8);
      let first = this._line.glyphs[this._start]
      return quad;
    },
    get stucts() {
      let firstGlyph = this.firstGlyph
      if (!firstGlyph) {
        console.log('not');
      }


      // if (this.word[this.word.length - 1] === ' ') {
      //   var offset = (this.word.length - 1 === 0) ? 0 : 1
      //
      //   let p0 = this.word.length - offset;
      //   let p1 = firstGlyph.index // char_pos - aWord.length;
      //   let p2 = this.word.length - offset;
      //   let p3 = this.quads[0]
      //   let p4 = this.quads[this.quads.length - 1 - 7]
      //   var w_struct = [p0, p1, p2, p3, p4]
      //   return w_struct
      //   // let p3 = w_quad[0]//char_quad.x1 - (char_length  * (aWord.length - offset));
      //   // let p4 = w_quad[w_quad.length - 1 - 7]//char_quad.x2 - char_length;
      // } else {
        let p0 = this.word.length
        let p1 = firstGlyph.index;// - aWord.length;
        let p2 = this.word.length
        let p3 = this.quads[0]
        let p4 = this.quads[this.quads.length - 6]
        var w_struct = [p0, p1, p2, p3, p4]
        return w_struct
      // }

    },
    get quads() {
      if (this._quads) {
        return this._quads
      }
      let glyphs = this.glyphs
      var quads = []
      for (let i = 0; i < glyphs.length; i++) {
        // if (glyphs[i].isSpace) {
          quads = quads.concat(glyphs[i].quad)
        // }

      }
      this._quads = quads
      return quads
    }
  }

  var XGlyph = function XGlyph(options) {
    let cMap = options.cMap;
    this.index = options.index;
    let lineHeight = options.lineHeight;
    let fontMatrix = options.fontMatrix;
    let unicodeMap = options.unicodeMap
    this.char = options.char;
    let widths = options.widths;
    let toUnicode = options.toUnicode;

    let charWidth, charcode, widthCode;
    if (cMap) {
      charcode = -1;//unicodeMap[xline.charAt(i)]
      // console.warn('cmap');
    } else {
      charcode = this.char.charCodeAt(0);
    }
    this.unicode = charcode;
    if (this.unicode === -1){
      // console.log('!');
    }
    widthCode = charcode;

    charWidth = widths[widthCode]
    if(!isNum(charWidth)) {
      // console.warn(this.word.charCodeAt(i));
    }
    charWidth = isNum(charWidth) ? charWidth : 0

    this.width = charWidth;
    if (this.unicode !== 32 && this.width === 0 && this.char !== '') {
      if (toUnicode._map.contains(this.char)){
        this.unicode = toUnicode._map.findIndex(char => char === this.char)
        this.width = widths[this.unicode];
        if (!this.width) {
          this.unicode = unicodeMap[this.char];
          this.width = widths[this.unicode];
        }
      } else {
        this.width = 0
      }
    }


    let charSpacing = 0;
    let textState = {fontSize: 1, textHScale:1 }
    let w0 = this.width * fontMatrix[0];
    let tx = (w0 * textState.fontSize + charSpacing) *  textState.textHScale;
    this.char_length = lineHeight * tx
    if (isNaN(this.char_length)){
      console.error('!');
    }
  }

  XGlyph.prototype = {
    get isSpace(){
      // Space is char with code 0x20 and length 1 in multiple-byte codes.
      return this.char.length === 1 && this.char.charCodeAt(0) === 0x20;
    },
    setCharLength: function(char_length) {
      this.char_length = char_length
    },
    setLeftX: function(x) {
      this.left_x = x;
    },
    setQuad: function(quad) {
      var q = [quad.x1, quad.y1, quad.x2, quad.y2 ,quad.x3, quad.y3, quad.x4, quad.y4]
      this.points = quad;
      this.quad = q
    }
  }

  function isNum(v) {
    return typeof v === 'number';
  }

  exports.XLine = XLine;
  exports.XWord = XWord;
  exports.XGlyph = XGlyph;
})(window);
