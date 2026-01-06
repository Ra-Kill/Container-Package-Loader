import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PackingResult, PackageType } from '../types';
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
    totalVolume: number; 
    percentOfContainer: number;
}

// --- PDF TEMPLATE COMPONENT ---
// Used for Cover, Guide, and Summary pages (HTML -> Image)
const PDFExportTemplate = React.forwardRef<HTMLDivElement, { 
    data: PackingResult, 
    mode: 'cover' | 'guide' | 'summary',
    guidePackage?: PackageType,
    stats?: Map<string, PackageStats>
}>(({ data, mode, guidePackage, stats }, ref) => {
    
    const containerVolCm3 = data.containerDimensions.length * data.containerDimensions.width * data.containerDimensions.height;
    const containerCBM = (containerVolCm3 / 1000000).toFixed(3);

    const uniquePlacedItems = useMemo(() => {
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

    // Calculate Final Manifest (Placed + Unplaced)
    const finalManifest = useMemo(() => {
        const manifest = new Map<string, { 
            name: string, 
            color: string, 
            loaded: number, 
            remaining: number, 
            total: number,
            dims: string 
        }>();

        // 1. Add Placed Items
        data.placedItems.forEach(item => {
            const key = item.label; 
            const entry = manifest.get(key) || { 
                name: item.label, 
                color: item.color, 
                loaded: 0, remaining: 0, total: 0,
                dims: `${Math.round(item.length)}x${Math.round(item.width)}x${Math.round(item.height)}`
            };
            entry.loaded++;
            entry.total++;
            manifest.set(key, entry);
        });

        // 2. Add Unplaced Items
        data.unplacedItems.forEach(item => {
            const key = item.name;
            const entry = manifest.get(key) || { 
                name: item.name, 
                color: item.color, 
                loaded: 0, remaining: 0, total: 0,
                dims: `${item.dimensions.length}x${item.dimensions.width}x${item.dimensions.height}`
            };
            const qty = item.quantity || 1;
            entry.remaining += qty;
            entry.total += qty;
            manifest.set(key, entry);
        });

        return Array.from(manifest.values());
    }, [data]);

    return (
        <div ref={ref} className="bg-white text-slate-900 font-sans relative overflow-hidden flex flex-col" style={{ width: '1024px', height: '768px' }}>
            
            {/* HEADER */}
            <div className="bg-slate-900 text-white px-8 py-4 flex justify-between items-center shrink-0 h-20">
                <div className="flex items-center gap-4">
                    <div className="text-3xl font-black tracking-tight">PackMaster 3D</div>
                    <div className="h-8 w-px bg-slate-700"></div>
                    <div className="text-base font-medium text-slate-300">Load Plan Report</div>
                </div>
                <div className="text-right">
                     {mode === 'cover' && <span className="text-2xl font-bold">Overview</span>}
                     {mode === 'summary' && <span className="text-2xl font-bold text-amber-400">Shortfall Report</span>}
                     {mode === 'guide' && <span className="text-2xl font-bold">Package Reference</span>}
                </div>
            </div>

            {/* COVER PAGE */}
            {mode === 'cover' && (
                <div className="flex-1 p-8 flex flex-col gap-6 bg-slate-50 overflow-hidden">
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
                                <div className="text-xs text-slate-400 font-bold uppercase">Boxes Loaded</div>
                            </div>
                            <div>
                                <div className="text-4xl font-black text-brand-600">{Math.round(data.volumeUtilization)}%</div>
                                <div className="text-xs text-slate-400 font-bold uppercase">Volume Filled</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
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
                         </div>

                         <div className="col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="text-lg font-bold mb-4 text-slate-800">2. Loaded Cargo (Success)</h3>
                            <div className="flex-1 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">Type</th>
                                            <th className="px-4 py-3">Packed Qty</th>
                                            <th className="px-4 py-3 text-right">Vol (CBM)</th>
                                            <th className="px-4 py-3 rounded-r-lg text-right">% Load</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {uniquePlacedItems.map((item, i) => (
                                            <tr key={i}>
                                                <td className="px-4 py-3 font-bold text-slate-700 flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded shadow-sm shrink-0" style={{ backgroundColor: item.color }}></div>
                                                    {item.label}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800">{item.stat.count}</td>
                                                <td className="px-4 py-3 text-slate-600 text-right font-mono">
                                                    {(item.stat.totalVolume / 1000000).toFixed(3)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
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

            {/* SUMMARY PAGE */}
            {mode === 'summary' && (
                <div className="flex-1 p-8 bg-slate-50 flex flex-col gap-6">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col">
                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">Final Manifest Verification</h2>
                                <p className="text-slate-500 mt-1">Comparison of Requested Qty vs. Actual Loaded Qty</p>
                            </div>
                            {data.unplacedItems.length === 0 ? (
                                <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-bold flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    All Items Loaded
                                </div>
                            ) : (
                                <div className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Items Left Behind
                                </div>
                            )}
                        </div>

                        <div className="overflow-hidden border border-slate-200 rounded-xl">
                            <table className="w-full text-left">
                                <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold">
                                    <tr>
                                        <th className="px-6 py-4">Package Name</th>
                                        <th className="px-6 py-4 text-center">Requested</th>
                                        <th className="px-6 py-4 text-center">Loaded</th>
                                        <th className="px-6 py-4 text-center text-red-600">Remaining</th>
                                        <th className="px-6 py-4 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {finalManifest.map((item, idx) => (
                                        <tr key={idx} className={item.remaining > 0 ? "bg-red-50/50" : "bg-white"}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
                                                    <span className="font-bold text-slate-700">{item.name}</span>
                                                </div>
                                                <div className="text-xs text-slate-400 pl-7 mt-0.5">{item.dims}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono text-slate-600">{item.total}</td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-slate-800">{item.loaded}</td>
                                            <td className="px-6 py-4 text-center font-mono font-bold text-red-600">
                                                {item.remaining > 0 ? `-${item.remaining}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {item.remaining === 0 ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        Complete
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                        {Math.round((item.loaded/item.total)*100)}% Loaded
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* GUIDE PAGE */}
            {mode === 'guide' && guidePackage && (
                <div className="flex-1 p-6 bg-slate-50 flex flex-col overflow-hidden">
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
                        </div>
                    </div>
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
        </div>
    );
});

const Visualizer: React.FC<VisualizerProps> = ({ data, onPackageClick }) => {
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  
  const [scale, setScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'cover' | 'guide' | 'summary'>('cover');
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
        await new Promise(r => setTimeout(r, 200)); 
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
            await new Promise(r => setTimeout(r, 100));
            
            if (exportRef.current) {
                pdf.addPage([1024, 768], 'landscape');
                const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
                pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
            }
        }

        // 3. LAYER PAGES (NATIVE VECTOR DRAWING)
        const { width: contW, height: contH } = data.containerDimensions;
        
        // --- LAYOUT & CENTERING CONSTANTS ---
        const pageWidth = 1024;
        const headerHeight = 160; 
        const footerHeight = 50;
        const availableW = pageWidth - 80; // 40px padding each side
        const availableH = 768 - headerHeight - footerHeight;

        // Calculate uniform scale
        const scaleFactor = Math.min(availableW / contW, availableH / contH);
        
        const drawW = contW * scaleFactor;
        const drawH = contH * scaleFactor;

        // Exact Centering
        const startX = (pageWidth - drawW) / 2;
        const startY = headerHeight + (availableH - drawH) / 2;

        for (let i = 0; i < data.layers.length; i++) {
            const currentZ = data.layers[i];
            const epsilon = 0.5;
            
            const activeItems = data.placedItems.filter(item => 
                item.z <= currentZ + epsilon && (item.z + item.length) > currentZ + epsilon
            );

            pdf.addPage([1024, 768], 'landscape');
            
            // Draw Header
            pdf.setFillColor(25, 30, 40); 
            pdf.rect(0, 0, 1024, 80, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(24);
            pdf.setFont("helvetica", "bold");
            pdf.text("PackMaster 3D", 40, 50);
            pdf.setFontSize(16);
            pdf.setFont("helvetica", "normal");
            pdf.text("Load Plan Report", 250, 50);
            pdf.setFontSize(24);
            pdf.setFont("helvetica", "bold");
            pdf.text(`Step ${i + 1}`, 900, 50);

            // Draw Sub-header
            pdf.setFillColor(248, 250, 252);
            pdf.rect(0, 80, 1024, 60, 'F');
            pdf.setTextColor(100, 116, 139);
            pdf.setFontSize(10);
            pdf.text("CURRENT DEPTH", 40, 105);
            pdf.setTextColor(15, 23, 42);
            pdf.setFontSize(24);
            pdf.setFont("helvetica", "bold");
            pdf.text(`${Math.round(currentZ)}cm`, 40, 130);

            // Draw Container Border
            pdf.setDrawColor(30, 41, 59);
            pdf.setLineWidth(3);
            pdf.setFillColor(255, 255, 255);
            pdf.rect(startX, startY, drawW, drawH, 'FD');

            // Draw Grid
            pdf.setDrawColor(226, 232, 240);
            pdf.setLineWidth(0.5);
            for(let g=0; g<=10; g++) {
                const x = startX + (g * (drawW/10));
                pdf.line(x, startY, x, startY + drawH);
            }
            for(let g=0; g<=10; g++) {
                const y = startY + (g * (drawH/10));
                pdf.line(startX, y, startX + drawW, y);
            }

            // Draw Items
            activeItems.forEach(item => {
                const isNew = Math.abs(item.z - currentZ) < 0.5;
                
                const itemX = startX + ((item.x / contW) * drawW);
                const itemW = (item.width / contW) * drawW;
                const itemH = (item.height / contH) * drawH;
                const itemY = (startY + drawH) - ((item.y / contH) * drawH) - itemH;

                const hex = item.color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);

                // Shadows (Fake 3D Depth)
                if (isNew) {
                    pdf.setFillColor(200, 200, 200);
                    pdf.setDrawColor(200, 200, 200);
                    // Offset slightly for shadow effect
                    pdf.rect(itemX + 2, itemY + 2, itemW, itemH, 'F');
                }

                if (isNew) {
                    pdf.setFillColor(r, g, b);
                    pdf.setDrawColor(255, 255, 255);
                    pdf.setLineWidth(1);
                } else {
                    pdf.setFillColor(241, 245, 249);
                    pdf.setDrawColor(r, g, b);
                    pdf.setLineWidth(0.5);
                }

                pdf.rect(itemX, itemY, itemW, itemH, 'FD');

                if (isNew) {
                    const label = `${Math.round(item.width)}x${Math.round(item.height)}`;
                    pdf.setFontSize(14); // Bigger Font
                    pdf.setFont("helvetica", "bold");
                    const textW = pdf.getTextWidth(label);
                    
                    // Center and check bounds
                    if (textW < itemW) {
                        // Text Shadow
                        pdf.setTextColor(0,0,0);
                        pdf.text(label, itemX + (itemW/2) - (textW/2) + 0.5, itemY + (itemH/2) + 5.5);
                        // Main Text
                        pdf.setTextColor(255,255,255);
                        pdf.text(label, itemX + (itemW/2) - (textW/2), itemY + (itemH/2) + 5);
                    }
                }
            });

            pdf.setTextColor(148, 163, 184);
            pdf.setFontSize(10);
            pdf.text(`Page ${pdf.getNumberOfPages()}`, 950, 750);
        }

        // 4. SUMMARY PAGE
        setExportMode('summary');
        await new Promise(r => setTimeout(r, 200));
        if (exportRef.current) {
            pdf.addPage([1024, 768], 'landscape');
            const img = await toJpeg(exportRef.current, { quality: 0.8, pixelRatio: 1.5 });
            pdf.addImage(img, 'JPEG', 0, 0, 1024, 768);
        }

        pdf.save('PackMaster-Plan.pdf');

      } catch (e) {
          console.error("Export failed", e);
          alert("Failed to generate PDF.");
      } finally {
          setIsExporting(false);
          setExportMode('cover');
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
                mode={exportMode}
                guidePackage={exportGuidePkg}
                stats={packageStats}
             />
        </div>
    </div>
  );
};

export default Visualizer;