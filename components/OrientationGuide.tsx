import React, { useState, useEffect, useMemo } from 'react';
import { PackageType } from '../types';

interface OrientationGuideProps {
  pkg: PackageType;
  onClose: () => void;
}

// --- VISUAL COMPONENTS ---

// 3D Container Wireframe
const ContainerStage = ({ children }: { children?: React.ReactNode }) => (
    <div className="relative w-full h-full flex items-center justify-center perspective-1000 overflow-hidden bg-gradient-to-b from-slate-200 to-slate-300">
        <div className="relative w-[300px] h-[300px] transform-style-3d">
             {/* The Container "Opening" Frame */}
             <div className="absolute inset-0 border-8 border-slate-700/20 rounded-xl pointer-events-none" style={{ transform: 'translateZ(0px)' }}></div>
             
             {/* Inner Depth */}
             <div className="absolute inset-0 bg-slate-800/5 pointer-events-none" 
                  style={{ transform: 'translateZ(-400px) scale(0.9)', border: '2px solid rgba(0,0,0,0.1)' }}></div>
             
             {/* Perspective Lines */}
             <div className="absolute top-0 left-0 right-0 h-[400px] origin-top bg-gradient-to-b from-slate-400/10 to-transparent pointer-events-none" style={{ transform: 'rotateX(-90deg)' }}></div>
             <div className="absolute bottom-0 left-0 right-0 h-[400px] origin-bottom bg-gradient-to-t from-slate-400/20 to-transparent pointer-events-none" style={{ transform: 'rotateX(90deg)' }}>
                  <div className="w-full h-full opacity-20" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
             </div>

             {children}
        </div>
    </div>
);

// The animated box (PURE 3D OBJECT - No 2D overlays inside)
const AnimatedBox = ({ 
    dims, 
    color, 
    rotation, 
    phase
}: { 
    dims: { l: number, w: number, h: number }, 
    color: string, 
    rotation: { x: number, y: number, z: number },
    phase: 'orient' | 'load' | '2d'
}) => {
    
    // Normalize size to fit nicely in the view while preserving Aspect Ratio
    const maxDim = Math.max(dims.l, dims.w, dims.h);
    const scale = 200 / maxDim; 
    const l = dims.l * scale;
    const w = dims.w * scale;
    const h = dims.h * scale;

    const isLoaded = phase === 'load' || phase === '2d';
    
    const boxStyle: React.CSSProperties = {
        width: w, height: h,
        marginLeft: -w/2, marginTop: -h/2,
        transformStyle: 'preserve-3d',
        transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: `
            translateZ(${isLoaded ? -200 : 100}px) 
            rotateX(${rotation.x}deg) 
            rotateY(${rotation.y}deg) 
            rotateZ(${rotation.z}deg)
        `
    };

    return (
        <div className="absolute top-1/2 left-1/2" style={boxStyle}>
            {/* Front */}
            <div className="absolute flex items-center justify-center border-2 border-white/40 shadow-inner backface-visible"
                 style={{ width: w, height: h, backgroundColor: color, transform: `translateZ(${l/2}px)` }}>
                 <div className="w-2 h-2 rounded-full bg-white/50"></div>
            </div>
            {/* Back */}
            <div className="absolute border border-white/20 backface-visible"
                 style={{ width: w, height: h, backgroundColor: color, filter: 'brightness(60%)', transform: `rotateY(180deg) translateZ(${l/2}px)` }} />
            {/* Right */}
            <div className="absolute border border-white/20 flex items-center justify-center backface-visible"
                 style={{ width: l, height: h, left: (w-l)/2, backgroundColor: color, filter: 'brightness(80%)', transform: `rotateY(90deg) translateZ(${w/2}px)` }}>
            </div>
            {/* Left */}
            <div className="absolute border border-white/20 backface-visible"
                 style={{ width: l, height: h, left: (w-l)/2, backgroundColor: color, filter: 'brightness(80%)', transform: `rotateY(-90deg) translateZ(${w/2}px)` }} />
            {/* Top */}
            <div className="absolute border border-white/20 flex items-center justify-center backface-visible"
                 style={{ width: w, height: l, top: (h-l)/2, backgroundColor: color, filter: 'brightness(110%)', transform: `rotateX(90deg) translateZ(${h/2}px)` }}>
            </div>
            {/* Bottom */}
            <div className="absolute border border-white/20 backface-visible"
                 style={{ width: w, height: l, top: (h-l)/2, backgroundColor: color, filter: 'brightness(40%)', transform: `rotateX(-90deg) translateZ(${h/2}px)` }} />
        </div>
    );
};


export const OrientationGuide: React.FC<OrientationGuideProps> = ({ pkg, onClose }) => {
  const [orientationIndex, setOrientationIndex] = useState(0);
  const [animPhase, setAnimPhase] = useState<'orient' | 'load' | '2d'>('orient');

  useEffect(() => {
    setAnimPhase('orient');
    const t1 = setTimeout(() => setAnimPhase('load'), 2000); 
    const t2 = setTimeout(() => setAnimPhase('2d'), 3500); 
    const t3 = setTimeout(() => {
        setAnimPhase('orient'); 
    }, 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [orientationIndex]); 

  const { length, width, height } = pkg.dimensions;

  const orientations = useMemo(() => {
      const correct = [
        { label: "Standard", desc: "Length deep, Width x Height face", rot: {x:0, y:0, z:0}, d: length, w: width, h: height },
        { label: "Floor Rotated", desc: "Width deep, Length x Height face", rot: {x:0, y:90, z:0}, d: width, w: length, h: height },
        { label: "On Side", desc: "Length deep, Height x Width face", rot: {x:0, y:0, z:90}, d: length, w: height, h: width },
        { label: "On Side (Rotated)", desc: "Width deep, Height x Length face", rot: {x:0, y:90, z:90}, d: width, w: height, h: length }, 
        { label: "Upright", desc: "Height deep, Width x Length face", rot: {x:90, y:0, z:0}, d: height, w: width, h: length },
        { label: "Upright (Rotated)", desc: "Height deep, Length x Width face", rot: {x:90, y:0, z:90}, d: height, w: length, h: width },
      ];

      const seen = new Set();
      return correct.filter(item => {
          const sig = `${item.d}-${item.w}-${item.h}`;
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
      }).map(c => ({
          label: c.label,
          desc: c.desc,
          rotation: c.rot,
          viewDims: { w: c.w, h: c.h },
          depth: c.d
      }));

  }, [length, width, height]);

  const current = orientations[orientationIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col md:flex-row overflow-hidden h-[80vh] md:h-[600px]">
        
        {/* SIDEBAR - STRUCTURED FLEX LAYOUT FOR SCROLLING */}
        <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 flex flex-col relative z-20 shadow-xl min-h-0">
            
            {/* Header: Fixed */}
            <div className="p-6 pb-4 shrink-0 border-b border-slate-100 bg-slate-50 z-10">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded shadow-sm" style={{ backgroundColor: pkg.color }}></div>
                    <h2 className="text-xl font-black text-slate-800 truncate" title={pkg.name}>{pkg.name}</h2>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm space-y-1 shadow-sm">
                    <div className="flex justify-between"><span>Length:</span> <span className="font-bold">{length}</span></div>
                    <div className="flex justify-between"><span>Width:</span> <span className="font-bold">{width}</span></div>
                    <div className="flex justify-between"><span>Height:</span> <span className="font-bold">{height}</span></div>
                </div>
            </div>

            {/* List: Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-1 sticky top-0 bg-slate-50 z-10 py-1">Configurations ({orientations.length})</p>
                {orientations.map((opt, idx) => (
                    <button
                        key={idx}
                        onClick={() => {
                            setOrientationIndex(idx);
                            setAnimPhase('orient');
                        }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all relative overflow-hidden group
                            ${idx === orientationIndex 
                                ? 'bg-white border-brand-500 shadow-md ring-1 ring-brand-500' 
                                : 'bg-slate-100 border-transparent hover:bg-white hover:border-slate-300 opacity-60 hover:opacity-100'
                            }`}
                    >
                        {idx === orientationIndex && (
                            <div className="absolute bottom-0 left-0 h-1 bg-brand-500 transition-all duration-[2000ms] ease-linear" 
                                 style={{ width: animPhase === 'orient' ? '0%' : '100%' }}></div>
                        )}
                        <div className="font-bold text-slate-800 text-sm">{opt.label}</div>
                        <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
                           <span>Face: {opt.viewDims.w}x{opt.viewDims.h}</span>
                           <span>Depth: {opt.depth}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Footer: Fixed */}
            <div className="p-4 pt-4 border-t border-slate-200 bg-slate-50 shrink-0 z-10">
                <button onClick={onClose} className="w-full py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-200 transition-colors shadow-sm active:scale-95">
                    Close Guide
                </button>
            </div>
        </div>

        {/* MAIN STAGE */}
        <div className="flex-1 relative overflow-hidden flex flex-col bg-slate-100">
            
            {/* Top Instruction Bar */}
            <div className="absolute top-6 left-0 right-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-lg border border-white/50 transition-all duration-300 transform">
                    <h3 className="text-sm md:text-lg font-bold text-slate-800 flex items-center gap-3">
                        <span className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold transition-colors duration-500
                            ${animPhase === 'orient' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
                        
                        <span className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold transition-colors duration-500
                            ${animPhase === 'load' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                        
                        <span className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold transition-colors duration-500
                            ${animPhase === '2d' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                            
                        <span className="ml-2 text-slate-700 hidden sm:inline">
                            {animPhase === 'orient' && current.desc}
                            {animPhase === 'load' && "Loading..."}
                            {animPhase === '2d' && "Matches screen!"}
                        </span>
                    </h3>
                </div>
            </div>

            {/* The 3D World */}
            <div className="flex-1 relative">
                <ContainerStage>
                    <AnimatedBox 
                        dims={{ l: length, w: width, h: height }}
                        color={pkg.color}
                        rotation={current.rotation}
                        phase={animPhase}
                    />
                </ContainerStage>

                {/* 2D Overlay - Decoupled from 3D transform, stays flat on screen */}
                <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500
                    ${animPhase === '2d' ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
                    <div className="bg-white/95 border-2 border-brand-500 shadow-xl rounded-xl p-4 flex flex-col items-center animate-bounce-slight backdrop-blur-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">App Shows</div>
                        <div className="text-3xl font-black text-slate-800 tabular-nums">
                            {current.viewDims.w} <span className="text-slate-300 font-light">x</span> {current.viewDims.h}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Dimensions - Static Information */}
            <div className="bg-white border-t border-slate-200 p-4 flex justify-around items-center z-30 shrink-0">
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visible Width</div>
                    <div className="text-xl font-bold text-slate-800">{current.viewDims.w}</div>
                </div>
                <div className="text-slate-300 font-light text-2xl">×</div>
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visible Height</div>
                    <div className="text-xl font-bold text-slate-800">{current.viewDims.h}</div>
                </div>
                <div className="h-8 w-px bg-slate-200 mx-4"></div>
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-brand-600">Depth (Into Cont.)</div>
                    <div className="text-xl font-bold text-brand-600">{current.depth}</div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};