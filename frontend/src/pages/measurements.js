export function calculateAreaPerPiece({ width, height, unit, moldEnabled, moldFactor }) {
  const unitInMeters = unit === 'cm' ? 0.01 : 1;
  const factor = moldEnabled ? moldFactor : 1;
  return width * unitInMeters * height * unitInMeters * factor;
}
