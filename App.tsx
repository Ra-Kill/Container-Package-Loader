import React, { useState } from 'react';
import ControlPanel from './components/ControlPanel';
import Visualizer from './components/Visualizer';
import { calculatePacking } from './services/packingService';
import { PackingInput, PackingResult } from './types';

const App: React.FC = () => {
  const [packingResult, setPackingResult] = useState<PackingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Mobile Tab State: 'setup' (Input) or 'view' (Visualizer)
  const [mobileTab, setMobileTab] = useState<'setup' | 'view'>('setup');

  const handleCalculate = async (input: PackingInput) => {
    setIsProcessing(true);
    
    // Simulate async for UI feedback
    setTimeout(() => {
        try {
            const result = calculatePacking(input);
            setPackingResult(result);
            setMobileTab('view'); // Auto-switch to view on mobile
        } catch (e) {
            console.error(e);
            alert("Error calculating plan");
        } finally {
            setIsProcessing(false);
        }
    }, 100);
  };

  return (
    // FIX 1: Changed h-screen to h-dvh (Dynamic Viewport Height) to fix mobile browser bar issue
    <div className="h-dvh w-screen bg-slate-100 flex flex-col md:flex-row overflow-hidden font-sans text-slate-900">
        
        {/* LEFT PANEL: INPUT / SETUP */}
        <div className={`w-full md:w-96 shrink-0 h-full md:border-r border-slate-200 bg-white flex flex-col z-20 transition-all
            ${mobileTab === 'setup' ? 'flex' : 'hidden md:flex'}`}>
            
            {/* Mobile-only Header for Setup */}
            <div className="md:hidden h-14 shrink-0 border-b border-slate-100 flex items-center px-4 font-bold text-slate-800 bg-slate-50 justify-between">
                <span className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    PackMaster <span className="text-slate-400 font-normal">Setup</span>
                </span>
            </div>

            {/* FIX 2: Wrapped ControlPanel in a scrollable div. 
               This ensures the form scrolls INSIDE the screen, rather than pushing the bottom nav off. */}
            <div className="flex-1 overflow-y-auto">
                <ControlPanel onCalculate={handleCalculate} isGenerating={isProcessing} />
            </div>
        </div>

        {/* RIGHT PANEL: VISUALIZER */}
        <div className={`flex-1 flex flex-col h-full relative bg-slate-100/50 
            ${mobileTab === 'view' ? 'flex' : 'hidden md:flex'}`}>
            
            <header className="h-14 md:h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between z-10 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-slate-900 text-white p-1.5 md:p-2 rounded-lg shadow-md">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z" />
                        </svg>
                    </div>
                    <h1 className="text-lg md:text-xl font-bold text-slate-800">PackMaster <span className="text-brand-600 font-light hidden sm:inline">Layer View</span></h1>
                </div>
                <div className="md:hidden text-xs font-bold text-slate-400">
                    {packingResult ? `${Math.round(packingResult.volumeUtilization)}% Full` : 'Empty'}
                </div>
            </header>
            
            <main className="flex-1 relative overflow-hidden flex flex-col">
                <Visualizer data={packingResult} />
            </main>
        </div>

        {/* MOBILE BOTTOM NAV */}
        <div className="md:hidden h-16 bg-white border-t border-slate-200 shrink-0 flex items-center justify-around z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <button 
                onClick={() => setMobileTab('setup')} 
                className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${mobileTab === 'setup' ? 'text-brand-600 bg-brand-50' : 'text-slate-400'}`}
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-[10px] font-bold mt-1 uppercase tracking-wide">Setup</span>
            </button>
            <div className="w-px h-8 bg-slate-200"></div>
            <button 
                onClick={() => setMobileTab('view')} 
                className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${mobileTab === 'view' ? 'text-brand-600 bg-brand-50' : 'text-slate-400'}`}
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <span className="text-[10px] font-bold mt-1 uppercase tracking-wide">Visuals</span>
            </button>
        </div>
    </div>
  );
};

export default App;