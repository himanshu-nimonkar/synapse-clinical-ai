
import React, { useState, useEffect } from 'react';
import { AnalysisResult, Conflict, Severity, Note, MissingInfo, DismissalRecord, DismissalReason, ConfidenceLevel } from '../types';

interface AnalysisResultsProps {
  result: AnalysisResult | null;
  notes: Note[];
  dismissedFlags: Record<string, DismissalRecord>;
  onDismiss: (record: DismissalRecord) => void;
  onRestore: (id: string) => void;
  activeMobileTab?: string;
  onViewSource: (sourceId: string) => void;
  onSaveCase: () => void;
  onClearCase: () => void;
  isSaving?: boolean;
}

// Shared UI Class for Inputs (matching PatientHeader)
const inputClass = "w-full text-sm bg-[#f7fafc] border border-slate-200 rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-slate-800 placeholder-slate-400 font-medium transition-colors";


// Copy Helper
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // Simple visual feedback could be handled by component state, 
    // but for now we rely on user action.
    // Ideally use a toast, but this component is isolated.
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
};

const SeverityPill: React.FC<{ severity: string }> = ({ severity }) => {
  const styles = {
    HIGH: "bg-red-100 text-red-800 border-red-200",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
    LOW: "bg-slate-100 text-slate-700 border-slate-200"
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${styles[severity as keyof typeof styles]}`}>
      {severity}
    </span>
  );
};

const ConfidenceIcon: React.FC<{ level?: string }> = ({ level }) => {
  if (!level) return null;
  
  const config = {
    HIGH: { 
        color: "text-green-600", 
        icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", 
        label: "High Confidence" 
    },
    MEDIUM: { 
        color: "text-amber-500", 
        icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", 
        label: "Medium Confidence" 
    },
    LOW: { 
        color: "text-red-500", 
        icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", 
        label: "Low Confidence" 
    }
  };
  
  const c = config[level as keyof typeof config] || config.LOW;

  return (
    <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${c.color}`} title={c.label}>
       <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.icon} /></svg>
       {c.label}
    </span>
  );
};

const ConflictCard: React.FC<{ 
  conflict: Conflict; 
  notes: Note[]; 
  onDismiss: (r: DismissalRecord) => void; 
  onRestore?: (id: string) => void; 
  isDismissed: boolean; 
  dismissalRecord?: DismissalRecord; 
  onViewSource: (id: string) => void;
}> = ({ conflict, notes, onDismiss, onRestore, isDismissed, dismissalRecord, onViewSource }) => {
  const [expanded, setExpanded] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState<DismissalReason>(DismissalReason.NOT_RELEVANT);
  const [resolutionSourceId, setResolutionSourceId] = useState<string>('');
  const [customNote, setCustomNote] = useState('');
  const [speaking, setSpeaking] = useState(false);

  // Pre-fill modal if editing
  useEffect(() => {
      if (showDismissModal && dismissalRecord) {
          setDismissReason(dismissalRecord.reason);
          setCustomNote(dismissalRecord.note || '');
          setResolutionSourceId(dismissalRecord.resolutionSourceId || '');
      }
  }, [showDismissModal, dismissalRecord]);

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.speechSynthesis) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = `Alert. ${conflict.description}. Severity ${conflict.severity}. ${conflict.why_it_matters}`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const submitDismissal = () => {
    onDismiss({
      conflictId: conflict.id,
      reason: dismissReason,
      note: customNote,
      resolutionSourceId: resolutionSourceId || undefined,
      timestamp: Date.now()
    });
    setShowDismissModal(false);
    setExpanded(false);
  };

  const handleResolve = (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss({
        conflictId: conflict.id,
        reason: DismissalReason.RESOLVED,
        resolutionSourceId: sourceId,
        note: `Resolved: User selected source "${notes.find(n => n.id === sourceId)?.label}" as correct.`,
        timestamp: Date.now()
    });
  }

  const handleEditDismissal = (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowDismissModal(true);
  }

  // involved notes for dropdown
  const involvedNotes = notes.filter(n => conflict.source_ids.includes(n.id));

  if (isDismissed) {
    const isResolved = dismissalRecord?.reason === DismissalReason.RESOLVED;
    return (
      <div className={`mb-2 p-2 border rounded flex flex-col opacity-75 ${isResolved ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpanded(!expanded)}>
             <span className={`text-xs ${isResolved ? 'text-green-800 font-medium' : 'text-slate-500 line-through decoration-slate-400 decoration-2'}`}>{conflict.description}</span>
             <div className="flex items-center gap-2">
                 <span className={`text-[9px] font-bold px-1 rounded bg-white border ${isResolved ? 'text-green-600 border-green-200' : 'text-slate-400 border-slate-200'}`}>
                    {isResolved ? 'RESOLVED' : `DISMISSED: ${dismissalRecord?.reason}`}
                 </span>
                 <button onClick={handleEditDismissal} className="text-[9px] text-slate-500 hover:text-blue-600 hover:underline">Edit</button>
                 {onRestore && (
                     <button onClick={(e) => { e.stopPropagation(); onRestore(conflict.id); }} className="text-[9px] text-blue-600 hover:underline">Restore</button>
                 )}
             </div>
        </div>
        {expanded && dismissalRecord?.note && (
             <div className={`mt-2 text-[10px] italic border-t pt-1 ${isResolved ? 'text-green-700 border-green-200' : 'text-slate-500 border-slate-200'}`}>
                 Note: {dismissalRecord.note}
             </div>
        )}
        
        {/* Re-use dismissal modal for editing */}
        {showDismissModal && (
            <div className="mt-2 p-3 bg-white border border-slate-200 rounded shadow-sm z-50 relative" onClick={e => e.stopPropagation()}>
               <h5 className="text-xs font-bold text-slate-700 mb-2">Update Resolution</h5>
               <div className="mb-2">
                 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Update Reason</label>
                 <select 
                    value={dismissReason} 
                    onChange={e => setDismissReason(e.target.value as DismissalReason)}
                    className={inputClass}
                 >
                    <option value={DismissalReason.NOT_RELEVANT}>Not Clinically Relevant</option>
                    <option value={DismissalReason.FALSE_POSITIVE}>False Positive</option>
                    <option value={DismissalReason.ADDRESSED}>Already Addressed</option>
                    <option value={DismissalReason.DOC_ERROR}>Documentation Error</option>
                    <option value={DismissalReason.RESOLVED}>Resolved (Source Selection)</option>
                    <option value={DismissalReason.OTHER}>Other</option>
                 </select>
              </div>
              
              <div className="mb-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Resolution Source (Optional)</label>
                  <select
                      value={resolutionSourceId}
                      onChange={e => setResolutionSourceId(e.target.value)}
                      className={inputClass}
                  >
                      <option value="">-- None Selected --</option>
                      {involvedNotes.map(n => (
                          <option key={n.id} value={n.id}>{n.label}</option>
                      ))}
                  </select>
              </div>

              <div className="mb-2">
                 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Notes</label>
                 <textarea 
                   className={inputClass} 
                   value={customNote}
                   onChange={(e) => setCustomNote(e.target.value)}
                   rows={2}
                 />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowDismissModal(false)} className="flex-1 text-[10px] py-2 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 font-bold">Cancel</button>
                <button onClick={submitDismissal} className="flex-1 text-[10px] py-2 bg-slate-600 text-white rounded hover:bg-slate-700 font-bold">Save Update</button>
              </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded border mb-3 shadow-sm overflow-hidden transition-all ${
      conflict.severity === 'HIGH' ? 'border-l-4 border-l-red-500 border-y-slate-200 border-r-slate-200' : 
      conflict.severity === 'MEDIUM' ? 'border-l-4 border-l-amber-500 border-y-slate-200 border-r-slate-200' : 
      'border-l-4 border-l-slate-400 border-y-slate-200 border-r-slate-200'
    }`}>
      <div className="p-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
               <SeverityPill severity={conflict.severity} />
               <ConfidenceIcon level={conflict.confidence} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">{conflict.description}</h3>
            <p className="text-xs text-slate-600 mt-1 line-clamp-1">{conflict.reasoning}</p>
          </div>
          <div className="flex items-center gap-2">
            {window.speechSynthesis && (
              <button onClick={handleSpeak} className={`p-1 rounded-full hover:bg-slate-200 ${speaking ? 'text-blue-600 animate-pulse' : 'text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              </button>
            )}
            <button className="text-slate-400 hover:text-blue-600 transition-colors">
              <svg className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
        {!expanded && (
           <div className="mt-2 flex gap-1 flex-wrap">
            {conflict.source_ids.map(sid => {
              const n = notes.find(n => n.id === sid);
              return n ? (
                <span key={sid} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[100px]">
                  {n.label}
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-3">
          
          <div className="mb-3">
             <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-1">Clinical Reasoning</h4>
             <p className="text-xs text-slate-800 leading-relaxed bg-white p-2 rounded border border-slate-200 shadow-sm">{conflict.reasoning}</p>
          </div>

          <div className="mb-3 bg-blue-50 border border-blue-100 p-2 rounded">
             <h4 className="text-[10px] font-bold text-blue-700 uppercase mb-1">Why This Matters</h4>
             <p className="text-xs text-blue-900">{conflict.why_it_matters || "Potential clinical discrepancy detected."}</p>
          </div>

          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex justify-between items-center">
             Source Excerpts & Resolution
             <span className="text-[9px] font-normal lowercase italic text-slate-400">Click checkmark to select correct source</span>
          </h4>
          <div className="grid grid-cols-1 gap-2 mb-3">
             {conflict.source_ids.map(sid => {
               const n = notes.find(n => n.id === sid);
               const excerptObj = conflict.excerpts?.find(e => e.source_id === sid);
               const excerpt = excerptObj ? excerptObj.text : null;

               if (!n) return null;
               return (
                 <div key={sid} className="bg-white p-2 rounded border border-slate-200 flex gap-2">
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-50">
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold bg-slate-100 px-1 rounded text-slate-600">{n.type === 'text' ? 'T' : n.type === 'image' ? 'I' : 'A'}</span>
                                <span className="text-[10px] font-bold text-slate-700 truncate">{n.label}</span>
                            </div>
                            <button onClick={() => onViewSource(sid)} className="text-[9px] text-blue-600 hover:underline">View Source</button>
                        </div>
                        {excerpt ? (
                            <p className="text-xs text-slate-800 font-mono bg-yellow-50/50 p-1.5 rounded border border-yellow-100/50 leading-relaxed">"{excerpt}"</p>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Excerpt not explicitly provided by analysis.</p>
                        )}
                    </div>
                    <div className="flex flex-col justify-center border-l border-slate-100 pl-2">
                        <button 
                            onClick={(e) => handleResolve(sid, e)}
                            className="p-1.5 rounded-full hover:bg-green-100 text-slate-300 hover:text-green-600 transition-colors"
                            title="Mark this source as correct"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                    </div>
                 </div>
               );
             })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
             <div className="flex gap-2 w-full justify-end">
               <button onClick={(e) => { e.stopPropagation(); setShowDismissModal(true); }} className="text-[10px] font-bold px-3 py-1.5 rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 shadow-sm">
                  Dismiss
               </button>
             </div>
          </div>
          
          {/* Dismiss Modal */}
          {showDismissModal && (
            <div className="mt-3 p-3 bg-white border border-slate-200 rounded shadow-sm animate-fade-in" onClick={e => e.stopPropagation()}>
              <h5 className="text-xs font-bold text-slate-700 mb-2">Dismissal Details</h5>
              <div className="mb-2">
                 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Reason</label>
                 <select 
                    value={dismissReason} 
                    onChange={e => setDismissReason(e.target.value as DismissalReason)}
                    className={inputClass}
                 >
                    <option value={DismissalReason.NOT_RELEVANT}>Not Clinically Relevant</option>
                    <option value={DismissalReason.FALSE_POSITIVE}>False Positive</option>
                    <option value={DismissalReason.ADDRESSED}>Already Addressed</option>
                    <option value={DismissalReason.DOC_ERROR}>Documentation Error</option>
                    <option value={DismissalReason.RESOLVED}>Resolved (Source Selection)</option>
                    <option value={DismissalReason.OTHER}>Other</option>
                 </select>
              </div>
              
              <div className="mb-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Resolution Source (Optional)</label>
                  <select
                      value={resolutionSourceId}
                      onChange={e => setResolutionSourceId(e.target.value)}
                      className={inputClass}
                  >
                      <option value="">-- None Selected --</option>
                      {involvedNotes.map(n => (
                          <option key={n.id} value={n.id}>{n.label}</option>
                      ))}
                  </select>
              </div>

              <div className="mb-2">
                 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Additional Notes</label>
                 <textarea 
                   className={inputClass}
                   placeholder="Optional justification..."
                   value={customNote}
                   onChange={(e) => setCustomNote(e.target.value)}
                   rows={2}
                 />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowDismissModal(false)} className="flex-1 text-[10px] py-2 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 font-bold">Cancel</button>
                <button onClick={submitDismissal} className="flex-1 text-[10px] py-2 bg-slate-600 text-white rounded hover:bg-slate-700 font-bold">Confirm</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ 
  result, notes, dismissedFlags, onDismiss, onRestore, activeMobileTab, 
  onViewSource, onSaveCase, onClearCase, isSaving 
}) => {
  const [activeMissingCategory, setActiveMissingCategory] = useState<string>("All");
  const [speaking, setSpeaking] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Reset TTS when result changes
  useEffect(() => {
    setSpeaking(false);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, [result]);

  const handleTTS = () => {
    if (!window.speechSynthesis) {
        alert("Text-to-Speech is not supported in this browser.");
        return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    if (!result) return;

    const summary = result.patient_trajectory_summary;
    const highRisks = result.critical_conflicts
      .filter(c => c.severity === 'HIGH')
      .map(c => `High risk: ${c.description}.`)
      .join(" ");

    const text = `Patient Trajectory Summary. ${summary}. Safety Alerts. ${highRisks || "No high risk alerts."}`;
    
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => setSpeaking(false);
    utter.rate = 1.0;
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const handleCopySummary = () => {
    if (!result) return;
    copyToClipboard(result.patient_trajectory_summary, 'Summary');
    setCopyFeedback('Summary Copied!');
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleCopyConflicts = () => {
    if (!result) return;
    const activeConflicts = result.critical_conflicts.filter(c => !dismissedFlags[c.id]);
    const text = activeConflicts.map(c => `[${c.severity}] ${c.description}\nWhy: ${c.why_it_matters}`).join('\n\n');
    copyToClipboard(text, 'Conflicts');
    setCopyFeedback('Conflicts Copied!');
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  if (!result) {
    return (
      <div className="h-full flex flex-col">
          <div className="flex-grow flex flex-col items-center justify-center text-slate-300 opacity-60">
             <div className="w-16 h-16 bg-slate-100 rounded-full mb-4"></div>
             <div className="w-2/3 h-4 bg-slate-100 rounded mb-2"></div>
             <div className="w-1/2 h-4 bg-slate-100 rounded"></div>
          </div>
          
          {/* Always show Footer buttons */}
          <div className="mt-auto pt-6 border-t border-slate-100 flex flex-col gap-4">
            <div className="flex justify-end gap-2">
                <button onClick={onSaveCase} disabled={true} className="px-4 py-2 bg-slate-200 text-slate-400 text-xs font-bold rounded cursor-not-allowed">
                    Save Case
                </button>
                <button 
                    type="button" 
                    onClick={onClearCase} 
                    className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded hover:bg-slate-50 hover:text-red-600"
                >
                    Clear Case
                </button>
            </div>
          </div>
      </div>
    );
  }

  // Filter active vs dismissed conflicts
  const activeConflicts = result.critical_conflicts.filter(c => !dismissedFlags[c.id]);
  const dismissedConflicts = result.critical_conflicts.filter(c => dismissedFlags[c.id]);

  // Organize missing info
  const missingByCat: Record<string, MissingInfo[]> = {};
  result.potentially_missing_information.forEach(m => {
    if (!missingByCat[m.category]) missingByCat[m.category] = [];
    missingByCat[m.category].push(m);
  });
  const missingCategories = ["Allergies", "Active Medications", "Vitals / Trends", "Pending Tests", "Follow-up Actions", "Code Status", "Other"];

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-2 pb-10 relative flex flex-col">
      {/* Toast Feedback */}
      {copyFeedback && (
          <div className="absolute top-0 right-0 z-50 bg-slate-800 text-white text-[10px] font-bold px-3 py-1 rounded shadow-lg animate-fade-in">
              {copyFeedback}
          </div>
      )}

      {/* ANALYSIS SECTION (Trajectory, Conflicts, Missing Info) */}
      <div className={`hidden sm:block ${activeMobileTab === 'Timeline' ? 'hidden' : 'block'}`}>
            {/* 1. Trajectory Summary & TTS */}
            <section>
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Patient Trajectory Summary</h2>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleCopySummary}
                            className="text-[10px] px-2 py-1 rounded border bg-white text-slate-500 border-slate-200 hover:bg-slate-50 flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            Copy
                        </button>
                        {window.speechSynthesis && (
                        <button 
                            onClick={handleTTS}
                            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-all ${speaking ? 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                            >
                            {speaking ? (
                                <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
                                Stop
                                </>
                            ) : (
                                <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                Read
                                </>
                            )}
                        </button>
                        )}
                    </div>
                </div>
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-md shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                    <span className="text-[9px] font-bold text-blue-400 uppercase">AI Generated</span>
                    <ConfidenceIcon level={result.analysis_confidence} />
                    </div>
                    <p className="text-sm text-slate-800 leading-relaxed font-medium">{result.patient_trajectory_summary}</p>
                    <div className="mt-3 flex gap-3 text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> {result.summary_stats?.high || 0} High Risk</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> {result.summary_stats?.medium || 0} Medium</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400"></span> {result.summary_stats?.low || 0} Low</span>
                    </div>
                </div>
            </section>

            {/* 2. Critical Conflicts */}
            <section className="mt-6">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Critical Conflicts Detected</h2>
                    <button 
                        onClick={handleCopyConflicts}
                        className="text-[10px] px-2 py-1 rounded border bg-white text-slate-500 border-slate-200 hover:bg-slate-50 flex items-center gap-1"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        Copy All
                    </button>
                </div>
                {result.critical_conflicts.length === 0 ? (
                <div className="p-4 bg-green-50 border border-green-100 rounded text-sm text-green-800 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    No critical conflicts detected.
                </div>
                ) : (
                <div>
                    {activeConflicts.length > 0 ? (
                        activeConflicts.map(c => (
                            <ConflictCard 
                                key={c.id} 
                                conflict={c} 
                                notes={notes} 
                                onDismiss={onDismiss}
                                isDismissed={false}
                                onViewSource={onViewSource}
                            />
                        ))
                    ) : (
                        <div className="text-xs text-slate-400 italic mb-2">No active conflicts.</div>
                    )}

                    {dismissedConflicts.length > 0 && (
                        <div className="mt-4">
                            <button 
                                onClick={() => setShowDismissed(!showDismissed)}
                                className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-2 hover:text-slate-600"
                            >
                                <svg className={`w-3 h-3 transform transition-transform ${showDismissed ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                Dismissed / Resolved ({dismissedConflicts.length})
                            </button>
                            {showDismissed && (
                                <div className="space-y-2">
                                    {dismissedConflicts.map(c => (
                                        <ConflictCard 
                                            key={c.id} 
                                            conflict={c} 
                                            notes={notes} 
                                            onDismiss={onDismiss}
                                            onRestore={onRestore}
                                            isDismissed={true}
                                            dismissalRecord={dismissedFlags[c.id]}
                                            onViewSource={onViewSource}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                )}
            </section>

            {/* 3. Missing Information */}
            <section className="mt-6">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Missing Information</h2>
                <div className="flex flex-wrap gap-1 mb-3">
                    {missingCategories.filter(c => missingByCat[c]).map(cat => (
                        <button 
                        key={cat} 
                        onClick={() => setActiveMissingCategory(cat)}
                        className={`text-[9px] px-2 py-1 rounded border transition-colors ${activeMissingCategory === cat ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                        {cat} ({missingByCat[cat].length})
                        </button>
                    ))}
                    <button onClick={() => setActiveMissingCategory("All")} className="text-[9px] px-2 py-1 rounded text-slate-500 hover:text-slate-800">Show All</button>
                </div>
                
                <div className="space-y-2">
                    {(activeMissingCategory === "All" ? result.potentially_missing_information : missingByCat[activeMissingCategory] || []).map(item => (
                    <div key={item.id} className="p-3 bg-white border border-slate-200 rounded shadow-sm hover:border-slate-300 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.category}</span>
                            {item.importance === 'HIGH' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
                        </div>
                        <p className="text-xs text-slate-800 font-medium mb-1">{item.description}</p>
                        
                        {/* Enhanced Context */}
                        <div className="mt-2 pt-2 border-t border-slate-50 space-y-1.5">
                            {item.why_it_matters && (
                                <div className="flex gap-1.5">
                                    <span className="text-[9px] text-slate-400 font-bold shrink-0">WHY:</span>
                                    <p className="text-[10px] text-slate-600 italic leading-tight">{item.why_it_matters}</p>
                                </div>
                            )}
                            {item.suggested_questions && item.suggested_questions.length > 0 && (
                                <div className="flex gap-1.5">
                                    <span className="text-[9px] text-slate-400 font-bold shrink-0">ASK:</span>
                                    <div className="text-[10px] text-blue-600">
                                        {item.suggested_questions.map((q, idx) => (
                                            <div key={idx} className="leading-tight">• {q}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    ))}
                    {result.potentially_missing_information.length === 0 && (
                    <div className="text-xs text-slate-400 italic">No missing information flagged.</div>
                    )}
                </div>
            </section>
      </div>

      {/* TIMELINE SECTION */}
      <div className={`hidden sm:block ${activeMobileTab === 'Timeline' ? 'block' : 'hidden'}`}>
            <section className="mt-6 sm:mt-0 sm:pt-0 border-t border-slate-200 pt-6 sm:border-0">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Patient Timeline</h2>
                <div className="relative pl-6 border-l-2 border-slate-100 space-y-8">
                    {result.timeline_events.map((evt, i) => {
                        let icon;
                        let borderColor = 'border-slate-200';
                        let bgClass = 'bg-white';
                        let badge;

                        // Distinct Icons & Styles per Severity
                        if (evt.is_conflict) {
                             borderColor = 'border-red-400';
                             bgClass = 'bg-red-50';
                             badge = <span className="text-[9px] font-bold text-red-600 uppercase tracking-wide bg-white px-1.5 py-0.5 rounded border border-red-200 ml-2">Conflict</span>;
                             icon = (
                                 <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white shadow-md z-10 border-4 border-white">
                                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                 </div>
                             );
                        } else if (evt.severity === 'HIGH') {
                             borderColor = 'border-l-4 border-l-red-500 border-slate-200';
                             bgClass = 'bg-red-50/50';
                             icon = (
                                 <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 shadow-sm z-10 border-4 border-white">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                 </div>
                             );
                        } else if (evt.severity === 'MEDIUM') {
                            borderColor = 'border-l-4 border-l-amber-400 border-slate-200';
                            bgClass = 'bg-amber-50/30';
                            icon = (
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm z-10 border-4 border-white">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                            );
                        } else {
                            borderColor = 'border-l-4 border-l-blue-400 border-slate-200';
                            icon = (
                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shadow-sm z-10 border-4 border-white">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                </div>
                            );
                        }

                        return (
                            <div key={i} className="relative group pl-3">
                                <div className="absolute -left-[38px] top-0">
                                    {icon}
                                </div>
                                <div className={`p-4 rounded border ${borderColor} ${bgClass} shadow-sm transition-all hover:shadow-md`}>
                                    <div className="flex items-center flex-wrap gap-2 mb-1.5">
                                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200 shadow-sm">{evt.time}</span>
                                        {badge}
                                        {evt.severity === 'HIGH' && !evt.is_conflict && <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-200">HIGH SEVERITY</span>}
                                    </div>
                                    <p className={`text-sm leading-snug ${evt.severity === 'HIGH' ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{evt.description}</p>
                                    
                                    <div className="mt-2 pt-2 border-t border-slate-100/50 flex justify-between items-center">
                                       <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                           <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                           Source: {notes.find(n => n.id === evt.source_id)?.label || 'Unknown'}
                                       </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
      </div>

      {/* Buttons: Save Current / Clear Case */}
      <div className="mt-auto pt-6 border-t border-slate-100 flex flex-col gap-4">
         <div className="flex justify-end gap-2">
             <button 
                onClick={onSaveCase} 
                disabled={isSaving} 
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 shadow-sm disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-2"
             >
                 {isSaving ? (
                     <>
                        <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                        Saving...
                     </>
                 ) : "Save Case"}
             </button>
             <button 
                type="button" 
                onClick={onClearCase} 
                className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded hover:bg-slate-50 hover:text-red-600"
             >
                 Clear Case
             </button>
         </div>
      </div>
    </div>
  );
};

export default AnalysisResults;
