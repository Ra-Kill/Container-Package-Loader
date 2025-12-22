import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PackingResult, PlacedItem, Dimensions, PackageType } from '../types';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

interface VisualizerProps {
  data: PackingResult | null;
  onPackageClick?: (id: string) => void;
}

// --- HELPER: Orientation Logic ---
const getOrientations = (pkg: PackageType) => {
    const { length, width, height } = pkg.dimensions;
    const options = [
        { label: "Standard", desc: "Length deep", d: length, w: width, h: height },
        { label: "Floor Rotated", desc: "Width deep", d: width, w: length, h: height },
        { label: "On Side", desc: "Length deep", d: length, w: height, h: width },
        { label: "On Side (Rotated)", desc: "Width deep", d: width, w: height, h: length }, 
        { label: "Upright", desc: "Height deep", d: height, w: width, h: length },
        { label: "Upright (Rotated)", desc: "Height deep", d: height, w: length, h: width },
    ];
    const seen = new Set();
    return options.filter(item => {
        const sig = `${item.d}-${item.w}-${item.h}`;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });
};

// --- HELPER: Stats Calculation ---
interface PackageStats {
    count: number;
    totalVolume: number; // Stored in cm3, converted to CBM in render
    percentOfContainer: number;
}

// --- PDF TEMPLATE COMPONENT ---
const PDFExportTemplate = React.forwardRef<HTMLDivElement, { 
    data: PackingResult, 
    layerIndex: number, 
    mode: 'cover' | 'guide' | 'layer',
    guidePackage?: PackageType,
    stats?: Map<string, PackageStats>
}>(({ data, layerIndex, mode, guidePackage, stats }, ref) => {
    
    // Calculate Container CBM
    const containerVolCm3 = data.containerDimensions.length * data.containerDimensions.width * data.containerDimensions.height;
    const containerCBM = (containerVolCm3 / 1000000).toFixed(3);

    // Unique Items for the Cover Legend
    const uniqueItems = useMemo(() => {
        const map = new Map();
        data.placedItems.forEach(item => {
            const key = `${item.label}-${item.color}`;
            if (!map.has(key)) {
                map.set(key, { 
                    ...item, 
                    stat: stats?.get(key) || { count: 0, totalVolume: 0, percentOfContainer: 0 }
                });
            }
        });
        return Array.from(map.values());
    }, [data, stats]);

    const currentZ = data.layers[layerIndex] || 0;
    
    const activeItems = mode === 'layer' ? data.placedItems.filter(item => {
        const epsilon = 0.5;
        return item.z <= currentZ + epsilon && (item.z + item.length) > currentZ + epsilon;
    }) : [];

    return (
        <div ref={ref} className="bg-white text-slate-900 font-sans relative overflow-hidden flex flex-col" style={{ width: '1024px', height: '768px' }}>
            
            {/* --- HEADER (Common) --- */}
            <div className="bg-slate-900 text-white px-8 py-4 flex justify-between items-center shrink-0 h-20">
                <div className="flex items-center gap-4">
                    <div className="text-3xl font-black tracking-tight">PackMaster 3D</div>
                    <div className="h-8 w-px bg-slate-700"></div>
                    <div className="text-base font-medium text-slate-300">Load Plan Report</div>
                </div>
                <div className="text-right">
                     {mode === 'cover' && <span className="text-2xl font-bold">Overview</span>}
                     {mode === 'guide' && <span className="text-2xl font-bold">Package Reference</span>}
                     {mode === 'layer' && <span className="text-2xl font-bold">Step {layerIndex + 1}</span>}
                </div>
            </div>

            {/* --- MODE: COVER PAGE --- */}
            {mode === 'cover' && (
                <div className="flex-1 p-8 flex flex-col gap-6 bg-slate-50 overflow-hidden">
                    
                    {/* Summary Card */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center shrink-0">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Container Specs</div>
                            <div className="flex items-baseline gap-4 mt-1">
                                <div className="text-4xl font-black text-slate-800">
                                    {data.containerDimensions.length} <span className="text-slate-300 text-2xl">x</span> {data.containerDimensions.width} <span className="text-slate-300 text-2xl">x</span> {data.containerDimensions.height}
                                </div>
                                <div className="px-3 py-1 bg-slate-100 rounded-lg text-slate-600 font-bold font-mono text-lg">
                                    {containerCBM} CBM
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-12 text-right">
                            <div>
                                <div className="text-4xl font-black text-slate-800">{data.totalItemsPacked}</div>
                                <div className="text-xs text-slate-400 font-bold uppercase">Total Boxes</div>
                            </div>
                            <div>
                                <div className="text-4xl font-black text-brand-600">{Math.round(data.volumeUtilization)}%</div>
                                <div className="text-xs text-slate-400 font-bold uppercase">Volume Filled</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
                         {/* Loading Strategy */}
                         <div className="col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                            <h3 className="text-lg font-bold mb-4 text-slate-800">1. Loading Direction</h3>
                            <div className="relative w-40 h-56 border-4 border-slate-800 rounded-xl bg-slate-50 flex flex-col p-3">
                                <div className="absolute top-0 left-0 w-full bg-slate-200 h-6 border-b border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-500">FRONT (DOOR)</div>
                                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                    <div className="text-brand-600 font-bold text-sm">LOAD THIS WAY</div>
                                    <svg className="w-12 h-12 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                </div>
                                <div className="bg-slate-800 text-white py-1.5 rounded font-bold text-[10px]">BACK WALL (START)</div>
                            </div>
                            <p className="mt-4 text-slate-500 text-xs px-4">
                                Start loading from Depth 0 (Back Wall) towards the doors.
                            </p>
                         </div>

                         {/* Cargo Types Table */}
                         <div className="col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="text-lg font-bold mb-4 text-slate-800">2. Cargo Manifest</h3>
                            <div className="flex-1 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">Type</th>
                                            <th className="px-4 py-3">Dimensions (cm)</th>
                                            <th className="px-4 py-3">Qty</th>
                                            <th className="px-4 py-3 text-right">Vol (CBM)</th>
                                            <th className="px-4 py-3 rounded-r-lg text-right">% Load</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {uniqueItems.map((item, i) => (
                                            <tr key={i}>
                                                <td className="px-4 py-3 font-bold text-slate-700 flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded shadow-sm shrink-0" style={{ backgroundColor: item.color }}></div>
                                                    {item.label}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                                                    {Math.round(item.width)}x{Math.round(item.height)}x{Math.round(item.length)}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800">{item.stat.count}</td>
                                                {/* CBM Calculation: cm3 / 1,000,000 */}
                                                <td className="px-4 py-3 text-slate-600 text-right font-mono">
                                                    {(item.stat.totalVolume / 1000000).toFixed(3)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs font-bold">{item.stat.percentOfContainer.toFixed(1)}%</span>
                                                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-brand-500" style={{ width: `${item.stat.percentOfContainer}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                         </div>
                    </div>
                </div>
            )}

            {/* --- MODE: GUIDE PAGE --- */}
            {mode === 'guide' && guidePackage && (
                <div className="flex-1 p-6 bg-slate-50 flex flex-col overflow-hidden">
                    
                    {/* Header for Guide */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center mb-4 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg shadow-md" style={{ backgroundColor: guidePackage.color }}></div>
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 leading-tight">{guidePackage.name}</h2>
                                <p className="text-xs text-slate-500 font-mono">Master Dims: {guidePackage.dimensions.length}L x {guidePackage.dimensions.width}W x {guidePackage.dimensions.height}H</p>
                            </div>
                        </div>
                        <div className="flex gap-8 text-right bg-slate-50 px-6 py-2 rounded-lg border border-slate-100">
                            <div>
                                <div className="text-2xl font-bold text-slate-800 leading-none">
                                    {stats?.get(`${guidePackage.name}-${guidePackage.color}`)?.count || 0}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">Quantity</div>
                            </div>
                            <div className="w-px h-8 bg-slate-200"></div>
                            <div>
                                <div className="text-2xl font-bold text-slate-800 leading-none">
                                    {/* CBM conversion */}
                                    {((stats?.get(`${guidePackage.name}-${guidePackage.color}`)?.totalVolume || 0) / 1000000).toFixed(3)}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">Total CBM</div>
                            </div>
                        </div>
                    </div>

                    {/* Grid of Orientations */}
                    <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-4 min-h-0">
                        {getOrientations(guidePackage).map((opt, idx) => (
                            <div key={idx} className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex justify-between items-center shrink-0">
                                    <span className="font-bold text-sm text-slate-700">{opt.label}</span>
                                    <span className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                                        Depth: {opt.d}
                                    </span>
                                </div>
                                <div className="flex-1 p-2 flex flex-col items-center justify-center gap-2">
                                    {/* 2D Representation */}
                                    <div 
                                        className="relative flex items-center justify-center border-2 border-slate-800 shadow-sm"
                                        style={{
                                            backgroundColor: guidePackage.color,
                                            width: `${Math.min(100, opt.w * 2.5)}px`, 
                                            height: `${Math.min(80, opt.h * 2.5)}px`,
                                            maxWidth: '90%',
                                            maxHeight: '90px',
                                        }}
                                    >
                                        <div className="text-white font-bold text-lg drop-shadow-md whitespace-nowrap px-1">
                                            {opt.w} <span className="text-white/70 text-sm">x</span> {opt.h}
                                        </div>
                                    </div>
                                    <div className="text-center leading-tight">
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Face (W x H)</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- MODE: LAYER VIEW --- */}
            {mode === 'layer' && (
                <div className="flex-1 flex flex-col relative bg-slate-100 overflow-hidden">
                    <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                         <div className="text-xs font-bold text-slate-400 uppercase">Current Depth</div>
                         <div className="text-2xl font-black text-brand-600">{Math.round(currentZ)}cm</div>
                    </div>

                    <div className="flex-1 flex items-center justify-center p-4">
                         <div className="relative border-4 border-slate-800 bg-white shadow-xl" 
                             style={{
                                 width: '850px',
                                 height: `${850 * (data.containerDimensions.height / data.containerDimensions.width)}px`,
                                 maxHeight: '580px'
                             }}>
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
                                            opacity: isNew ? 1 : 0.15,
                                            zIndex: isNew ? 10 : 0,
                                            boxShadow: isNew ? 'inset 0 0 0 1px rgba(255,255,255,0.4)' : 'none'
                                        }}
                                    >
                                        {isNew && (
                                            <div className="flex flex-col items-center justify-center leading-none w-full h-full">
                                                <span className="text-white font-bold drop-shadow-md text-lg">
                                                    {Math.round(item.width)}x{Math.round(item.height)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="absolute bottom-3 right-6 bg-white px-3 py-1 rounded-full text-slate-400 font-mono text-xs border border-slate-200">
                        Page {layerIndex + 2 + (stats ? stats.size : 0)}
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

  // --- STATISTICS CALCULATION ---
  const packageStats = useMemo(() => {
      const stats = new Map<string, PackageStats>();
      if (!data) return stats;

      const containerVol = data.containerDimensions.length * data.containerDimensions.width * data.containerDimensions.height;

      data.placedItems.forEach(item => {
          const key = `${item.label}-${item.color}`;
          const current = stats.get(key) || { count: 0, totalVolume: 0, percentOfContainer: 0 };
          
          const vol = item.length * item.width * item.height;
          
          stats.set(key, {
              count: current.count + 1,
              totalVolume: current.totalVolume + vol,
              percentOfContainer: 0 
          });
      });

      // Finalize percents
      stats.forEach((val, key) => {
          val.percentOfContainer = (val.totalVolume / containerVol) * 100;
          stats.set(key, val);
      });

      return stats;
  }, [data]);

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
        await new Promise(r => setTimeout(r, 250)); 
        if (exportRef.current) {
            const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
            pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
        }

        // 2. GUIDE PAGES
        const uniqueKeys = Array.from(packageStats.keys());
        
        for (const key of uniqueKeys) {
            const sampleItem = data.placedItems.find(p => `${p.label}-${p.color}` === key);
            if (!sampleItem) continue;

            const guidePkg: PackageType = {
                id: sampleItem.packageId,
                name: sampleItem.label,
                color: sampleItem.color,
                dimensions: { length: sampleItem.length, width: sampleItem.width, height: sampleItem.height },
                quantity: packageStats.get(key)?.count
            };

            setExportMode('guide');
            setExportGuidePkg(guidePkg);
            await new Promise(r => setTimeout(r, 200));
            
            if (exportRef.current) {
                pdf.addPage([1024, 768], 'landscape');
                const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
                pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
            }
        }

        // 3. LAYER PAGES
        setExportGuidePkg(undefined);
        for (let i = 0; i < data.layers.length; i++) {
            setExportMode('layer');
            setExportLayerIndex(i);
            await new Promise(r => setTimeout(r, 150));
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
                stats={packageStats}
             />
        </div>
    </div>
  );
};

export default Visualizer;