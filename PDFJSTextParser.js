(function(exports) {
  'use strict';

  function isNum(v) {
    return typeof v === 'number';
  }

  class Line {
    constructor(opts) {
      let item = opts.item;
      let text = item.str;
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
      this._bottomOffset =  0.15

      let leftX = x;
      let rightX = this.parseNum(leftX + width)
      let top = this.parseNum(y - height)
      let bottom = y

      // console.log(`(${leftX}, ${top})` +
      //             `(${rightX}, ${top})` +
      //             `(${rightX}, ${bottom})` +
      //             `(${leftX}, ${bottom})` +
      //             `"${text}"`);

      this.leftX = leftX;
      this.rightX = rightX;
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
      let unicodeObjMap = {}
      this._font.toUnicode._map.filter(function (el, i) {
        if (el != null) {
          unicodeObjMap[el] = i;
        }
        return el != null;
      });
      this._unicodeObjMap = unicodeObjMap
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
      let spaceIndexes = []
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
          unicodeObjMap: this._unicodeObjMap,
          font: this._font
        }
        let g = new Glyph(opt);

        if (isThereSpace) {
          if (g.isSpace && (g.width == null || g.width === 0)) {
            // console.warn('space is null or 0 ... calculate space');
            g.setCharLength(0)
            spaceIndexes.push(index)
          }

          else if(!g.isSpace && isNum(g.unicode) && isNaN(g.charLength)) {
            g.setCharLength(0)
          }
          else if (!g.isSpace && !g.unicode && isNaN(g.charLength)) {
            g.setCharLength(this._width / this.text.length)
          }
        }
        else if(!isThereSpace) {
          if (!g.isSpace && isNum(g.unicode) && g.charLength === 0) {
            // if there is no space and glyph is 0 length
            // it might be ligature and we set the widh to avareage length
            g.setCharLength(this._width / this.text.length)
          }
        }

        this._textMatrix[4] = g.charLength + this._textMatrix[2] * 0 + this._textMatrix[4]
        return g
      })

      // if this text contained space and space with info not available
      // calculate width and update glyph of type space
      if (isThereSpace) {
        let originalWidth = this.leftX + this._width;
        let newWidth = this._textMatrix[4]
        let words = this.text.split(' ');
        let calculatedWidth = (originalWidth - newWidth) / (this.text.split(' ').length - 1)
        if (calculatedWidth === -Infinity || calculatedWidth === Infinity || isNaN(calculatedWidth)) {
          calculatedWidth = 0;
        }
        for (let i = 0, len = spaceIndexes.length; i < spaceIndexes.length; i++) {
          glyphs[spaceIndexes[i]].setLengthIfZero(calculatedWidth)
        }
      }

      // calculate each character's quad and save it to this.quads
      let transform = this._textLineMatrix.concat()
      let quads = glyphs.map((glyph, index) => {
        let leftX = transform[4];
        let rightX = leftX + glyph.charLength;
        let top = this.top;
        let off = (this.bottom - this.top) * this._bottomOffset
        let bottom = this.bottom + off
        // console.log(`(${leftX}, ${top})` +
        //             `(${rightX}, ${top})` +
        //             `(${rightX}, ${bottom})` +
        //             `(${leftX}, ${bottom})` +
        //             `"${glyph.char}"`);
        transform[4] = glyph.charLength + transform[2] * 0 + transform[4]
        // return [
        //   leftX, top,
        //   rightX, top,
        //   rightX, bottom,
        //   leftX, bottom
        // ];
        return [
          leftX, bottom,
          rightX, bottom,
          rightX, top,
          leftX, top
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
      ctx.rect(this.leftX * scale, this.top * scale, this._width * scale, height * scale);
      ctx.stroke()
      return;
    }
    toString() {
        return `"${this.text}"`
    }
  }

  class Glyph {
    constructor(opts) {
      let char = opts.char;
      let cMap = opts.cMap;
      let fontMatrix = opts.fontMatrix;
      let unicodeMap = opts.unicodeMap;
      let unicodeObjMap = opts.unicodeObjMap;
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
      if (this.char ===  String.fromCharCode(0x0A)) {
        // this is newline unicode
        this.width = 0;
        this.unicode = this.char.charCodeAt(0);
        this.charLength = 0;
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
          if (this.width == null) {
            this.width = widths[unicodeObjMap[this.char]] || opts.font.defaultWidth
          }
        } else if(this.width == null) {
          this.width = opts.font.defaultWidth
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

        this.charLength = lineHeight * tx
      }
    }
    get isSpace() {
      return this.char.charCodeAt(0) === 0x20
    }
    setCharLength(charLength) {
      this.charLength = charLength
    }
    setLengthIfZero(charLength) {
      if (!this.charLength || this.charLength === 0) {
        this.charLength = charLength
      }
    }
  }

exports.Line = Line;
})(window);
