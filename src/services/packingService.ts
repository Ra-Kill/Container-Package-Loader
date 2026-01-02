import { Dimensions, PackageType, PackingInput, PackingResult, PlacedItem, Unit } from '../types';

export const calculatePacking = (input: PackingInput): PackingResult => {
  const container = input.container;
  
  const placedItems: PlacedItem[] = [];
  const itemsMap = new Map<string, PackageType>();
  input.packages.forEach(p => itemsMap.set(p.id, p));

  // Determine if we are in "Fill" mode or "List" mode
  let infiniteTypes: PackageType[] = [];
  let finiteItems: { type: PackageType, id: string, vol: number }[] = [];

  input.packages.forEach(pkg => {
    if (!pkg.quantity || pkg.quantity === 0) {
      infiniteTypes.push(pkg);
    } else {
      for (let i = 0; i < pkg.quantity; i++) {
        finiteItems.push({
          type: pkg,
          id: `${pkg.id}-${i}`,
          vol: pkg.dimensions.length * pkg.dimensions.width * pkg.dimensions.height
        });
      }
    }
  });

  // Sort by volume descending
  infiniteTypes.sort((a, b) => 
    (b.dimensions.length * b.dimensions.width * b.dimensions.height) - 
    (a.dimensions.length * a.dimensions.width * a.dimensions.height)
  );
  finiteItems.sort((a, b) => b.vol - a.vol);

  // Coordinate system: x=Width, y=Height, z=Depth
  let anchors: {x: number, y: number, z: number}[] = [{ x: 0, y: 0, z: 0 }];
  
  const MAX_ITEMS = 5000; 
  let iterations = 0;

  const tryPlaceItem = (anchor: {x: number, y: number, z: number}, type: PackageType): PlacedItem | null => {
    const { length: L, width: W, height: H } = type.dimensions;
    
    // All 6 permutations of (L, W, H) mapping to (depth, width, height)
    // l = dimension along Z (depth)
    // w = dimension along X (width)
    // h = dimension along Y (height)
    const allOrientations = [
        { l: L, w: W, h: H }, // Standard
        { l: W, w: L, h: H }, // Flat Rotated
        { l: L, w: H, h: W }, // On Side
        { l: W, w: H, h: L }, // On Side Rotated
        { l: H, w: W, h: L }, // Upright
        { l: H, w: L, h: W }, // Upright Rotated
    ];

    // --- CONSTRAINT LOGIC ---
    // If keepUpright is true, we ONLY allow orientations where the resulting height (h) 
    // matches the package's original height (H).
    // Note: We use a small epsilon for float comparison safety, though normally dims are ints.
    const allowedOrientations = type.keepUpright 
        ? allOrientations.filter(o => Math.abs(o.h - H) < 0.1) 
        : allOrientations;

    for (const orient of allowedOrientations) {
         // Bounds check
         if (anchor.x + orient.w > container.width) continue;
         if (anchor.y + orient.h > container.height) continue;
         if (anchor.z + orient.l > container.length) continue;

         // Collision check
         let overlap = false;
         for (const p of placedItems) {
            if (
                anchor.x < p.x + p.width && anchor.x + orient.w > p.x &&
                anchor.y < p.y + p.height && anchor.y + orient.h > p.y &&
                anchor.z < p.z + p.length && anchor.z + orient.l > p.z
            ) {
                overlap = true;
                break;
            }
         }

         if (!overlap) {
             return {
                 x: anchor.x,
                 y: anchor.y,
                 z: anchor.z,
                 width: orient.w,
                 height: orient.h,
                 length: orient.l,
                 packageId: type.id,
                 color: type.color,
                 label: type.name
             };
         }
    }
    return null;
  };

  // Main Packing Loop
  while (anchors.length > 0 && iterations < MAX_ITEMS) {
    iterations++;
    
    // Sort anchors: Deepest (smallest Z) -> Lowest (smallest Y) -> Leftmost (smallest X)
    anchors.sort((a, b) => {
        if (Math.abs(a.z - b.z) > 0.1) return a.z - b.z; 
        if (Math.abs(a.y - b.y) > 0.1) return a.y - b.y;
        return a.x - b.x;
    });

    const currentAnchor = anchors[0];
    let placed: PlacedItem | null = null;
    let usedFiniteIndex = -1;

    // 1. Try to fit remaining Finite items
    for (let i = 0; i < finiteItems.length; i++) {
        placed = tryPlaceItem(currentAnchor, finiteItems[i].type);
        if (placed) {
            usedFiniteIndex = i;
            break;
        }
    }

    // 2. If no finite item fits, try Infinite items
    if (!placed && infiniteTypes.length > 0) {
        for (const type of infiniteTypes) {
            placed = tryPlaceItem(currentAnchor, type);
            if (placed) break;
        }
    }

    if (placed) {
        placedItems.push(placed);
        if (usedFiniteIndex !== -1) {
            finiteItems.splice(usedFiniteIndex, 1);
        }

        // Remove used anchor
        anchors.shift();

        // Add new candidate anchors
        anchors.push({ x: placed.x, y: placed.y + placed.height, z: placed.z }); // Top
        anchors.push({ x: placed.x + placed.width, y: placed.y, z: placed.z }); // Right
        anchors.push({ x: placed.x, y: placed.y, z: placed.z + placed.length }); // Front
    } else {
        anchors.shift();
    }
  }

  const totalVol = container.length * container.width * container.height;
  const usedVol = placedItems.reduce((acc, item) => acc + (item.width * item.height * item.length), 0);
  const uniqueZ = Array.from(new Set(placedItems.map(p => parseFloat(p.z.toFixed(1))))).sort((a, b) => a - b);

  return {
    containerDimensions: container,
    placedItems,
    unplacedItems: [],
    volumeUtilization: totalVol > 0 ? (usedVol / totalVol) * 100 : 0,
    totalItemsPacked: placedItems.length,
    layers: uniqueZ
  };
};