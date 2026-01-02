export type Unit = 'm' | 'cm' | 'ft' | 'in' | 'mm';

export interface Dimensions {
  length: number;
  width: number;
  height: number;
}

export interface PackageType {
  id: string;
  name: string;
  dimensions: Dimensions;
  quantity?: number; // 0 or undefined means "Infinite/Fill"
  color: string;
  keepUpright?: boolean; // <--- NEW FIELD
}

export interface Container {
  length: number;
  width: number;
  height: number;
}

export interface PackingInput {
  container: Container;
  packages: PackageType[];
}

export interface PlacedItem {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  length: number;
  packageId: string;
  color: string;
  label: string;
}

export interface PackingResult {
  containerDimensions: Container;
  placedItems: PlacedItem[];
  unplacedItems: PackageType[]; 
  volumeUtilization: number;
  totalItemsPacked: number;
  layers: number[];
}