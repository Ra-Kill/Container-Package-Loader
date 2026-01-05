// src/services/packingService.ts
import { PackingInput, PackingResult } from '../types';

export const calculatePacking = async (
    input: PackingInput, 
    onProgress?: (msg: string) => void
): Promise<PackingResult> => {
    
    // Safety Cap: Use hardware concurrency but limit to 4 to prevent overheating
    const maxWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2;
    const workers: Worker[] = [];
    
    const GENERATIONS_PER_WORKER = 8; 

    return new Promise((resolve, reject) => {
        let completedWorkers = 0;
        const results: PackingResult[] = [];
        const progressMap = new Array(maxWorkers).fill(0);

        for (let i = 0; i < maxWorkers; i++) {
            // VITE SPECIFIC SYNTAX FOR WORKERS
            const worker = new Worker(new URL('./packing.worker.ts', import.meta.url), { type: 'module' });
            workers.push(worker);

            worker.onmessage = (e) => {
                const { type, result, gen, totalGenerations, strategyId } = e.data;

                if (type === 'progress') {
                    progressMap[strategyId] = (gen / totalGenerations) * 100;
                    const avgProgress = Math.round(progressMap.reduce((a, b) => a + b, 0) / maxWorkers);
                    if (onProgress) onProgress(`Optimizing on ${maxWorkers} Cores... ${avgProgress}%`);
                }

                if (type === 'done') {
                    results.push(result);
                    worker.terminate();
                    completedWorkers++;

                    if (completedWorkers === maxWorkers) {
                        // All workers done. Pick the best result.
                        results.sort((a, b) => b.volumeUtilization - a.volumeUtilization);
                        const bestResult = results[0];

                        // Final cleanup: Calculate layers for the visualizer
                        const uniqueZ = new Set<number>();
                        uniqueZ.add(0);
                        bestResult.placedItems.forEach(item => uniqueZ.add(parseFloat(item.z.toFixed(1))));
                        bestResult.layers = Array.from(uniqueZ).sort((a, b) => a - b);

                        resolve(bestResult);
                    }
                }
            };

            worker.onerror = (err) => {
                console.error("Worker Error:", err);
                worker.terminate();
                reject(err);
            };

            // Start the job
            worker.postMessage({ 
                input, 
                strategyId: i,
                totalGenerations: GENERATIONS_PER_WORKER 
            });
        }
    });
};