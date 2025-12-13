export type Unit = 'm' | 'cm' | 'mm' | 'in' | 'ft';

export interface Dimensions {
  length: number; // Depth
  width: number;  // Side-to-side
  height: number; // Vertical
}

export interface PackageType {
  id: string;
  name: string;
  dimensions: Dimensions;
  quantity?: number; // Optional. If undefined/0, assume infinite/fill mode.
  color: string;
}

export interface PlacedItem {
  x: number;
  y: number;
  z: number;
  width: number;  // dimension along x
  height: number; // dimension along y
  length: number; // dimension along z
  packageId: string;
  color: string;
  label: string;
}

export interface PackingResult {
  containerDimensions: Dimensions;
  placedItems: PlacedItem[];
  unplacedItems: PackageType[];
  volumeUtilization: number;
  totalItemsPacked: number;
  layers: number[]; // Unique Z coordinates
}

export interface PackingInput {
  container: Dimensions;
  packages: PackageType[];
}
