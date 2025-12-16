import { Dimensions, PackageType, PackingInput, PackingResult, PlacedItem, Unit } from '../types';

export const calculatePacking = (input: PackingInput): PackingResult => {
  const container = input.container;
  
  // 1. Identify mode: Finite vs Infinite
  // If ANY package has no quantity (or 0), we treat it as a "Fill" run for those items.
  // We will prioritize items based on volume.
  
  const placedItems: PlacedItem[] = [];
  const itemsMap = new Map<string, PackageType>();
  input.packages.forEach(p => itemsMap.set(p.id, p));

  // Determine if we are in "Fill" mode or "List" mode
  // We'll separate items into "Finite Supply" and "Infinite Supply"
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

  // Coordinate system: 
  // x: Width (0 to container.width)
  // y: Height (0 to container.height)
  // z: Length/Depth (0 to container.length) - Pack from Back (0) to Front (Length)
  
  let anchors: {x: number, y: number, z: number}[] = [{ x: 0, y: 0, z: 0 }];
  
  // Safety break for infinite loops
  const MAX_ITEMS = 5000; 
  let iterations = 0;

  // Function to try placing an item at an anchor
  const tryPlaceItem = (anchor: {x: number, y: number, z: number}, type: PackageType): PlacedItem | null => {
    const { length: L, width: W, height: H } = type.dimensions;
    
    // We try all 6 permutations of (L, W, H) mapping to axes (z=depth, x=width, y=height)
    // 1. Standard (L=z, W=x, H=y)
    // 2. Standard Rotated (W=z, L=x, H=y)
    // 3. On Side (L=z, H=x, W=y)
    // 4. On Side Rotated (W=z, H=x, L=y) -> Wait, if W is depth, H is width, L is height
    // 5. Upright (H=z, W=x, L=y)
    // 6. Upright Rotated (H=z, L=x, W=y)

    // Define the 6 dimensions as { l: depth, w: width, h: height }
    const orientations = [
        { l: L, w: W, h: H }, // Standard
        { l: W, w: L, h: H }, // Flat Rotated
        { l: L, w: H, h: W }, // On Side
        { l: W, w: H, h: L }, // On Side Rotated
        { l: H, w: W, h: L }, // Upright
        { l: H, w: L, h: W }, // Upright Rotated
    ];

    // Filter duplicates to save cycles? 
    // For packing logic, it's cheap to just run them.

    for (const orient of orientations) {
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
    // Actually, we want to fill the back wall first. So smallest Z is priority #1.
    anchors.sort((a, b) => {
        if (Math.abs(a.z - b.z) > 0.1) return a.z - b.z; 
        if (Math.abs(a.y - b.y) > 0.1) return a.y - b.y;
        return a.x - b.x;
    });

    const currentAnchor = anchors[0];
    let placed: PlacedItem | null = null;
    let usedFiniteIndex = -1;

    // 1. Try to fit remaining Finite items (biggest first)
    for (let i = 0; i < finiteItems.length; i++) {
        placed = tryPlaceItem(currentAnchor, finiteItems[i].type);
        if (placed) {
            usedFiniteIndex = i;
            break;
        }
    }

    // 2. If no finite item fits (or none left), try Infinite items (biggest first)
    if (!placed && infiniteTypes.length > 0) {
        for (const type of infiniteTypes) {
            placed = tryPlaceItem(currentAnchor, type);
            if (placed) break;
        }
    }

    if (placed) {
        // Confirm placement
        placedItems.push(placed);
        if (usedFiniteIndex !== -1) {
            finiteItems.splice(usedFiniteIndex, 1);
        }

        // Remove used anchor
        anchors.shift();

        // Add new candidate anchors derived from this placement
        // 1. Top of box
        anchors.push({ x: placed.x, y: placed.y + placed.height, z: placed.z });
        // 2. Right of box
        anchors.push({ x: placed.x + placed.width, y: placed.y, z: placed.z });
        // 3. Front of box
        anchors.push({ x: placed.x, y: placed.y, z: placed.z + placed.length });

        // Optimization: Filter invalid or contained anchors immediately to keep array small? 
        // For simplicity in this heuristic, we let the loop handle skips.
    } else {
        // Nothing fits at this anchor at all. Discard it.
        anchors.shift();
    }
  }

  // Calculate Volume Stats
  const totalVol = container.length * container.width * container.height;
  const usedVol = placedItems.reduce((acc, item) => acc + (item.width * item.height * item.length), 0);

  // Identify Layers (Unique Z coordinates)
  // Round to 1 decimal place to group micro-steps (e.g. 40.0 vs 40.00001)
  const uniqueZ = Array.from(new Set(placedItems.map(p => parseFloat(p.z.toFixed(1))))).sort((a, b) => a - b);

  return {
    containerDimensions: container,
    placedItems,
    unplacedItems: [], // Simplification: we don't track unplaced finite items in this heuristic strictly
    volumeUtilization: totalVol > 0 ? (usedVol / totalVol) * 100 : 0,
    totalItemsPacked: placedItems.length,
    layers: uniqueZ
  };
};