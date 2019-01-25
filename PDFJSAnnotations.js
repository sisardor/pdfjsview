(function(exports) {
  'use strict';
  const AnnotationBorderStyleType = {
    SOLID: 1,
    DASHED: 2,
    BEVELED: 3,
    INSET: 4,
    UNDERLINE: 5,
  };
  const AnnotationType = {
    TEXT: 1,
    LINK: 2,
    FREETEXT: 3,
    LINE: 4,
    SQUARE: 5,
    CIRCLE: 6,
    POLYGON: 7,
    POLYLINE: 8,
    HIGHLIGHT: 9,
    UNDERLINE: 10,
    SQUIGGLY: 11,
    STRIKEOUT: 12,
    STAMP: 13,
    CARET: 14,
    INK: 15,
    POPUP: 16,
    FILEATTACHMENT: 17,
    SOUND: 18,
    MOVIE: 19,
    WIDGET: 20,
    SCREEN: 21,
    PRINTERMARK: 22,
    TRAPNET: 23,
    WATERMARK: 24,
    THREED: 25,
    REDACT: 26,
  };


  class AnnotationElementFactory {
    static create(parameters) {
      let subtype = parameters.data.annotationType;
      switch (subtype) {
        case AnnotationType.LINK:
          return new LinkAnnotationElement(parameters);

        default:
          return new AnnotationElement(parameters);
      }
    }

  }

  class LinkAnnotationElement extends Annotations.Link {
    constructor(options) {
      super(options.data);
      let data = options.data

      let points = data.rect
      let point1 = new Annotations.Point(points[0], points[1]);
      let point2 = new Annotations.Point(points[2], points[3]);
      options.pageMatrix.mult(point1);
      options.pageMatrix.mult(point2);

      // let rect = new Annotations.Rect(point1.x, point1.y, point2.x, point2.y);

      this.setX(point1.x)
      this.setY(point2.y)
      this.setWidth(point2.x - point1.x)
      this.setHeight(point1.y - point2.y)
      this.setPageNumber(options.pageNum);
      if (data.url) {
        let uri = (data.url) ? data.url : "https://www.google.com"
        this.addAction('U', new Actions.URI({ uri: uri }));
      } else if(data.dest) {
        let destArray = data.dest
        if (typeof destArray === 'string') {
          destArray = options.destinations[destArray]
        }
        let parsedDest = options.parseDest(options.pageNum, destArray)
        let parsedPageNum = options.parsePageNumber(data.dest[0])
        let opts =  {
          bottom: parsedDest.y,
          fit: parsedDest.fit,
          left: parsedDest.x,
          name: undefined,
          page: parsedPageNum,
          right: parsedDest.x + parsedDest.width,
          top: parsedDest.y - parsedDest.height,
          zoom: undefined
        }
        this.addAction('U', new Actions.GoTo({ dest: opts }));
      } else if (data.action) {
        this.addAction('U', new Actions.Named({ action: data.action }));
      }
      this['StrokeStyle'] = this.getStyle(data)
      this['StrokeThickness'] = data.borderStyle.width;
      this['Hidden'] = false;
      this['StrokeColor'] = new Annotations.Color(
                                data.color[0],
                                data.color[1],
                                data.color[2]
                            )


    }

    getStyle(data) {
      let strokeStyle;
      switch (data.borderStyle.style) {
        case AnnotationBorderStyleType.SOLID:
          strokeStyle = 'solid';
          break;

        case AnnotationBorderStyleType.DASHED:
          strokeStyle = 'dashed';
          break;

        case AnnotationBorderStyleType.BEVELED:
          console.warn('Unimplemented border style: beveled');
          break;

        case AnnotationBorderStyleType.INSET:
          console.warn('Unimplemented border style: inset');
          break;

        case AnnotationBorderStyleType.UNDERLINE:
          strokeStyle = 'underline';
          break;

        default:
          break;
      }
      return strokeStyle
    }
  }


  exports.AnnotationElementFactory = AnnotationElementFactory;
})(window);
