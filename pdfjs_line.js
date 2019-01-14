(function(exports) {
  'use strict';
  class Line {
    constructor(opts) {
      // console.log(opts.item);
      let item = opts.item;
      let text = item.str;
      let transform = item.transform;
      let matrix = opts.pageMatrix;
      let x = transform[4];
      let y = transform[5];
      let width = item.width;
      let height = transform[0];
      let coord = matrix.mult({x,y})
      x = this.parseNum(coord.x);
      y = this.parseNum(coord.y)

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
    }

    parseNum(num) {
      return parseFloat(num.toFixed(4))
    }
    setTop (top) {
        this.top = top;
    }
    setBottom (bottom) {
        this.bottom = bottom;
    }
    addNewline() {
      this.text += '\n'
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


exports.Line = Line;
})(window);
