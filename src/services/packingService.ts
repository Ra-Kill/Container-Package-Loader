import { PackageType, PackingInput, PackingResult, PlacedItem, Dimensions } from '../types';

// --- TYPES ---
interface ItemToPack {
  type: PackageType;
  id: string;
  vol: number;
}

interface Anchor {
  x: number;
  y: number;
  z: number;
}

// --- HELPER FUNCTIONS ---

const shuffle = <T>(array: T[]): T[] => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const mutate = (dna: ItemToPack[]): ItemToPack[] => {
    const newDna = [...dna];
    if (newDna.length < 2) return newDna;
    const a = Math.floor(Math.random() * newDna.length);
    const b = Math.floor(Math.random() * newDna.length);
    [newDna[a], newDna[b]] = [newDna[b], newDna[a]];
    return newDna;
};

const breed = (parent1: ItemToPack[], parent2: ItemToPack[]): ItemToPack[] => {
    const cut = Math.floor(parent1.length / 2);
    const child = parent1.slice(0, cut);
    const existingIds = new Set(child.map(i => i.id));
    for (const gene of parent2) {
        if (!existingIds.has(gene.id)) {
            child.push(gene);
        }
    }
    return child;
};

const getOrientations = (pkg: PackageType): Dimensions[] => {
    const { length: l, width: w, height: h } = pkg.dimensions;
    const all = [
        { length: l, width: w, height: h },
        { length: w, width: l, height: h },
        { length: l, width: h, height: w },
        { length: h, width: l, height: w },
        { length: w, width: h, height: l },
        { length: h, width: w, height: l },
    ];
    let allowed = pkg.keepUpright 
        ? all.filter(o => Math.abs(o.height - h) < 0.1) 
        : all;
    
    const unique: Dimensions[] = [];
    const seen = new Set<string>();
    allowed.forEach(opt => {
        const key = `${opt.length}-${opt.width}-${opt.height}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(opt);
        }
    });
    return unique;
};

// --- CORE SIMULATION ENGINE ---
const runSimulation = (container: any, itemsToPack: ItemToPack[]): PlacedItem[] => {
    const placedItems: PlacedItem[] = [];
    let anchors: Anchor[] = [{ x: 0, y: 0, z: 0 }];
    let safetyCounter = 0;
    const queue = [...itemsToPack];

    while (anchors.length > 0 && queue.length > 0 && safetyCounter < 5000) {
        safetyCounter++;
        anchors.sort((a, b) => {
            if (Math.abs(a.z - b.z) > 0.1) return a.z - b.z;
            if (Math.abs(a.y - b.y) > 0.1) return a.y - b.y;
            return a.x - b.x;
        });

        const currentAnchor = anchors[0];
        let bestItemIndex = -1;
        let bestOrientation: Dimensions | null = null;

        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            const orientations = getOrientations(item.type);
            for (const orient of orientations) {
                if (currentAnchor.x + orient.width > container.width) continue;
                if (currentAnchor.y + orient.height > container.height) continue;
                if (currentAnchor.z + orient.length > container.length) continue;

                let intersects = false;
                for (const p of placedItems) {
                    if (
                        currentAnchor.x < p.x + p.width && currentAnchor.x + orient.width > p.x &&
                        currentAnchor.y < p.y + p.height && currentAnchor.y + orient.height > p.y &&
                        currentAnchor.z < p.z + p.length && currentAnchor.z + orient.length > p.z
                    ) {
                        intersects = true;
                        break;
                    }
                }
                if (!intersects) {
                    bestItemIndex = i;
                    bestOrientation = orient;
                    break; 
                }
            }
            if (bestItemIndex !== -1) break; 
        }

        if (bestItemIndex !== -1 && bestOrientation) {
            const itemToPlace = queue[bestItemIndex];
            placedItems.push({
                x: currentAnchor.x,
                y: currentAnchor.y,
                z: currentAnchor.z,
                width: bestOrientation.width,
                height: bestOrientation.height,
                length: bestOrientation.length,
                packageId: itemToPlace.id,
                color: itemToPlace.type.color,
                label: itemToPlace.type.name
            });
            queue.splice(bestItemIndex, 1);
            anchors.shift();
            anchors.push({ x: currentAnchor.x, y: currentAnchor.y + bestOrientation.height, z: currentAnchor.z });
            anchors.push({ x: currentAnchor.x + bestOrientation.width, y: currentAnchor.y, z: currentAnchor.z });
            anchors.push({ x: currentAnchor.x, y: currentAnchor.y, z: currentAnchor.z + bestOrientation.length });
        } else {
            anchors.shift();
        }
    }
    return placedItems;
};

// --- MAIN SERVICE EXPORT ---
export const calculatePacking = async (
    input: PackingInput, 
    onProgress?: (msg: string) => void
): Promise<PackingResult> => {
    
  const container = input.container;
  let allItems: ItemToPack[] = [];

  // Expand input
  input.packages.forEach(pkg => {
    const count = (!pkg.quantity || pkg.quantity === 0) ? 100 : pkg.quantity; 
    const vol = pkg.dimensions.length * pkg.dimensions.width * pkg.dimensions.height;
    for (let i = 0; i < count; i++) {
      allItems.push({ type: pkg, id: `${pkg.id}-${i}`, vol });
    }
  });

  if (allItems.length > 600) allItems = allItems.slice(0, 600);

  const POPULATION_SIZE = 12; 
  const GENERATIONS = 8;     
  const SURVIVORS = 4;        

  let population: ItemToPack[][] = [];
  
  // Seed Population
  population.push([...allItems].sort((a, b) => b.vol - a.vol));
  population.push([...allItems].sort((a, b) => {
      const maxA = Math.max(a.type.dimensions.length, a.type.dimensions.width);
      const maxB = Math.max(b.type.dimensions.length, b.type.dimensions.width);
      return maxB - maxA;
  }));
  while (population.length < POPULATION_SIZE) {
      population.push(shuffle(allItems));
  }

  let bestResult: PlacedItem[] = [];
  let maxVolumeFound = -1;

  for (let gen = 0; gen < GENERATIONS; gen++) {
      if (onProgress) onProgress(`Running Simulation... Generation ${gen + 1}/${GENERATIONS}`);
      await new Promise(resolve => setTimeout(resolve, 0));

      const results = population.map(dna => {
          const placed = runSimulation(container, dna);
          const vol = placed.reduce((acc, i) => acc + (i.width * i.height * i.length), 0);
          return { dna, placed, vol };
      });

      results.sort((a, b) => b.vol - a.vol);

      if (results[0].vol > maxVolumeFound) {
          maxVolumeFound = results[0].vol;
          bestResult = results[0].placed;
      }

      const survivors = results.slice(0, SURVIVORS).map(r => r.dna);
      const nextGen = [...survivors];

      while (nextGen.length < POPULATION_SIZE) {
          const p1 = survivors[Math.floor(Math.random() * survivors.length)];
          const p2 = survivors[Math.floor(Math.random() * survivors.length)];
          let child = breed(p1, p2);
          if (Math.random() < 0.15) child = mutate(child);
          nextGen.push(child);
      }
      population = nextGen;
  }

  // --- CALCULATE UNPLACED ITEMS (Shortfall) ---
  const placedIds = new Set(bestResult.map(p => p.packageId));
  const unplacedMap = new Map<string, PackageType>();

  allItems.forEach(item => {
      if (!placedIds.has(item.id)) {
          // This specific item ID was not packed
          // We group unplaced items by their original PackageType ID to get a count
          const originalId = item.type.id;
          const current = unplacedMap.get(originalId);
          if (current) {
              unplacedMap.set(originalId, { ...current, quantity: (current.quantity || 0) + 1 });
          } else {
              unplacedMap.set(originalId, { ...item.type, quantity: 1 });
          }
      }
  });

  const unplacedItems = Array.from(unplacedMap.values());

  const containerVol = container.length * container.width * container.height;
  const uniqueZ = new Set<number>();
  uniqueZ.add(0);
  bestResult.forEach(item => uniqueZ.add(parseFloat(item.z.toFixed(1))));
  const sortedLayers = Array.from(uniqueZ).sort((a, b) => a - b);

  return {
    containerDimensions: container,
    placedItems: bestResult,
    unplacedItems: unplacedItems, // Now accurately populated
    volumeUtilization: containerVol > 0 ? (maxVolumeFound / containerVol) * 100 : 0,
    totalItemsPacked: bestResult.length,
    layers: sortedLayers
  };
};