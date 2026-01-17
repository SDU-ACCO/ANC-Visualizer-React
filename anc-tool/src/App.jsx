import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Upload, Activity, ArrowRight, Download, BarChart2, Trash2, Info, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ANC Band Analysis & Comparison Tool
 * * Features:
 * - Parses text/CSV exports from REW (Room EQ Wizard).
 * - Logarithmic frequency scaling for accurate audio visualization.
 * - Interactive band selection.
 * - Real-time metric calculation (Delta dB, Power Reduction).
 */

// --- Constants & Utilities ---

const MIN_FREQ_PLOT = 20;
const MAX_FREQ_PLOT = 20000;
const DEFAULT_RANGE = [200, 1000]; // Hz

// Helper: Convert frequency to X coordinate (Logarithmic)
const freqToX = (freq, width) => {
  const minLog = Math.log10(MIN_FREQ_PLOT);
  const maxLog = Math.log10(MAX_FREQ_PLOT);
  const freqLog = Math.log10(Math.max(freq, MIN_FREQ_PLOT));
  return ((freqLog - minLog) / (maxLog - minLog)) * width;
};

// Helper: Convert X coordinate to Frequency (Logarithmic)
const xToFreq = (x, width) => {
  const minLog = Math.log10(MIN_FREQ_PLOT);
  const maxLog = Math.log10(MAX_FREQ_PLOT);
  const freqLog = (x / width) * (maxLog - minLog) + minLog;
  return Math.pow(10, freqLog);
};

// Helper: Convert dB to Y coordinate
const dbToY = (db, height, minDb, maxDb) => {
  return height - ((db - minDb) / (maxDb - minDb)) * height;
};

// --- Components ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const FileUploader = ({ label, file, onFileLoaded, colorClass, onDelete }) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const data = parseREWFile(text);
      onFileLoaded({ data, name: file.name });
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      {!file ? (
        <label className={`flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-slate-50 cursor-pointer transition-all group`}>
          <div className={`p-2 rounded-full ${colorClass} bg-opacity-10 text-slate-600 group-hover:scale-110 transition-transform`}>
            <Upload size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">Click to upload</p>
            <p className="text-xs text-slate-400">.txt or .csv (REW export)</p>
          </div>
          <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
          <div className={`w-3 h-3 rounded-full ${colorClass.replace('bg-', 'bg-')}`}></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
            <p className="text-xs text-slate-500">{file.data.length} data points</p>
          </div>
          <button onClick={onDelete} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

// --- Parsing Logic ---

const parseREWFile = (text) => {
  const lines = text.split('\n');
  const data = [];
  
  for (let line of lines) {
    line = line.trim();
    // Skip comments and empty lines
    if (!line || line.startsWith('*') || line.startsWith('#') || isNaN(line[0])) continue;
    
    // REW exports are typically: Freq(Hz) SPL(dB) Phase(deg)
    // Sometimes comma separated, sometimes space separated
    const parts = line.split(/[,\s]+/).filter(p => p !== "");
    
    if (parts.length >= 2) {
      const freq = parseFloat(parts[0]);
      const spl = parseFloat(parts[1]);
      if (!isNaN(freq) && !isNaN(spl) && freq > 0) {
        data.push({ freq, spl });
      }
    }
  }
  return data.sort((a, b) => a.freq - b.freq);
};

const generateDemoData = () => {
  const dataBefore = [];
  const dataAfter = [];
  
  for (let f = 20; f <= 20000; f *= 1.05) {
    // Simulate a noise floor with a peak around 150-600Hz
    const baseNoise = 60 - 10 * Math.log10(f / 20); 
    const hump = 30 * Math.exp(-Math.pow((Math.log10(f) - Math.log10(400)), 2) / 0.1); // Peak at 400Hz
    const random = (Math.random() - 0.5) * 2;
    
    const valBefore = baseNoise + hump + random + 20;
    
    // Simulate ANC: effective between 100Hz and 2000Hz
    let reduction = 0;
    if (f > 100 && f < 2000) {
      reduction = 15 * Math.sin(Math.PI * (Math.log10(f) - Math.log10(100)) / (Math.log10(2000) - Math.log10(100)));
    }
    const valAfter = valBefore - Math.max(0, reduction);

    dataBefore.push({ freq: f, spl: valBefore });
    dataAfter.push({ freq: f, spl: valAfter });
  }
  return { before: dataBefore, after: dataAfter };
};

// --- Main Application ---

export default function App() {
  const [fileBefore, setFileBefore] = useState(null);
  const [fileAfter, setFileAfter] = useState(null);
  const [range, setRange] = useState(DEFAULT_RANGE); // [minHz, maxHz]
  const [hoverData, setHoverData] = useState(null);

  // Parse check
  const hasData = fileBefore && fileAfter;

  const handleDemoLoad = () => {
    const { before, after } = generateDemoData();
    setFileBefore({ name: "Demo_Measurement_Before.txt", data: before });
    setFileAfter({ name: "Demo_Measurement_After.txt", data: after });
  };

  // --- Analysis Calculations ---
  
  const analysis = useMemo(() => {
    if (!hasData) return null;

    // Filter data to selected range
    const inRangeBefore = fileBefore.data.filter(d => d.freq >= range[0] && d.freq <= range[1]);
    const inRangeAfter = fileAfter.data.filter(d => d.freq >= range[0] && d.freq <= range[1]);

    if (inRangeBefore.length === 0 || inRangeAfter.length === 0) return null;

    // Compute Averages (Arithmetic Mean of dB)
    // Note: For "Average SPL", arithmetic mean of dB is standard for visual level.
    // For pure energy total, we would sum powers, but that's "Total SPL".
    const avgBefore = inRangeBefore.reduce((sum, d) => sum + d.spl, 0) / inRangeBefore.length;
    const avgAfter = inRangeAfter.reduce((sum, d) => sum + d.spl, 0) / inRangeAfter.length;
    
    const deltaDb = avgAfter - avgBefore;

    // Power Calculation
    // Ratio = 10^(delta / 10)
    const powerRatio = Math.pow(10, deltaDb / 10);
    const reductionPercent = (1 - powerRatio) * 100;

    return {
      avgBefore,
      avgAfter,
      deltaDb,
      reductionPercent
    };
  }, [fileBefore, fileAfter, range, hasData]);


  // --- Chart Rendering Logic ---

  const Chart = () => {
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ width: 0, height: 350 });
    const [isDragging, setIsDragging] = useState(null); // 'start', 'end', or 'range'

    useEffect(() => {
      const handleResize = () => {
        if (containerRef.current) {
          setDims({
            width: containerRef.current.clientWidth,
            height: 350
          });
        }
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (!hasData) return <div className="h-[350px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg border border-slate-100">Upload data to view chart</div>;

    // Determine Y Axis bounds
    const allSpls = [...fileBefore.data, ...fileAfter.data].map(d => d.spl);
    const minDbRaw = Math.min(...allSpls);
    const maxDbRaw = Math.max(...allSpls);
    const minDb = Math.floor(minDbRaw / 10) * 10 - 5;
    const maxDb = Math.ceil(maxDbRaw / 10) * 10 + 5;

    // Generate Path Data
    const generatePath = (data) => {
      return data.map((d, i) => {
        const x = freqToX(d.freq, dims.width);
        const y = dbToY(d.spl, dims.height, minDb, maxDb);
        return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
      }).join(' ');
    };

    const pathBefore = generatePath(fileBefore.data);
    const pathAfter = generatePath(fileAfter.data);

    // Generate Difference Path (only where freqs match closely)
    // We'll resample 'After' to 'Before' frequencies for simplicity or just plot matching points
    const diffPoints = [];
    let j = 0;
    for (let i = 0; i < fileBefore.data.length; i++) {
        // Simple nearest neighbor matching for demo (assuming same sample rate usually)
        // A robust app would interpolate.
        const d1 = fileBefore.data[i];
        // Find closest freq in d2
        while(j < fileAfter.data.length - 1 && Math.abs(fileAfter.data[j+1].freq - d1.freq) < Math.abs(fileAfter.data[j].freq - d1.freq)) {
            j++;
        }
        const d2 = fileAfter.data[j];
        
        if (d2 && Math.abs(d2.freq - d1.freq) < (d1.freq * 0.05)) { // within 5% freq
             const x = freqToX(d1.freq, dims.width);
             // Plot diff relative to a center line (e.g., bottom 20% of chart)? 
             // Or just plot on same scale? Let's plot on same scale but offset if needed.
             // Requirement says: "Plot difference curve". 
             // Usually difference is small (0 to -20dB). If plotted on absolute scale (e.g. 60dB), it's way at the bottom.
             // Let's plot it on the same graph.
             const diff = d2.spl - d1.spl; 
             // To make it visible, let's map 0dB diff to a specific line or just plot raw values.
             // Raw values might be -15dB, which is off chart if chart is 30-100dB.
             // Let's create a secondary axis or just clamp it. 
             // For simplicity in this single chart, let's just plot the line. If it's off screen, user won't see it well.
             // BETTER APPROACH: Add a fixed offset for the diff line (e.g. + 50dB) or just show it in a separate chart?
             // Prompt says: "Plot a third curve showing the difference". 
             // I will plot it on the main graph but purely as (Diff + Offset) for visualization, or raw.
             // Actually, usually ANC diff is negative. If chart is 40dB-100dB, and diff is -10dB, it's invisible.
             // Let's put the diff on a secondary smaller chart below, or just overlay it.
             // I'll calculate it for the "Difference" logic but maybe not draw it on the MAIN dB scale to avoid confusion, 
             // unless I add a right-axis.
             // Let's stick to the prompt: "Plot both spectra... Plot a third curve".
             // I'll plot the third curve on a secondary chart below to make it clear.
             diffPoints.push({ x, y: dbToY(diff, dims.height, -40, 20), val: diff }); // Scale -40dB to +20dB for diff
        }
    }
    
    // Grid Lines (Log X)
    const xGridLines = [];
    const xLabels = [];
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
      const x = freqToX(f, dims.width);
      xGridLines.push(<line key={f} x1={x} y1={0} x2={x} y2={dims.height} stroke="#e2e8f0" strokeDasharray="4 4" />);
      xLabels.push(<text key={f} x={x} y={dims.height + 15} textAnchor="middle" fontSize="10" fill="#64748b">{f >= 1000 ? (f/1000)+'k' : f}</text>);
    });

    // Grid Lines (Linear Y)
    const yGridLines = [];
    for (let db = minDb; db <= maxDb; db += 10) {
      const y = dbToY(db, dims.height, minDb, maxDb);
      yGridLines.push(<line key={db} x1={0} y1={y} x2={dims.width} y2={y} stroke="#e2e8f0" />);
      yGridLines.push(<text key={`t${db}`} x={-5} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">{db}</text>);
    }

    // Range Overlay
    const xStart = freqToX(range[0], dims.width);
    const xEnd = freqToX(range[1], dims.width);

    // Mouse Interactions for Slider
    const handleMouseDown = (e, type) => {
        setIsDragging(type);
    };
    
    const handleMouseMove = (e) => {
        if (!isDragging) {
             // Hover Logic
             const rect = containerRef.current.getBoundingClientRect();
             const mouseX = e.clientX - rect.left;
             const freq = xToFreq(mouseX, dims.width);
             
             // Find closest data points
             const closestBefore = fileBefore.data.reduce((prev, curr) => 
                Math.abs(curr.freq - freq) < Math.abs(prev.freq - freq) ? curr : prev
             );
             const closestAfter = fileAfter.data.reduce((prev, curr) => 
                Math.abs(curr.freq - freq) < Math.abs(prev.freq - freq) ? curr : prev
             );

             setHoverData({
                 freq: closestBefore.freq,
                 before: closestBefore.spl,
                 after: closestAfter.spl,
                 x: mouseX
             });
             return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = Math.max(0, Math.min(dims.width, e.clientX - rect.left));
        const newFreq = xToFreq(mouseX, dims.width);

        if (isDragging === 'start') {
            setRange([Math.min(newFreq, range[1] - 10), range[1]]);
        } else if (isDragging === 'end') {
            setRange([range[0], Math.max(newFreq, range[0] + 10)]);
        } else if (isDragging === 'range') {
             // Move whole range logic could go here, skipping for simplicity
        }
    };

    const handleMouseUp = () => setIsDragging(null);

    // --- Difference Chart ---
    // We'll render the Diff chart INSIDE the same SVG but at the bottom or as an overlay?
    // Let's render the Diff chart as a separate path on the same graph but obscure?
    // Actually, let's render it on a separate smaller SVG below to be clean.
    // Returning just the main chart here.
    
    return (
      <div 
        className="relative select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsDragging(null); setHoverData(null); }}
      >
        <svg 
            ref={containerRef} 
            width="100%" 
            height={dims.height + 30} 
            className="overflow-visible"
        >
            {/* Grids */}
            {xGridLines}
            {yGridLines}
            {xLabels}

            {/* Selection Band */}
            <rect 
                x={xStart} 
                y={0} 
                width={Math.max(0, xEnd - xStart)} 
                height={dims.height} 
                fill="#fef08a" 
                fillOpacity="0.2" 
            />
            
            {/* Data Paths */}
            <path d={pathBefore} fill="none" stroke="#94a3b8" strokeWidth="2" strokeOpacity="0.5" />
            <path d={pathAfter} fill="none" stroke="#2563eb" strokeWidth="2" />
            
            {/* Diff Path (Scaled to fit? Or just overlay?) 
                Let's omit diff on main chart to avoid clutter, will show in separate view or just stats.
            */}

            {/* Handles */}
            <g 
                transform={`translate(${xStart}, 0)`} 
                className="cursor-ew-resize group"
                onMouseDown={(e) => handleMouseDown(e, 'start')}
            >
                <line y1={0} y2={dims.height} stroke="#eab308" strokeWidth="2" strokeDasharray="4 2" />
                <circle cy={dims.height / 2} r={8} fill="#eab308" className="group-hover:scale-125 transition-transform shadow-sm" />
                <text y={-10} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#ca8a04">{Math.round(range[0])}</text>
            </g>

            <g 
                transform={`translate(${xEnd}, 0)`} 
                className="cursor-ew-resize group"
                onMouseDown={(e) => handleMouseDown(e, 'end')}
            >
                <line y1={0} y2={dims.height} stroke="#eab308" strokeWidth="2" strokeDasharray="4 2" />
                <circle cy={dims.height / 2} r={8} fill="#eab308" className="group-hover:scale-125 transition-transform shadow-sm" />
                <text y={-10} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#ca8a04">{Math.round(range[1])}</text>
            </g>

            {/* Tooltip Hover Line */}
            {hoverData && !isDragging && (
                <g>
                    <line x1={hoverData.x} y1={0} x2={hoverData.x} y2={dims.height} stroke="#475569" strokeWidth="1" />
                    <circle cx={hoverData.x} cy={dbToY(hoverData.before, dims.height, minDb, maxDb)} r={4} fill="#94a3b8" />
                    <circle cx={hoverData.x} cy={dbToY(hoverData.after, dims.height, minDb, maxDb)} r={4} fill="#2563eb" />
                </g>
            )}

        </svg>

        {/* Floating Tooltip */}
        {hoverData && !isDragging && (
             <div 
                className="absolute top-0 bg-slate-900/90 text-white text-xs p-2 rounded shadow-lg pointer-events-none"
                style={{ left: hoverData.x + 10 }}
             >
                 <div className="font-bold mb-1">{Math.round(hoverData.freq)} Hz</div>
                 <div className="flex items-center gap-2 text-slate-300">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    Before: {hoverData.before.toFixed(1)} dB
                 </div>
                 <div className="flex items-center gap-2 text-blue-300">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    After: {hoverData.after.toFixed(1)} dB
                 </div>
                 <div className="mt-1 pt-1 border-t border-slate-700 font-mono text-green-400">
                    Diff: {(hoverData.after - hoverData.before).toFixed(1)} dB
                 </div>
             </div>
        )}
      </div>
    );
  };

  const DifferenceChart = () => {
       // A simplified chart just for the difference
       // Reusing similar logic but simpler display
       const containerRef = useRef(null);
       const [width, setWidth] = useState(0);
       
       useEffect(() => {
           if(containerRef.current) setWidth(containerRef.current.clientWidth);
       }, []);

       if(!hasData) return null;

       // Calculate diff points
       const diffData = [];
       let j = 0;
       for (let i = 0; i < fileBefore.data.length; i++) {
           const d1 = fileBefore.data[i];
           while(j < fileAfter.data.length - 1 && fileAfter.data[j+1].freq < d1.freq) j++;
           const d2 = fileAfter.data[j];
           if (d2 && Math.abs(d2.freq - d1.freq) < d1.freq * 0.1) {
               diffData.push({ freq: d1.freq, diff: d2.spl - d1.spl });
           }
       }

       // Y Axis for Diff: usually -30 to +10
       const h = 100;
       const minD = -30;
       const maxD = 10;
       
       const pathDiff = diffData.map((d, i) => {
           const x = freqToX(d.freq, width);
           const clampedDiff = Math.max(minD, Math.min(maxD, d.diff));
           const y = h - ((clampedDiff - minD) / (maxD - minD)) * h;
           return `${i===0?'M':'L'} ${x},${y}`;
       }).join(' ');

       const zeroY = h - ((0 - minD) / (maxD - minD)) * h;

       return (
           <div className="mt-6 border-t pt-4">
               <h3 className="text-sm font-semibold text-slate-600 mb-2">Difference Curve (After - Before)</h3>
               <div ref={containerRef} className="h-[100px] w-full relative">
                   <svg width="100%" height="100%" className="overflow-visible">
                       {/* Zero Line */}
                       <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#94a3b8" strokeDasharray="2 2" />
                       
                       {/* Selection Highlight in Diff */}
                       <rect 
                            x={freqToX(range[0], width)} 
                            y={0} 
                            width={Math.max(0, freqToX(range[1], width) - freqToX(range[0], width))} 
                            height={h} 
                            fill="#fef08a" 
                            fillOpacity="0.2" 
                        />

                       <path d={pathDiff} fill="none" stroke="#ef4444" strokeWidth="2" />
                       
                       {/* Y Labels */}
                       <text x={-5} y={zeroY + 3} textAnchor="end" fontSize="10" fill="#64748b">0 dB</text>
                       <text x={-5} y={10} textAnchor="end" fontSize="10" fill="#64748b">+10</text>
                       <text x={-5} y={h} textAnchor="end" fontSize="10" fill="#64748b">-30</text>
                   </svg>
               </div>
           </div>
       )
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
                <Activity size={20} />
            </div>
            <div>
                <h1 className="font-bold text-lg leading-tight">ANC Analyzer</h1>
                <p className="text-xs text-slate-500">Spectral Comparison Tool</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button 
                onClick={handleDemoLoad}
                className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
             >
                Load Demo Data
             </button>
             <button className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors">
                <Download size={14} />
                Export Report
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Sidebar: Controls */}
        <div className="lg:col-span-3 space-y-6">
           <Card className="p-4">
              <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <Upload size={16} /> Data Sources
              </h2>
              <div className="space-y-4">
                  <FileUploader 
                    label="Before ANC" 
                    colorClass="bg-slate-500" 
                    file={fileBefore} 
                    onFileLoaded={setFileBefore} 
                    onDelete={() => setFileBefore(null)}
                  />
                  <FileUploader 
                    label="After ANC" 
                    colorClass="bg-blue-500" 
                    file={fileAfter} 
                    onFileLoaded={setFileAfter} 
                    onDelete={() => setFileAfter(null)}
                  />
              </div>
           </Card>

           <Card className="p-4">
               <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                   <BarChart2 size={16} /> Band Selection
               </h2>
               <div className="space-y-4">
                   <div className="grid grid-cols-2 gap-3">
                       <div>
                           <label className="text-xs text-slate-500 font-semibold">Start (Hz)</label>
                           <input 
                                type="number" 
                                value={Math.round(range[0])} 
                                onChange={(e) => setRange([Number(e.target.value), range[1]])}
                                className="w-full mt-1 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                           />
                       </div>
                       <div>
                           <label className="text-xs text-slate-500 font-semibold">End (Hz)</label>
                           <input 
                                type="number" 
                                value={Math.round(range[1])} 
                                onChange={(e) => setRange([range[0], Number(e.target.value)])}
                                className="w-full mt-1 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                           />
                       </div>
                   </div>
                   <p className="text-xs text-slate-400 leading-relaxed">
                       Drag the yellow handles on the chart or enter precise values above to isolate the noise reduction zone.
                   </p>
               </div>
           </Card>
        </div>

        {/* Main Content: Charts & Metrics */}
        <div className="lg:col-span-9 space-y-6">
            
            {/* Metrics Panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg SPL (Before)</p>
                    <div className="text-2xl font-mono font-bold text-slate-700 mt-1">
                        {analysis ? analysis.avgBefore.toFixed(1) : '--'} <span className="text-sm font-sans text-slate-400">dB</span>
                    </div>
                </Card>
                <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg SPL (After)</p>
                    <div className="text-2xl font-mono font-bold text-blue-600 mt-1">
                        {analysis ? analysis.avgAfter.toFixed(1) : '--'} <span className="text-sm font-sans text-slate-400">dB</span>
                    </div>
                </Card>
                <Card className="p-4 bg-blue-600 text-white shadow-lg shadow-blue-200">
                    <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">Reduction</p>
                    <div className="text-3xl font-mono font-bold mt-1">
                        {analysis ? analysis.deltaDb.toFixed(1) : '--'} <span className="text-sm font-sans opacity-70">dB</span>
                    </div>
                    {analysis && (
                        <div className="text-xs text-blue-100 mt-1 flex items-center">
                            <ChevronDown size={12} /> {Math.abs(analysis.deltaDb).toFixed(1)} dB lower
                        </div>
                    )}
                </Card>
                <Card className="p-4 border-emerald-100 bg-emerald-50/50">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Power Reduced</p>
                    <div className="text-3xl font-mono font-bold text-emerald-600 mt-1">
                        {analysis ? analysis.reductionPercent.toFixed(0) : '--'} <span className="text-sm font-sans">%</span>
                    </div>
                    <div className="text-xs text-emerald-500 mt-1">Acoustic Energy</div>
                </Card>
            </div>

            {/* Main Chart */}
            <Card className="p-6 relative">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-700">Frequency Response Comparison</h3>
                    <div className="flex gap-4 text-xs font-medium">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-slate-400 opacity-50"></div> Before ANC
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-600"></div> After ANC
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div> Difference
                        </div>
                    </div>
                </div>
                
                <div className="pl-4">
                   <Chart />
                   <DifferenceChart />
                </div>
            </Card>
            
            {/* Guide */}
            {!hasData && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex gap-4">
                    <div className="bg-white p-3 rounded-full shadow-sm h-fit text-blue-600">
                        <Info size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-blue-900 mb-1">How to use this tool</h4>
                        <p className="text-sm text-blue-800 leading-relaxed mb-3">
                            This tool helps visualize the effectiveness of your ANC prototype. 
                            Upload standard text exports from <strong>REW (Room EQ Wizard)</strong>. 
                            The files should contain Frequency and SPL columns.
                        </p>
                        <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                            <li>Upload your "System Off" measurement to <strong>Before ANC</strong>.</li>
                            <li>Upload your "System On" measurement to <strong>After ANC</strong>.</li>
                            <li>Use the yellow handles to focus on your target frequency band (e.g. 200-800Hz).</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}