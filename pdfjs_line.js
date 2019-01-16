(function(exports) {
  'use strict';

  function isNum(v) {
    return typeof v === 'number';
  }

  class Line {
    constructor(opts) {
      let item = opts.item;
      let text = item.str.replace(/\s+/g, " ");
      let transform = item.transform;
      let matrix = opts.pageMatrix;

      // fontMatrix is used when calculating char width
      let fontMatrix = (opts.font.data.fontMatrix) ? opts.font.data.fontMatrix : [0.001]
      let x = transform[4];
      let y = transform[5];
      let width = item.width;
      let height = transform[0];
      let coord = matrix.mult({x,y}) // convert to webview coordinates
      x = this.parseNum(coord.x);
      y = this.parseNum(coord.y)

      // bottom offset %20
      this._bottom_offset =  0.20

      let left_x = x;
      let right_x = this.parseNum(left_x + width)
      let top = this.parseNum(y - height)
      let bottom = y

      // console.log(`(${left_x}, ${top})` +
      //             `(${right_x}, ${top})` +
      //             `(${right_x}, ${bottom})` +
      //             `(${left_x}, ${bottom})` +
      //             `"${text}"`);

      this.left_x = left_x;
      this.right_x = right_x;
      this.top = top;
      this.bottom = bottom;
      this.text = text
      this._width = width;
      this._height = height;
      this._font = opts.font.data;
      this.quads = [];


      this._textMatrix = item.transform.concat();
      this._textLineMatrix = item.transform.concat()

      // this map maybe used some cases when unicode is not available
      // it allow to lookup unicdoe with character string
      let unicodeMap = {}
      this._font.toUnicode._map.filter(function (el, i) {
        if (el != null) {
          unicodeMap[el] = i;
        }
        return el != null;
      });
      this._unicodeMap = unicodeMap
    }

    parse() {
      // if (this.text === 'fi') {
      //   debugger
      // }
      let isThereSpace = false;
      if (/\s/.test(this.text)) {
        // found space width
        isThereSpace = true;
      }
      let space_indexes = []
      let fontMatrix = (this._font.fontMatrix) ? this._font.fontMatrix : [0.001]
      let chars = this.text.split('');
      let glyphs = chars.map((char, index) => {
        let opt = {
          char: char,
          cMap: this._font.cMap,
          widths: this._font.widths,
          toUnicode: this._font.toUnicode,
          fontMatrix: fontMatrix,
          lineHeight: this._height,
        }
        let g = new Glyph(opt);

        if (isThereSpace) {
          if (g.isSpace && (g.width == null || g.width === 0)) {
            // console.warn('space is null or 0 ... calculate space');
            g.setCharLength(0)
            space_indexes.push(index)
          }

          else if(!g.isSpace && isNum(g.unicode) && isNaN(g.char_length)) {
            g.setCharLength(0)
          }
          else if (!g.isSpace && !g.unicode && isNaN(g.char_length)) {
            g.setCharLength(this._width / this.text.length)
          }
        }
        else if(!isThereSpace) {
          if (!g.isSpace && isNum(g.unicode) && g.char_length === 0) {
            // if there is no space and glyph is 0 length
            // it might be ligature and we set the widh to avareage length
            g.setCharLength(this._width / this.text.length)
          }
        }

        this._textMatrix[4] = g.char_length + this._textMatrix[2] * 0 + this._textMatrix[4]
        return g
      })

      // if this text contained space and space with info not available
      // calculate width and update glyph of type space
      if (isThereSpace && !this._font.cMap) {
        let originalWidth = this.left_x + this._width;
        let newWidth = this._textMatrix[4]
        let words = this.text.split(' ');
        let calculatedWidth = (originalWidth - newWidth) / (this.text.split(' ').length - 1)
        if (calculatedWidth === -Infinity || calculatedWidth === Infinity || isNaN(calculatedWidth)) {
          calculatedWidth = 0;
        }
        for (let i = 0, len = space_indexes.length; i < space_indexes.length; i++) {
          glyphs[space_indexes[i]].setCharLength(calculatedWidth)
        }
      }

      // calculate each character's quad and save it to this.quads
      let transform = this._textLineMatrix.concat()
      let quads = glyphs.map((glyph, index) => {
        let left_x = transform[4];
        let right_x = left_x + glyph.char_length;
        let top = this.top;
        let off = (this.bottom - this.top) * this._bottom_offset
        let bottom = this.bottom + off
        // console.log(`(${left_x}, ${top})` +
        //             `(${right_x}, ${top})` +
        //             `(${right_x}, ${bottom})` +
        //             `(${left_x}, ${bottom})` +
        //             `"${glyph.char}"`);
        transform[4] = glyph.char_length + transform[2] * 0 + transform[4]
        return [
          left_x, top,
          right_x, top,
          right_x, bottom,
          left_x, bottom
        ];
      })
      // console.log(quads.length, this.text.length);
      // console.log('\n');
      this.glyphs = glyphs
      this.quads = quads
    }

    getQuads() {
      return this.quads;
    }

    parseNum(num) {
      return parseFloat(num.toFixed(4))
    }

    addNewline() {
      if (!this.text.endsWith('\n')) {
        this.text += '\n';
      }
    }
    _drawRect(ctx, scale){
      var mul = exports.utils.getCanvasMultiplier();
      scale = scale * mul;
      var height = this.bottom - this.top;
      // ctx.translate(0.5, 0.5)
      // ctx.setLineDash([6]);
      ctx.rect(this.left_x * scale, this.top * scale, this._width * scale, height * scale);
      ctx.stroke()
      return;
    }
  }

  class Glyph {
    constructor(opts) {
      let char = opts.char;
      let cMap = opts.cMap;
      let fontMatrix = opts.fontMatrix;
      let unicodeMap = opts.unicodeMap;
      let lineHeight = opts.lineHeight;
      let widths = opts.widths;
      let toUnicode = opts.toUnicode;

      this.char = opts.char

      if (cMap) {
        if (toUnicode._map.contains(this.char)){
          this.unicode = toUnicode._map.findIndex(char => char === this.char)
        } else {
          this.unicode = null;
        }
      } else {
        this.unicode = this.char.charCodeAt(0);
      }

      // if newline '\n' set width to 0 and return
      if (this.unicode === 0x0A || this.char ===  String.fromCharCode(0x0A)) {
        // this is newline unicode
        this.width = 0;
        this.unicode = this.char.charCodeAt(0);
        this.char_length = 0;
        return
      }
      // if space glyph
      else if(this.char.charCodeAt(0) === 0x20) {
        // this is space
        this.width = widths[this.unicode]
      }
      // other characters
      else {
        this.width = widths[this.unicode]
        if (this.width == null && toUnicode._map.contains(this.char)){
          this.unicode = toUnicode._map.findIndex(char => char === this.char)
          this.width = widths[this.unicode];
        }
      }

      if (this.isSpace && (this.width == null || this.width === 0)) {
        // character width will be calculated and set later
        // console.error(this.char, 'is null  or 0 width')
      } else {

        // calculate character width
        var tx = 0;
        var ty = 0;
        let charSpacing = 0;
        let textState = {fontSize: 1, textHScale: 1}
        let w0 = this.width * fontMatrix[0];
        tx = (w0 * textState.fontSize + charSpacing) *  textState.textHScale;

        this.char_length = lineHeight * tx
      }
    }
    get isSpace() {
      return this.char.charCodeAt(0) === 0x20
    }
    setCharLength(char_length) {
      this.char_length = char_length
    }
  }

exports.Line = Line;
})(window);
