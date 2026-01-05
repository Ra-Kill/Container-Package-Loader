import { PackageType, PlacedItem, Dimensions } from '../types';

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

// --- OPTIMIZED SIMULATION ENGINE (The "Meta" Optimization) ---
const runSimulation = (container: any, itemsToPack: ItemToPack[]): PlacedItem[] => {
    const placedItems: PlacedItem[] = [];
    let anchors: Anchor[] = [{ x: 0, y: 0, z: 0 }];
    
    // Limits
    const searchDepth = itemsToPack.length > 1000 ? 200 : itemsToPack.length;
    const maxIterations = 50000; 
    
    let safetyCounter = 0;
    const queue = [...itemsToPack];

    while (anchors.length > 0 && queue.length > 0 && safetyCounter < maxIterations) {
        safetyCounter++;
        
        // Sort Anchors: Back -> Bottom -> Left
        anchors.sort((a, b) => {
            if (Math.abs(a.z - b.z) > 0.1) return a.z - b.z;
            if (Math.abs(a.y - b.y) > 0.1) return a.y - b.y;
            return a.x - b.x;
        });

        const currentAnchor = anchors[0];
        let bestItemIndex = -1;
        let bestOrientation: Dimensions | null = null;

        // Only search top N candidates
        const limit = Math.min(queue.length, searchDepth);

        for (let i = 0; i < limit; i++) {
            const item = queue[i];
            const orientations = getOrientations(item.type);
            
            for (const orient of orientations) {
                // 1. Boundary Check (Instant)
                if (currentAnchor.x + orient.width > container.width) continue;
                if (currentAnchor.y + orient.height > container.height) continue;
                if (currentAnchor.z + orient.length > container.length) continue;

                // 2. Optimized "Fast Rejection" Collision Check
                // Pre-calculate candidate bounds to avoid repeating math in loop
                const itemZ = currentAnchor.z;
                const itemFront = itemZ + orient.length;
                const itemY = currentAnchor.y;
                const itemTop = itemY + orient.height;
                const itemX = currentAnchor.x;
                const itemRight = itemX + orient.width;

                let intersects = false;
                
                // Use standard for-loop for max V8 optimization (faster than for..of)
                for (let k = 0; k < placedItems.length; k++) {
                    const p = placedItems[k];

                    // Z-AXIS CHECK (Most likely to fail in sorted packing, so check first!)
                    if (p.z + p.length <= itemZ) continue; // Placed item is behind
                    if (p.z >= itemFront) continue;        // Placed item is in front

                    // Y-AXIS CHECK
                    if (p.y + p.height <= itemY) continue; // Placed item is below
                    if (p.y >= itemTop) continue;          // Placed item is above

                    // X-AXIS CHECK
                    if (p.x + p.width <= itemX) continue;  // Placed item is left
                    if (p.x >= itemRight) continue;        // Placed item is right

                    // If we get here, it's a collision.
                    intersects = true;
                    break;
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
            
            // New Anchors
            anchors.push({ x: currentAnchor.x, y: currentAnchor.y + bestOrientation.height, z: currentAnchor.z });
            anchors.push({ x: currentAnchor.x + bestOrientation.width, y: currentAnchor.y, z: currentAnchor.z });
            anchors.push({ x: currentAnchor.x, y: currentAnchor.y, z: currentAnchor.z + bestOrientation.length });
        } else {
            anchors.shift();
        }
    }
    return placedItems;
};

// --- MESSAGE HANDLER ---
self.onmessage = async (e: MessageEvent) => {
    const { input, strategyId, totalGenerations } = e.data;
    const container = input.container;
    
    // 1. EXPAND INPUT
    let originalAllItems: ItemToPack[] = [];
    input.packages.forEach((pkg: PackageType) => {
        const count = (!pkg.quantity || pkg.quantity === 0) ? 1000 : pkg.quantity; 
        const vol = pkg.dimensions.length * pkg.dimensions.width * pkg.dimensions.height;
        for (let i = 0; i < count; i++) {
            originalAllItems.push({ type: pkg, id: `${pkg.id}-${i}`, vol });
        }
    });

    let simulationItems = [...originalAllItems];
    if (simulationItems.length > 5000) simulationItems = simulationItems.slice(0, 5000);

    // 2. CONFIGURE GENERATIONS based on load
    const isHeavyLoad = simulationItems.length > 1000;
    const POPULATION_SIZE = isHeavyLoad ? 4 : 10; 
    
    let population: ItemToPack[][] = [];
    
    if (strategyId === 0) {
        population.push([...simulationItems].sort((a, b) => b.vol - a.vol));
    } else if (strategyId === 1) {
        population.push([...simulationItems].sort((a, b) => { 
            const maxA = Math.max(a.type.dimensions.length, a.type.dimensions.width);
            const maxB = Math.max(b.type.dimensions.length, b.type.dimensions.width);
            return maxB - maxA;
        }));
    } else {
        population.push(shuffle([...simulationItems]));
    }

    while (population.length < POPULATION_SIZE) {
        population.push(shuffle([...simulationItems]));
    }

    let bestResult: PlacedItem[] = [];
    let maxVolumeFound = -1;

    // 3. RUN EVOLUTION
    for (let gen = 0; gen < totalGenerations; gen++) {
        self.postMessage({ type: 'progress', gen, totalGenerations, strategyId });
        await new Promise(r => setTimeout(r, 0));

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

        const survivorsCount = isHeavyLoad ? 2 : 4;
        const survivors = results.slice(0, survivorsCount).map(r => r.dna);
        const nextGen = [...survivors];

        while (nextGen.length < POPULATION_SIZE) {
            const p1 = survivors[Math.floor(Math.random() * survivors.length)];
            const p2 = survivors[Math.floor(Math.random() * survivors.length)];
            let child = breed(p1, p2);
            if (Math.random() < 0.2) child = mutate(child);
            nextGen.push(child);
        }
        population = nextGen;
    }

    // 4. FINAL REPORTING
    const placedIds = new Set(bestResult.map(p => p.packageId));
    const unplacedMap = new Map<string, PackageType>();

    originalAllItems.forEach(item => {
        if (!placedIds.has(item.id)) {
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
    
    self.postMessage({
        type: 'done',
        result: {
            containerDimensions: container,
            placedItems: bestResult,
            unplacedItems: unplacedItems,
            volumeUtilization: containerVol > 0 ? (maxVolumeFound / containerVol) * 100 : 0,
            totalItemsPacked: bestResult.length,
            layers: [] 
        }
    });
};