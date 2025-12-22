import React, { useState } from 'react';
import { PackingInput, PackageType, Unit } from '../types';

interface ControlPanelProps {
  onCalculate: (input: PackingInput) => void;
  isGenerating: boolean;
  onShowGuide: (pkg: PackageType) => void;
}

// Extended Palette
const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', 
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#f43f5e', '#ec4899'
];

const ControlPanel: React.FC<ControlPanelProps> = ({ onCalculate, isGenerating, onShowGuide }) => {
  const [container, setContainer] = useState({ length: '6', width: '2.4', height: '2.4' });
  const [containerUnit, setContainerUnit] = useState<Unit>('m');

  const [packages, setPackages] = useState<PackageType[]>([
    { id: '1', name: 'Standard Carton', dimensions: { length: 40, width: 30, height: 30 }, quantity: 0, color: PALETTE[0] }
  ]);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPkg, setNewPkg] = useState({ length: '40', width: '30', height: '30', qty: '', name: '' });
  const [pkgUnit, setPkgUnit] = useState<Unit>('cm');

  const convertToCm = (val: number, unit: Unit) => {
    if (unit === 'm') return val * 100;
    if (unit === 'mm') return val / 10;
    if (unit === 'ft') return val * 30.48;
    if (unit === 'in') return val * 2.54;
    return val;
  };

  const convertFromCm = (val: number, unit: Unit) => {
    if (unit === 'm') return parseFloat((val / 100).toFixed(3));
    if (unit === 'mm') return parseFloat((val * 10).toFixed(1));
    if (unit === 'ft') return parseFloat((val / 30.48).toFixed(3));
    if (unit === 'in') return parseFloat((val / 2.54).toFixed(2));
    return parseFloat(val.toFixed(2));
  }

  const handleSavePackage = () => {
    const l = parseFloat(newPkg.length);
    const w = parseFloat(newPkg.width);
    const h = parseFloat(newPkg.height);
    const q = newPkg.qty === '' ? 0 : parseInt(newPkg.qty);

    if (!l || !w || !h) return;

    const dimsInCm = {
        length: convertToCm(l, pkgUnit),
        width: convertToCm(w, pkgUnit),
        height: convertToCm(h, pkgUnit)
    };

    if (editingId) {
        // UPDATE EXISTING
        setPackages(packages.map(p => {
            if (p.id === editingId) {
                return {
                    ...p,
                    name: newPkg.name.trim() || p.name,
                    dimensions: dimsInCm,
                    quantity: q
                };
            }
            return p;
        }));
        setEditingId(null);
    } else {
        // CREATE NEW
        const colorIndex = packages.length % PALETTE.length;
        const color = PALETTE[colorIndex];
        const nextNum = packages.length + 1;
        const name = newPkg.name.trim() || `Box Type ${nextNum}`;
        const newId = Math.random().toString(36).substr(2, 9);

        setPackages([...packages, {
            id: newId,
            name: name,
            dimensions: dimsInCm,
            quantity: q, 
            color: color
        }]);
    }

    // Reset Form
    setNewPkg({ length: '40', width: '30', height: '30', qty: '', name: '' });
  };

  const handleEditPackage = (pkg: PackageType) => {
    setEditingId(pkg.id);
    setNewPkg({
        length: convertFromCm(pkg.dimensions.length, pkgUnit).toString(),
        width: convertFromCm(pkg.dimensions.width, pkgUnit).toString(),
        height: convertFromCm(pkg.dimensions.height, pkgUnit).toString(),
        qty: (pkg.quantity === 0 || pkg.quantity === undefined) ? '' : pkg.quantity.toString(),
        name: pkg.name
    });
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setNewPkg({ length: '40', width: '30', height: '30', qty: '', name: '' });
  };

  const handleRemovePackage = (id: string) => {
    if (editingId === id) handleCancelEdit();
    setPackages(packages.filter(p => p.id !== id));
  };

  const handleCalculate = () => {
    const contL = convertToCm(parseFloat(container.length), containerUnit);
    const contW = convertToCm(parseFloat(container.width), containerUnit);
    const contH = convertToCm(parseFloat(container.height), containerUnit);

    onCalculate({
        container: { length: contL, width: contW, height: contH },
        packages: packages
    });
  };

  const units: Unit[] = ['m', 'cm', 'ft', 'in'];

  return (
    <>
    <div className="bg-white flex flex-col h-full border-r border-slate-200 shadow-xl z-20 w-full">
      <div className="p-5 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">1. Container Dimensions</h2>
        <div className="flex items-center gap-2 mt-3">
             <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1 font-bold">Depth</label>
                <input type="number" value={container.length} onChange={e => setContainer({...container, length: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm font-medium focus:ring-2 ring-brand-500 outline-none" />
             </div>
             <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1 font-bold">Width</label>
                <input type="number" value={container.width} onChange={e => setContainer({...container, width: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm font-medium focus:ring-2 ring-brand-500 outline-none" />
             </div>
             <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1 font-bold">Height</label>
                <input type="number" value={container.height} onChange={e => setContainer({...container, height: e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-sm font-medium focus:ring-2 ring-brand-500 outline-none" />
             </div>
             <div className="w-16">
                 <label className="text-xs text-slate-500 block mb-1 font-bold">Unit</label>
                 <select value={containerUnit} onChange={e => setContainerUnit(e.target.value as Unit)} className="w-full bg-white border border-slate-200 rounded p-2 text-sm outline-none">
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                 </select>
             </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">2. Cargo List</h2>
        
        {/* New/Edit Package Form */}
        <div className={`bg-white p-4 rounded-xl border-2 mb-4 shadow-sm transition-colors ${editingId ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-100'}`}>
             {editingId && <div className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Editing Item</div>}
             <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                    <input placeholder="Item Name (Optional)" value={newPkg.name} onChange={e => setNewPkg({...newPkg, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none focus:bg-white focus:border-brand-500 transition-colors" />
                </div>
                <div>
                     <label className="text-[10px] uppercase text-slate-400 font-bold">L</label>
                     <input type="number" placeholder="Length" value={newPkg.length} onChange={e => setNewPkg({...newPkg, length: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-sm" />
                </div>
                <div>
                     <label className="text-[10px] uppercase text-slate-400 font-bold">W</label>
                     <input type="number" placeholder="Width" value={newPkg.width} onChange={e => setNewPkg({...newPkg, width: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-sm" />
                </div>
                <div>
                     <label className="text-[10px] uppercase text-slate-400 font-bold">H</label>
                     <input type="number" placeholder="Height" value={newPkg.height} onChange={e => setNewPkg({...newPkg, height: e.target.value})} className="w-full border border-slate-200 rounded p-2 text-sm" />
                </div>
                <div>
                     <label className="text-[10px] uppercase text-slate-400 font-bold">Unit</label>
                     <select value={pkgUnit} onChange={e => setPkgUnit(e.target.value as Unit)} className="w-full bg-white border border-slate-200 rounded p-2 text-sm">
                        {units.map(u => <option key={u} value={u}>{u}</option>)}
                     </select>
                </div>
             </div>
             <div className="flex items-end gap-2">
                <div className="flex-1">
                    <label className="text-[10px] uppercase text-slate-400 font-bold">Qty (Optional)</label>
                    <input 
                        type="number" 
                        placeholder="Empty = Fill" 
                        value={newPkg.qty} 
                        onChange={e => setNewPkg({...newPkg, qty: e.target.value})} 
                        className="w-full border border-slate-200 rounded p-2 text-sm placeholder:text-slate-300" 
                    />
                </div>
                {editingId ? (
                    <div className="flex gap-1">
                        <button onClick={handleCancelEdit} className="bg-slate-200 text-slate-600 rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-300">
                            Cancel
                        </button>
                        <button onClick={handleSavePackage} className="bg-amber-500 text-white rounded-lg px-3 py-2 text-sm font-bold hover:bg-amber-600 shadow-sm">
                            Update
                        </button>
                    </div>
                ) : (
                    <button onClick={handleSavePackage} className="bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-brand-500 shadow-md shadow-brand-200 active:scale-95 transition-all">
                        + Add
                    </button>
                )}
             </div>
        </div>

        {/* Package List */}
        <div className="space-y-2">
            {packages.map((p) => (
                <div key={p.id} className={`flex items-center justify-between bg-white border p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow
                    ${editingId === p.id ? 'border-amber-400 ring-1 ring-amber-400 bg-amber-50' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-3">
                        {/* Colored Icon */}
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0" style={{ backgroundColor: p.color }}>
                           Box
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="font-bold text-sm text-slate-800 leading-tight truncate">{p.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                                {p.dimensions.length}x{p.dimensions.width}x{p.dimensions.height}
                            </div>
                            <div className="flex gap-2 mt-1">
                                <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                    {(!p.quantity || p.quantity === 0) ? "FILL" : `x${p.quantity}`}
                                </span>
                                <button 
                                    onClick={() => onShowGuide(p)}
                                    className="text-[9px] font-bold text-brand-600 flex items-center gap-1 hover:underline whitespace-nowrap"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    How to load?
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center">
                        <button onClick={() => handleEditPackage(p)} className="text-slate-400 hover:text-amber-500 p-2" title="Edit Item">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                        </button>
                        <button onClick={() => handleRemovePackage(p.id)} className="text-slate-400 hover:text-red-500 p-2" title="Remove Item">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            ))}
            {packages.length === 0 && <p className="text-center text-sm text-slate-400 py-4 italic">No items yet.</p>}
        </div>
      </div>

      <div className="p-5 border-t border-slate-200 bg-white">
          <button 
            onClick={handleCalculate}
            disabled={isGenerating || packages.length === 0 || !!editingId}
            className={`w-full py-4 px-4 rounded-xl font-bold text-white shadow-lg transition-all text-lg flex items-center justify-center gap-2
                ${isGenerating || packages.length === 0 || !!editingId
                    ? 'bg-slate-300 cursor-not-allowed text-slate-500' 
                    : 'bg-slate-900 hover:bg-slate-800 active:scale-95'}`}
          >
            {isGenerating ? 'Processing...' : 'Generate Load Plan'}
          </button>
      </div>
    </div>
    </>
  );
};

export default ControlPanel;