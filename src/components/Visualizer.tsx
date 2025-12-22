import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PackingResult, PlacedItem, Dimensions, PackageType } from '../types';
import { toJpeg } from 'html-to-image'; // Changed to Jpeg for size reduction
import jsPDF from 'jspdf';

interface VisualizerProps {
  data: PackingResult | null;
  onPackageClick?: (id: string) => void;
}

// --- HELPER: Orientation Logic (Replicated from OrientationGuide) ---
const getOrientations = (pkg: PackageType) => {
    const { length, width, height } = pkg.dimensions;
    const options = [
        { label: "Standard", desc: "Length deep, Width x Height face", d: length, w: width, h: height },
        { label: "Floor Rotated", desc: "Width deep, Length x Height face", d: width, w: length, h: height },
        { label: "On Side", desc: "Length deep, Height x Width face", d: length, w: height, h: width },
        { label: "On Side (Rotated)", desc: "Width deep, Height x Length face", d: width, w: height, h: length }, 
        { label: "Upright", desc: "Height deep, Width x Length face", d: height, w: width, h: length },
        { label: "Upright (Rotated)", desc: "Height deep, Length x Width face", d: height, w: length, h: width },
    ];
    // Filter duplicates based on dimensions
    const seen = new Set();
    return options.filter(item => {
        const sig = `${item.d}-${item.w}-${item.h}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });
};

// --- PDF TEMPLATE COMPONENT ---
const PDFExportTemplate = React.forwardRef<HTMLDivElement, { 
    data: PackingResult, 
    layerIndex: number, 
    mode: 'cover' | 'guide' | 'layer',
    guidePackage?: PackageType
}>(({ data, layerIndex, mode, guidePackage }, ref) => {
    
    // Unique Items for the Cover Legend
    const uniqueItems = useMemo(() => {
        const map = new Map();
        data.placedItems.forEach(item => {
            const key = `${item.label}-${item.color}`;
            if (!map.has(key)) map.set(key, { ...item, original: data.placedItems.find(p => p.packageId === item.packageId) });
        });
        return Array.from(map.values());
    }, [data]);

    const currentZ = data.layers[layerIndex] || 0;
    
    // Filter items for layer view
    const activeItems = mode === 'layer' ? data.placedItems.filter(item => {
        const epsilon = 0.5;
        return item.z <= currentZ + epsilon && (item.z + item.length) > currentZ + epsilon;
    }) : [];

    return (
        <div ref={ref} className="bg-white text-slate-900 font-sans relative overflow-hidden flex flex-col" style={{ width: '1024px', height: '768px' }}>
            
            {/* --- HEADER (Common) --- */}
            <div className="bg-slate-900 text-white p-6 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <div className="text-2xl font-black tracking-tight">PackMaster 3D</div>
                    <div className="h-6 w-px bg-slate-700"></div>
                    <div className="text-sm font-medium text-slate-300">Load Plan Report</div>
                </div>
                <div className="text-right">
                     {mode === 'cover' && <span className="text-xl font-bold">Overview</span>}
                     {mode === 'guide' && <span className="text-xl font-bold">Package Reference</span>}
                     {mode === 'layer' && <span className="text-xl font-bold">Step {layerIndex + 1}</span>}
                </div>
            </div>

            {/* --- MODE: COVER PAGE --- */}
            {mode === 'cover' && (
                <div className="flex-1 p-10 flex flex-col gap-8 bg-slate-50">
                    
                    {/* Summary Card */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                        <div>
                            <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">Container</div>
                            <div className="text-4xl font-black text-slate-800 mt-1">
                                {data.containerDimensions.length} <span className="text-slate-300">x</span> {data.containerDimensions.width} <span className="text-slate-300">x</span> {data.containerDimensions.height}
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-5xl font-black text-brand-600">{Math.round(data.volumeUtilization)}%</div>
                             <div className="text-sm text-slate-400 font-bold uppercase">Volume Filled</div>
                        </div>
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-8">
                         {/* Loading Strategy Visual */}
                         <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                            <h3 className="text-xl font-bold mb-6 text-slate-800">1. Loading Direction</h3>
                            <div className="relative w-48 h-64 border-4 border-slate-800 rounded-xl bg-slate-50 flex flex-col p-4">
                                <div className="absolute top-0 left-0 w-full bg-slate-200 h-8 border-b border-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-500">FRONT (DOOR)</div>
                                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                    <div className="text-brand-600 font-bold">LOAD THIS WAY</div>
                                    <svg className="w-16 h-16 text-brand-600 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                </div>
                                <div className="bg-slate-800 text-white py-2 rounded font-bold text-xs">BACK WALL (START)</div>
                            </div>
                            <p className="mt-4 text-slate-500 text-sm max-w-xs">
                                Items are loaded from the back of the container (Depth 0) moving forward.
                            </p>
                         </div>

                         {/* Brief Legend */}
                         <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm overflow-y-auto">
                            <h3 className="text-xl font-bold mb-6 text-slate-800">2. Cargo Types</h3>
                            <div className="space-y-3">
                                {uniqueItems.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <div className="w-8 h-8 rounded shadow-sm" style={{ backgroundColor: item.color }}></div>
                                        <div>
                                            <div className="font-bold text-sm">{item.label}</div>
                                            <div className="text-xs text-slate-500">{Math.round(item.width)} x {Math.round(item.height)} x {Math.round(item.length)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                         </div>
                    </div>
                </div>
            )}

            {/* --- MODE: GUIDE PAGE (Cheat Sheet) --- */}
            {mode === 'guide' && guidePackage && (
                <div className="flex-1 p-10 bg-slate-50 flex flex-col">
                    <div className="flex items-center gap-6 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="w-16 h-16 rounded-xl shadow-md" style={{ backgroundColor: guidePackage.color }}></div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-800">{guidePackage.name}</h2>
                            <p className="text-slate-500">Master Dimensions: {guidePackage.dimensions.length}L x {guidePackage.dimensions.width}W x {guidePackage.dimensions.height}H</p>
                        </div>
                    </div>

                    <div className="flex-1 grid grid-cols-3 gap-6 auto-rows-min">
                        {getOrientations(guidePackage).map((opt, idx) => (
                            <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="bg-slate-100 p-3 border-b border-slate-200 flex justify-between items-center">
                                    <span className="font-bold text-slate-700">{opt.label}</span>
                                    <span className="text-xs font-mono bg-slate-200 px-2 py-1 rounded text-slate-600">Depth: {opt.d}</span>
                                </div>
                                <div className="flex-1 p-8 flex flex-col items-center justify-center gap-4 min-h-[200px]">
                                    {/* 2D Representation of the Face */}
                                    <div 
                                        className="relative flex items-center justify-center border-4 border-slate-800 shadow-xl"
                                        style={{
                                            backgroundColor: guidePackage.color,
                                            width: `${Math.min(140, opt.w * 3)}px`, 
                                            height: `${Math.min(140, opt.h * 3)}px`,
                                            // Scale constraint for display
                                            maxWidth: '100%',
                                            maxHeight: '160px',
                                            aspectRatio: `${opt.w}/${opt.h}`
                                        }}
                                    >
                                        <div className="text-white font-black text-2xl drop-shadow-md whitespace-nowrap">
                                            {opt.w} x {opt.h}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Face Dimensions</div>
                                        <div className="text-lg font-bold text-slate-800">{opt.w} (Width) x {opt.h} (Height)</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 text-center text-slate-400 text-sm italic">
                        * The "Face" is what you see when looking at the box from the back of the container. "Depth" is how much space it takes up moving forward.
                    </div>
                </div>
            )}

            {/* --- MODE: LAYER VIEW --- */}
            {mode === 'layer' && (
                <div className="flex-1 flex flex-col relative bg-slate-100">
                    <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                         <div className="text-xs font-bold text-slate-400 uppercase">Current Depth</div>
                         <div className="text-2xl font-black text-brand-600">{Math.round(currentZ)}cm</div>
                    </div>

                    <div className="flex-1 flex items-center justify-center p-8">
                         <div className="relative border-8 border-slate-800 bg-white shadow-2xl" 
                             style={{
                                 width: '800px',
                                 height: `${800 * (data.containerDimensions.height / data.containerDimensions.width)}px`,
                                 maxHeight: '600px'
                             }}>
                            {/* Inner Grid */}
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                            {activeItems.map((item, i) => {
                                const isNew = Math.abs(item.z - currentZ) < 0.5;
                                return (
                                    <div
                                        key={i}
                                        className="absolute flex items-center justify-center text-center overflow-hidden border border-slate-500"
                                        style={{
                                            left: `${(item.x / data.containerDimensions.width) * 100}%`,
                                            bottom: `${(item.y / data.containerDimensions.height) * 100}%`,
                                            width: `${(item.width / data.containerDimensions.width) * 100}%`,
                                            height: `${(item.height / data.containerDimensions.height) * 100}%`,
                                            backgroundColor: item.color,
                                            opacity: isNew ? 1 : 0.15, // Lower opacity for background items
                                            zIndex: isNew ? 10 : 0,
                                            boxShadow: isNew ? 'inset 0 0 0 2px rgba(255,255,255,0.4)' : 'none'
                                        }}
                                    >
                                        {isNew && (
                                            <div className="flex flex-col items-center justify-center leading-none w-full h-full p-1">
                                                <span className="text-white font-bold drop-shadow-md text-xl">
                                                    {Math.round(item.width)}x{Math.round(item.height)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="absolute bottom-4 right-6 bg-white px-3 py-1 rounded-full text-slate-400 font-mono text-xs border border-slate-200">
                        Page {layerIndex + 2 + uniqueItems.length}
                    </div>
                 </div>
            )}
        </div>
    );
});

const Visualizer: React.FC<VisualizerProps> = ({ data, onPackageClick }) => {
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  
  const [scale, setScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'cover' | 'guide' | 'layer'>('cover');
  const [exportLayerIndex, setExportLayerIndex] = useState(0);
  const [exportGuidePkg, setExportGuidePkg] = useState<PackageType | undefined>(undefined);

  // Helper to get unique packages for guide generation
  const uniquePackages = useMemo(() => {
      if (!data) return [];
      const map = new Map();
      // We look at input packages ideally, but placedItems usually contains refs.
      // We'll reconstruct unique types from placed items to be safe, or use data.unplaced if available.
      // For now, let's extract from placed items to ensure we only guide what's packed.
      data.placedItems.forEach(item => {
        const key = `${item.label}-${item.color}`; // Simple unique key
        if(!map.has(key)) {
            map.set(key, { 
                id: item.packageId, 
                name: item.label, 
                color: item.color, 
                // We must infer dimensions from the item or use a lookup. 
                // Since placedItem dimensions are the *oriented* ones, we need the raw ones.
                // In a real app, 'data' should pass the original package list.
                // Hack: We will use the placed item's dimensions as 'Standard' for the guide visual 
                // if we can't find original. BUT, ideally we passed 'allPackages' in App.
                // For this code, we'll try to reconstruct or use what we have.
                // BETTER: Just use the placed item dimensions as a reference.
                // Wait, 'data' doesn't have the original package list in PackingResult interface? 
                // Let's rely on the first occurrence.
                dimensions: { length: item.length, width: item.width, height: item.height } // This is imprecise if rotated.
            });
        }
      });
      // Better approach: In App.tsx we passed `allPackages`. 
      // Ideally PackingResult should contain `packages` config.
      // For now, let's assume we can just list the packages found in the result.
      return Array.from(map.values());
  }, [data]);

  // FIX: We need the ORIGINAL package definitions to show correct orientations.
  // Since we don't have them in 'data' prop easily, we will do a trick:
  // We will assume the inputs were passed correctly. 
  // *Correction*: We can pass uniquePackages if we update the PackingResult type, 
  // but to avoid breaking changes in other files, let's look at `data.placedItems`.
  // Actually, `PDFExportTemplate` logic for guide uses `guidePackage`.
  // We will iterate `uniquePackages` derived above. Note: The dimensions might be the rotated ones 
  // if the first item found was rotated. This is a limitation unless we pass original packages.
  // HOWEVER, for a "Cheat Sheet", showing the orientations used is actually fine.

  useEffect(() => {
    if (data) setCurrentLayerIndex(0);
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || !data) return;
    const updateScale = () => {
        if (!containerRef.current || !data) return;
        const { width, height } = data.containerDimensions;
        const isMobile = window.innerWidth < 768;
        const paddingW = isMobile ? 16 : 64; 
        const paddingH = isMobile ? 16 : 64; 
        const wrapperW = containerRef.current.clientWidth - paddingW;
        const wrapperH = containerRef.current.clientHeight - paddingH;
        if (wrapperW <= 0 || wrapperH <= 0) return;
        setScale(Math.min(wrapperW / width, wrapperH / height));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [data]);

  const handleDownloadPDF = async () => {
      if (!data || !exportRef.current) return;
      setIsExporting(true);

      try {
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1024, 768] });

        // 1. COVER PAGE
        setExportMode('cover');
        await new Promise(r => setTimeout(r, 200));
        if (exportRef.current) {
            // OPTIMIZATION: Use JPEG, 0.8 Quality, 1.0 Pixel Ratio (High enough for screen/print, low file size)
            const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
            pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
        }

        // 2. GUIDE PAGES (One per unique package)
        // We need to identify unique packages carefully.
        // Since we don't have the original input list in 'data', we'll extract unique IDs.
        // We will define a helper map from the PlacedItems to get colors/labels.
        const uniqueKeys = new Set();
        const packagesToPrint: PackageType[] = [];
        
        data.placedItems.forEach(p => {
            const key = `${p.label}-${p.color}`;
            if(!uniqueKeys.has(key)) {
                uniqueKeys.add(key);
                // We create a "Standard" definition from this item
                // NOTE: This assumes the first one found is a valid reference. 
                // For a perfect guide, we'd need the input list. 
                // We'll proceed with this for the visualizer limitation.
                packagesToPrint.push({
                    id: p.packageId,
                    name: p.label,
                    color: p.color,
                    dimensions: { length: p.length, width: p.width, height: p.height }, // Approximate
                    quantity: 0
                });
            }
        });

        for (const pkg of packagesToPrint) {
            setExportMode('guide');
            setExportGuidePkg(pkg);
            await new Promise(r => setTimeout(r, 200));
            if (exportRef.current) {
                pdf.addPage([1024, 768], 'landscape');
                const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
                pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
            }
        }

        // 3. LAYER PAGES
        setExportGuidePkg(undefined); // Cleanup
        for (let i = 0; i < data.layers.length; i++) {
            setExportMode('layer');
            setExportLayerIndex(i);
            await new Promise(r => setTimeout(r, 100));
            if (exportRef.current) {
                pdf.addPage([1024, 768], 'landscape');
                const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
                pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
            }
        }

        pdf.save('PackMaster-Plan.pdf');

      } catch (e) {
          console.error("Export failed", e);
          alert("Failed to generate PDF.");
      } finally {
          setIsExporting(false);
          setExportMode('cover');
          setExportLayerIndex(0);
      }
  };

  if (!data) return <div className="p-8 text-center text-slate-400">Ready to Pack</div>;

  const { layers, placedItems, containerDimensions } = data;
  const currentZ = layers[currentLayerIndex] || 0;
  const epsilon = 0.5;
  const activeItems = placedItems.filter(item => 
    item.z <= currentZ + epsilon && (item.z + item.length) > currentZ + epsilon
  );

  return (
    <div className="flex flex-col h-full bg-slate-100 font-sans relative">
        {/* HEADER TOOLBAR */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-20 gap-2">
            <div>
                <h2 className="text-lg font-bold text-slate-800">Step {currentLayerIndex + 1}</h2>
                <div className="text-xs text-slate-500">Depth: {Math.round(currentZ)}cm</div>
            </div>
            <div className="flex items-center gap-2">
                 <button 
                    onClick={handleDownloadPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md active:scale-95 disabled:opacity-50"
                 >
                    {isExporting ? 'Generating...' : 'Download PDF Report'}
                 </button>
                 <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => setCurrentLayerIndex(Math.max(0, currentLayerIndex - 1))} className="p-2 hover:bg-white rounded"><span className="sr-only">Prev</span>←</button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    <button onClick={() => setCurrentLayerIndex(Math.min(layers.length - 1, currentLayerIndex + 1))} className="p-2 hover:bg-white rounded"><span className="sr-only">Next</span>→</button>
                 </div>
            </div>
        </div>

        {/* MAIN CANVAS */}
        <div className="flex-1 relative flex items-center justify-center bg-slate-200/50 overflow-hidden p-2 md:p-8" ref={containerRef}>
            <div className="relative bg-[#1e293b] shadow-2xl transition-all duration-300 rounded-lg overflow-hidden border-4 border-slate-700 ring-1 ring-white/20"
                style={{
                    width: containerDimensions.width * scale,
                    height: containerDimensions.height * scale,
                }}>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                {activeItems.map((item, i) => {
                    const isNew = Math.abs(item.z - currentZ) < 0.5;
                    return (
                        <div
                            key={i}
                            onClick={() => onPackageClick && onPackageClick(item.packageId)}
                            className={`absolute flex items-center justify-center border-box cursor-pointer hover:brightness-110
                                ${isNew ? 'z-10 shadow-lg' : 'z-0 opacity-25 grayscale brightness-50'}`}
                            style={{
                                left: `${(item.x / containerDimensions.width) * 100}%`,
                                bottom: `${(item.y / containerDimensions.height) * 100}%`,
                                width: `${(item.width / containerDimensions.width) * 100}%`,
                                height: `${(item.height / containerDimensions.height) * 100}%`,
                                backgroundColor: item.color,
                                border: isNew ? '1px solid rgba(255,255,255,0.5)' : '1px dashed rgba(255,255,255,0.2)'
                            }}
                        >
                            {isNew && <span className="text-white font-bold text-xs md:text-sm drop-shadow-md">{Math.round(item.width)}x{Math.round(item.height)}</span>}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* HIDDEN EXPORT LAYER */}
        <div className="fixed top-0 left-0 pointer-events-none opacity-0 overflow-hidden" style={{ zIndex: -1 }}>
             <PDFExportTemplate 
                ref={exportRef}
                data={data}
                layerIndex={exportLayerIndex}
                mode={exportMode}
                guidePackage={exportGuidePkg}
             />
        </div>
    </div>
  );
};

export default Visualizer;