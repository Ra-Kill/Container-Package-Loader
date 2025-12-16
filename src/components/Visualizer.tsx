import React, { useState, useEffect, useRef } from 'react';
import { PackingResult, PlacedItem, Dimensions } from '../types';
import { toPng } from 'html-to-image';
import JSZip from 'jszip';

interface VisualizerProps {
  data: PackingResult | null;
}

// Helper Component for Offscreen Rendering
const ExportLayer = React.forwardRef<HTMLDivElement, { items: PlacedItem[], dims: Dimensions, layerIndex: number, layerZ: number }>(
    ({ items, dims, layerIndex, layerZ }, ref) => {
        const epsilon = 0.5;
        const activeItems = items.filter(item => 
            item.z <= layerZ + epsilon && (item.z + item.length) > layerZ + epsilon
        );

        return (
            <div ref={ref} className="bg-white p-8 w-[1024px] h-[768px] flex flex-col items-center justify-center relative">
                <div className="absolute top-0 left-0 w-full bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-slate-800">PackMaster Step {layerIndex + 1}</h1>
                    <div className="text-xl text-slate-600">Depth Position: {Math.round(layerZ)}cm</div>
                </div>
                
                <div className="relative border-8 border-slate-800 bg-slate-100" 
                     style={{
                         width: '800px',
                         height: `${800 * (dims.height / dims.width)}px`,
                         maxHeight: '600px'
                     }}>
                    {activeItems.map((item, i) => {
                        const isNew = Math.abs(item.z - layerZ) < 0.5;
                        return (
                            <div
                                key={i}
                                className="absolute flex items-center justify-center text-center overflow-hidden border border-slate-400"
                                style={{
                                    left: `${(item.x / dims.width) * 100}%`,
                                    bottom: `${(item.y / dims.height) * 100}%`,
                                    width: `${(item.width / dims.width) * 100}%`,
                                    height: `${(item.height / dims.height) * 100}%`,
                                    backgroundColor: item.color,
                                    opacity: isNew ? 1 : 0.3,
                                    zIndex: isNew ? 10 : 0
                                }}
                            >
                                {isNew && (
                                    <span className="text-white font-bold text-lg drop-shadow-md">
                                        {Math.round(item.width)}x{Math.round(item.height)}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
);

const Visualizer: React.FC<VisualizerProps> = ({ data }) => {
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportLayerIndex, setExportLayerIndex] = useState(0);

  // Reset layer when data changes
  useEffect(() => {
    if (data) setCurrentLayerIndex(0);
  }, [data]);

  // Robust Auto-fit logic with ResizeObserver
  useEffect(() => {
    if (!containerRef.current || !data) return;

    const updateScale = () => {
        if (!containerRef.current || !data) return;
        const { width, height } = data.containerDimensions;
        
        // Dynamic padding to maximize space on smaller screens
        const isMobile = window.innerWidth < 768;
        const paddingW = isMobile ? 16 : 64; // Horizontal total padding buffer
        const paddingH = isMobile ? 16 : 64; // Vertical total padding buffer
        
        const wrapperW = containerRef.current.clientWidth - paddingW;
        const wrapperH = containerRef.current.clientHeight - paddingH;
        
        if (wrapperW <= 0 || wrapperH <= 0) return;

        const scaleW = wrapperW / width;
        const scaleH = wrapperH / height;
        
        // Fit within container
        setScale(Math.min(scaleW, scaleH));
    };

    // Initial calculation
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [data]);

  const handleDownload = async () => {
      if (!data || !exportRef.current) return;
      setIsExporting(true);

      try {
        const zip = new JSZip();
        
        for (let i = 0; i < data.layers.length; i++) {
            setExportLayerIndex(i);
            await new Promise(r => setTimeout(r, 100)); 
            if (exportRef.current) {
                const blob = await toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 });
                const base64 = blob.split(',')[1];
                zip.file(`step-${i + 1}-depth-${Math.round(data.layers[i])}cm.png`, base64, { base64: true });
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'packing-plan.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

      } catch (e) {
          console.error("Export failed", e);
          alert("Failed to generate images.");
      } finally {
          setIsExporting(false);
          setExportLayerIndex(0);
      }
  };

  if (!data) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 flex-col gap-4 p-8 text-center">
             <div className="w-24 h-24 md:w-32 md:h-32 bg-slate-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 md:h-12 md:w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
             </div>
             <h3 className="text-lg md:text-xl font-bold text-slate-700">Ready to Pack</h3>
             <p className="max-w-xs md:max-w-md text-sm md:text-base text-slate-500">Add your container and items in the Setup tab to generate a plan.</p>
        </div>
      );
  }

  const { layers, placedItems, containerDimensions } = data;
  const currentZ = layers[currentLayerIndex] || 0;
  
  // 2D View Logic
  const epsilon = 0.5;
  const activeItems = placedItems.filter(item => 
    item.z <= currentZ + epsilon && (item.z + item.length) > currentZ + epsilon
  );

  return (
    <div className="flex flex-col h-full bg-slate-100 font-sans relative">
        
        {/* HEADER TOOLBAR */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shrink-0 shadow-sm z-20 gap-2">
            <div className="flex flex-col min-w-0">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800 whitespace-nowrap">Step {currentLayerIndex + 1}</h2>
                    <span className="text-xs md:text-sm font-medium text-slate-400">/ {layers.length}</span>
                </div>
                <div className="text-[10px] md:text-xs font-mono text-slate-500 flex items-center gap-2 truncate">
                    <span className="inline-block w-2 h-2 rounded-full bg-brand-500 shrink-0"></span>
                    Depth: {Math.round(currentZ)}cm
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
                 <button 
                    onClick={handleDownload}
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                 >
                    {isExporting ? '...' : <span className="hidden sm:inline">Download</span>}
                    <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                 </button>

                 <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
                    <button 
                        onClick={() => setCurrentLayerIndex(Math.max(0, currentLayerIndex - 1))}
                        disabled={currentLayerIndex === 0}
                        className="p-1.5 md:p-2 hover:bg-white rounded-md shadow-sm disabled:shadow-none disabled:opacity-30 transition-all text-slate-700"
                    >
                        <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="w-px h-4 md:h-6 bg-slate-200 mx-1"></div>
                    <button 
                        onClick={() => setCurrentLayerIndex(Math.min(layers.length - 1, currentLayerIndex + 1))}
                        disabled={currentLayerIndex === layers.length - 1}
                        className="p-1.5 md:p-2 hover:bg-white rounded-md shadow-sm disabled:shadow-none disabled:opacity-30 transition-all text-slate-700"
                    >
                        <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                 </div>
            </div>
        </div>

        {/* 2D CANVAS STAGE */}
        <div className="flex-1 relative flex items-center justify-center bg-slate-200/50 overflow-hidden p-2 md:p-8" ref={containerRef}>
            
            {/* The Container Representation */}
            <div 
                className="relative bg-[#1e293b] shadow-2xl transition-all duration-300 rounded-sm md:rounded-lg overflow-hidden border-2 md:border-4 border-slate-700 ring-1 ring-white/20"
                style={{
                    width: containerDimensions.width * scale,
                    height: containerDimensions.height * scale,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                }}
            >
                {/* Inner Dark Background Grid */}
                <div className="absolute inset-0 opacity-10" 
                     style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                </div>
                
                {/* Measurement Labels (Inside Frame) - Hidden on very small scales */}
                {scale > 0.5 && (
                    <>
                        <div className="absolute top-1 left-1 md:top-2 md:left-2 text-[8px] md:text-[10px] text-slate-500 font-mono">0,0</div>
                        <div className="absolute top-1 right-1 md:top-2 md:right-2 text-[8px] md:text-[10px] text-slate-500 font-mono">{containerDimensions.width}</div>
                        <div className="absolute bottom-1 left-1 md:bottom-2 md:left-2 text-[8px] md:text-[10px] text-slate-500 font-mono">{containerDimensions.height}</div>
                    </>
                )}

                {/* Items */}
                {activeItems.map((item, i) => {
                    // Distinction logic: New vs Existing
                    const isNew = Math.abs(item.z - currentZ) < 0.5;
                    
                    // Smart labeling: Scale logic improved for visibility
                    const boxPixelWidth = item.width * scale;
                    const boxPixelHeight = item.height * scale;
                    const showLabel = boxPixelWidth > 35 && boxPixelHeight > 20;
                    const showSmallLabel = !showLabel && boxPixelWidth > 15 && boxPixelHeight > 8;

                    return (
                        <div
                            key={i}
                            className={`absolute flex items-center justify-center transition-all duration-300 border-box
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
                            {/* Detailed Label */}
                            {showLabel && (
                                <div className="flex flex-col items-center justify-center leading-none text-center p-0.5 overflow-hidden w-full">
                                    <span className={`font-bold drop-shadow-md truncate w-full px-1 ${isNew ? 'text-white' : 'text-white/70'}`}
                                          style={{ fontSize: Math.max(9, Math.min(16, boxPixelWidth / 4)) + 'px' }}>
                                        {Math.round(item.width)}×{Math.round(item.height)}
                                    </span>
                                    {isNew && boxPixelHeight > 40 && (
                                        <span className="text-[7px] md:text-[9px] uppercase tracking-wider text-white/80 mt-0.5 font-medium truncate w-full px-1">{item.label}</span>
                                    )}
                                </div>
                            )}
                            
                            {/* Minimal Label for small boxes */}
                            {showSmallLabel && (
                                <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-white/50"></div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            {/* Context Legend Floating - Adjusted for Mobile - ADDED Z-50 HERE */}
            <div className="absolute bottom-4 md:bottom-8 bg-white/90 backdrop-blur-sm px-3 py-1.5 md:pl-2 md:pr-4 md:py-2 rounded-full shadow-lg border border-slate-200 flex gap-3 md:gap-6 text-[10px] md:text-xs font-bold text-slate-600 animate-in fade-in slide-in-from-bottom-4 pointer-events-none z-50">
                <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-brand-500 border-2 border-white shadow-sm flex items-center justify-center text-[8px] md:text-[10px] text-white">★</span>
                    Load Now
                </div>
                <div className="h-3 md:h-4 w-px bg-slate-300"></div>
                <div className="flex items-center gap-1.5 opacity-60">
                    <span className="w-4 h-4 md:w-6 md:h-6 rounded-full bg-slate-500 grayscale border-2 border-white/50 shadow-sm"></span>
                    Past
                </div>
            </div>

        </div>

        {/* Hidden Export Layer */}
        <div className="fixed top-0 left-0 pointer-events-none opacity-0 overflow-hidden" style={{ zIndex: -1 }}>
             <ExportLayer 
                ref={exportRef}
                items={placedItems}
                dims={containerDimensions}
                layerIndex={exportLayerIndex}
                layerZ={layers[exportLayerIndex] || 0}
             />
        </div>

    </div>
  );
};

export default Visualizer;