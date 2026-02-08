export interface ShapeDefinition {
  id: string;
  labelKey: string;
  svgPath: string;       // SVG path data, viewBox="0 0 24 24"
  strokeOnly?: boolean;  // true if shape is stroke-only (arrow, line)
  defaults: {
    shapeFill: string;
    shapeStroke: string;
    shapeStrokeWidth: number;
    shapeCornerRadius?: number;
  };
}

export const SHAPE_DEFINITIONS: ShapeDefinition[] = [
  {
    id: 'rectangle',
    labelKey: 'shape.rectangle',
    svgPath: 'M3 3h18v18H3z',
    defaults: { shapeFill: '#3B82F6', shapeStroke: '#FFFFFF', shapeStrokeWidth: 0, shapeCornerRadius: 0 },
  },
  {
    id: 'circle',
    labelKey: 'shape.circle',
    svgPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    defaults: { shapeFill: '#EF4444', shapeStroke: '#FFFFFF', shapeStrokeWidth: 0 },
  },
  {
    id: 'triangle',
    labelKey: 'shape.triangle',
    svgPath: 'M12 2L2 22h20z',
    defaults: { shapeFill: '#F59E0B', shapeStroke: '#FFFFFF', shapeStrokeWidth: 0 },
  },
  {
    id: 'star',
    labelKey: 'shape.star',
    svgPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
    defaults: { shapeFill: '#F59E0B', shapeStroke: '#FFFFFF', shapeStrokeWidth: 0 },
  },
  {
    id: 'arrow',
    labelKey: 'shape.arrow',
    svgPath: 'M5 12h14M12 5l7 7-7 7',
    strokeOnly: true,
    defaults: { shapeFill: 'transparent', shapeStroke: '#FFFFFF', shapeStrokeWidth: 4 },
  },
  {
    id: 'line',
    labelKey: 'shape.line',
    svgPath: 'M3 12h18',
    strokeOnly: true,
    defaults: { shapeFill: 'transparent', shapeStroke: '#FFFFFF', shapeStrokeWidth: 4 },
  },
];
