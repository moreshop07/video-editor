export interface PipPreset {
  id: string;
  labelKey: string;
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
}

export const pipPresets: PipPreset[] = [
  { id: 'topLeft', labelKey: 'pip.topLeft', positionX: 0.2, positionY: 0.2, scaleX: 0.3, scaleY: 0.3 },
  { id: 'topRight', labelKey: 'pip.topRight', positionX: 0.8, positionY: 0.2, scaleX: 0.3, scaleY: 0.3 },
  { id: 'bottomLeft', labelKey: 'pip.bottomLeft', positionX: 0.2, positionY: 0.8, scaleX: 0.3, scaleY: 0.3 },
  { id: 'bottomRight', labelKey: 'pip.bottomRight', positionX: 0.8, positionY: 0.8, scaleX: 0.3, scaleY: 0.3 },
  { id: 'centerSmall', labelKey: 'pip.centerSmall', positionX: 0.5, positionY: 0.5, scaleX: 0.5, scaleY: 0.5 },
  { id: 'splitLeft', labelKey: 'pip.splitLeft', positionX: 0.25, positionY: 0.5, scaleX: 0.5, scaleY: 0.5 },
  { id: 'splitRight', labelKey: 'pip.splitRight', positionX: 0.75, positionY: 0.5, scaleX: 0.5, scaleY: 0.5 },
];
