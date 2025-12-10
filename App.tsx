import React, { useState, useEffect, ErrorInfo } from 'react';
import NoteInput from './components/NoteInput';
import AnalysisResults from './components/AnalysisResults';
import PatientHeader from './components/PatientHeader';
import { Note, AnalysisResult, DismissalRecord, PatientDetails, Case, CaseHistoryEvent } from './types';
import { DEMO_NOTES, DEMO_PATIENT, MAX_NOTES } from './constants';
import { analyzeNotes, runGeminiSelfTest, generateHandoffAudio } from './services/geminiService';
import { generatePDF } from './services/pdfService';
import { runUnitTests } from './services/testUtils';
import { storageService } from './services/storageService';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Simple Error Boundary
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-red-600 bg-red-50 min-h-screen flex flex-col items-center justify-center">
          <h1 className="text-xl font-bold mb-2">Something went wrong.</h1>
          <p className="text-sm mb-4">The application encountered a critical error.</p>
          <pre className="text-xs bg-red-100 p-2 rounded mb-4 max-w-lg overflow-auto">{this.state.error?.message}</pre>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700">Reload Application</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Toast Component
const Toast: React.FC<{ message: string, onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-[100] animate-fade-in">
       <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
       <span className="text-sm font-bold">{message}</span>
       <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">&times;</button>
    </div>
  );
};

const App: React.FC = () => {
  // --- State ---
  const [patientDetails, setPatientDetails] = useState<PatientDetails>({ id: '', name: '', age: '', location: '', encounterDate: '' });
  const [notes, setNotes] = useState<Note[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDemoTest, setShowDemoTest] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<'Checking' | 'OK' | 'FAIL' | null>(null);
  const [testResults, setTestResults] = useState<{passed: number, failed: number, logs: string[]} | null>(null);
  const [dismissedFlags, setDismissedFlags] = useState<Record<string, DismissalRecord>>({});
  const [validationErrors, setValidationErrors] = useState<{id?: boolean, encounterDate?: boolean}>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // resetKey is used to force re-render components (NoteInput, AnalysisResults) to clear their internal state
  const [resetKey, setResetKey] = useState(0);
  
  // Track modifications to prevent accidental data loss, but allow seamless switching between saved cases
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Case Management State
  const [cases, setCases] = useState<Case[]>([]);
  const [showCaseList, setShowCaseList] = useState(false);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [currentCaseHistory, setCurrentCaseHistory] = useState<CaseHistoryEvent[]>([]);
  
  // Advanced Search State
  const [caseSearchTerm, setCaseSearchTerm] = useState('');
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');
  const [searchMinSources, setSearchMinSources] = useState('');

  // Responsive State
  const [activeMobileTab, setActiveMobileTab] = useState('Sources'); // Sources | Analysis | Timeline
  const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(false);
  
  // UI Interaction State
  const [viewSourceId, setViewSourceId] = useState<string | null>(null);
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [editSourceContent, setEditSourceContent] = useState('');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Undo/Redo State for Source Editing
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(0);

  // Shared UI Class for Inputs (matching PatientHeader)
  const inputClass = "w-full text-sm bg-[#f7fafc] border border-slate-200 rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-slate-800 placeholder-slate-400 font-medium transition-colors";

  // Load cases on mount from secure storage
  useEffect(() => {
    storageService.loadCases().then(loaded => setCases(loaded));
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleAnalyze();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notes]);

  // History Debounce Logic
  useEffect(() => {
    if (!isEditingSource) return;
    const timeout = setTimeout(() => {
        if (historyStack.length > 0 && editSourceContent !== historyStack[historyStep]) {
            const newHistory = historyStack.slice(0, historyStep + 1);
            newHistory.push(editSourceContent);
            setHistoryStack(newHistory);
            setHistoryStep(newHistory.length - 1);
        }
    }, 800); // 800ms debounce
    return () => clearTimeout(timeout);
  }, [editSourceContent, isEditingSource, historyStack, historyStep]);

  // --- Audit Log Helper ---
  const logHistory = (action: string, details?: string) => {
      const event: CaseHistoryEvent = {
          timestamp: Date.now(),
          action,
          details
      };
      setCurrentCaseHistory(prev => [event, ...prev]);
  };

  // --- Actions ---

  const handlePatientDetailsChange = (details: PatientDetails) => {
    setPatientDetails(details);
    setHasUnsavedChanges(true);
  };

  const handleAddNote = (note: Note) => {
    if (notes.length >= MAX_NOTES) return;
    setNotes((prev) => [...prev, note]);
    setResult(null); 
    setHasUnsavedChanges(true);
    logHistory('NOTE_ADDED', `Type: ${note.type}, Label: ${note.label}`);
  };

  const handleRemoveNote = (id: string) => {
    const note = notes.find(n => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setResult(null);
    setHasUnsavedChanges(true);
    logHistory('NOTE_REMOVED', `Label: ${note?.label}`);
  };

  const handleDismissFlag = (rec: DismissalRecord) => {
    setDismissedFlags(prev => ({...prev, [rec.conflictId]: rec}));
    setHasUnsavedChanges(true);
    logHistory('FLAG_DISMISSED', `Reason: ${rec.reason}`);
  };

  const handleRestoreFlag = (id: string) => {
    const next = {...dismissedFlags};
    delete next[id];
    setDismissedFlags(next);
    setHasUnsavedChanges(true);
    logHistory('FLAG_RESTORED');
  };

  // RENAMED: handleResetCase - Performs a complete manual state reset
  const handleResetCase = () => {
    // If we have unsaved changes, confirm before wiping
    if (hasUnsavedChanges && !window.confirm("Start a new case? Any unsaved changes to the current case will be discarded.")) return;
    
    // 1. Reset Data Models
    setPatientDetails({ id: '', name: '', age: '', location: '', encounterDate: '' });
    setNotes([]);
    setResult(null);
    setDismissedFlags({});
    setValidationErrors({});
    
    // 2. Reset Session (Disconnect from any saved case)
    // CRITICAL: Setting currentCaseId to null ensures the next save creates a NEW record.
    setCurrentCaseId(null); 
    setCurrentCaseHistory([]);
    setHasUnsavedChanges(false);
    
    // 3. Reset UI States & History
    setError(null);
    setTestResults(null);
    setGeminiStatus(null);
    setIsAnalyzing(false);
    setIsSaving(false);
    setViewSourceId(null); // Close modal if open
    setHistoryStack([]);   // Clear undo history
    setIsSourcesCollapsed(false);
    
    // 4. Force Component Refresh (Input Fields, etc)
    setActiveMobileTab('Sources');
    setResetKey(prev => prev + 1);
    
    setToastMessage("Started new case.");
  }

  const handleAnalyze = async () => {
    // Validation
    const errors: {id?: boolean, encounterDate?: boolean} = {};
    if (!patientDetails.id?.trim()) errors.id = true;
    if (!patientDetails.encounterDate?.trim()) errors.encounterDate = true;
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
        alert("Please fill in the required Patient ID and Encounter Date fields.");
        return;
    }

    if (notes.length < 2) return;
    setIsAnalyzing(true);
    setError(null);
    logHistory('ANALYSIS_STARTED');
    // Auto-switch tab on mobile only
    if (window.innerWidth < 640) setActiveMobileTab('Analysis'); 
    
    try {
      const data = await analyzeNotes(notes);
      setResult(data);
      setHasUnsavedChanges(true); // Analysis creates new data that implies a change state
      logHistory('ANALYSIS_SUCCESS', `Conflicts: ${data.critical_conflicts.length}`);
    } catch (err: any) {
      setError(err.message || "Analysis service unavailable.");
      logHistory('ANALYSIS_FAILED', err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Case Management ---

  const saveCase = async () => {
    if (!patientDetails.id) {
        alert("Please enter a Patient ID before saving.");
        return;
    }
    setIsSaving(true);
    const caseName = `Case: ${patientDetails.id} (${patientDetails.encounterDate || 'No Date'})`;
    
    // Create history event for save
    const saveEvent: CaseHistoryEvent = {
        timestamp: Date.now(),
        action: currentCaseId ? 'CASE_UPDATED' : 'CASE_CREATED',
        details: `Saved by user.`
    };
    const updatedHistory = [saveEvent, ...currentCaseHistory];
    setCurrentCaseHistory(updatedHistory);

    // Construct the case object
    const caseData: Case = {
        id: currentCaseId || crypto.randomUUID(), // Use existing ID if updating, else new
        name: caseName,
        patientDetails,
        notes,
        result,
        dismissedFlags,
        timestamp: Date.now(),
        history: updatedHistory
    };
    
    try {
        let updatedCases;
        if (currentCaseId) {
            // Update existing case
            updatedCases = await storageService.updateCase(caseData);
            setToastMessage("Case updated successfully.");
        } else {
            // Create new case
            updatedCases = await storageService.saveCase(caseData);
            setCurrentCaseId(caseData.id); // Bind this session to the new ID
            setToastMessage("New case saved.");
        }
        setCases(updatedCases);
        setHasUnsavedChanges(false);
    } catch (e) {
        alert("Failed to save case.");
    } finally {
        setIsSaving(false);
    }
  };

  const loadCase = (c: Case) => {
      // User requested to visit saved cases regardless of unsaved changes.
      // Removed confirmation: if (hasUnsavedChanges && !window.confirm("Load case? Current unsaved data will be lost.")) return;
      
      // Restore full state
      setPatientDetails(c.patientDetails);
      setNotes(c.notes);
      setResult(c.result);
      setDismissedFlags(c.dismissedFlags);
      setCurrentCaseId(c.id); // Track that we are working on this specific case ID
      setCurrentCaseHistory(c.history || []); // Load history
      
      // Reset flags
      setHasUnsavedChanges(false);
      setShowCaseList(false);
      setValidationErrors({});
      setError(null);
      
      // Force UI reset (clears inputs, resets analysis view states)
      setResetKey(prev => prev + 1);

      // Log the load event locally (will be saved on next save)
      logHistory('CASE_LOADED', `Loaded from storage.`);
      setToastMessage(`Loaded case: ${c.name}`);
  };

  const deleteCase = async (id: string, e: React.MouseEvent) => {
      // IMPORTANT: Stop propagation to prevent triggering loadCase on the parent row
      e.stopPropagation();
      e.preventDefault();
      
      if (!window.confirm("Permanently delete this saved case?")) return;
      
      const updated = await storageService.deleteCase(id);
      setCases(updated);
      
      // If we deleted the currently active case, detach it so next save creates a new one
      if (currentCaseId === id) {
          setCurrentCaseId(null);
          setHasUnsavedChanges(true); // It becomes an unsaved working copy
          setToastMessage("Case deleted from storage (Working copy retained).");
          logHistory('STORAGE_DELETED', 'Case deleted from DB but active in session.');
      } else {
          setToastMessage("Case deleted.");
      }
  };

  // --- Test & Export ---

  const handleRunTest = async () => {
    if (notes.length > 0 && !window.confirm("Run test scenario? This will replace current inputs.")) return;
    
    // Set Demo Context
    setNotes(DEMO_NOTES);
    setPatientDetails(DEMO_PATIENT);
    setResult(null);
    setDismissedFlags({});
    setIsAnalyzing(true);
    setValidationErrors({});
    setCurrentCaseId(null); // Detach from DB for fresh test
    setCurrentCaseHistory([]);
    setResetKey(prev => prev + 1); // Force clear input state
    setHasUnsavedChanges(true);
    logHistory('TEST_SCENARIO_LOADED');
    
    if (window.innerWidth < 640) setActiveMobileTab('Analysis');
    
    try {
      const data = await analyzeNotes(DEMO_NOTES);
      setResult(data);
    } catch (e: any) {
      setError("Test Failed: " + e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runDiagnostics = async () => {
    setGeminiStatus('Checking');
    // Run Unit Tests
    const unitTestRes = await runUnitTests();
    setTestResults(unitTestRes);

    // Run Gemini Connection Test
    const result = await runGeminiSelfTest();
    setGeminiStatus(result.status);
    
    if (result.status === 'FAIL') alert(`Diagnostics Failed: ${result.message}`);
  };

  // --- Generate Dummy Image for OCR Test (Modified for Demo Conflict) ---
  const handleGenerateTestImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw background (Paper)
    ctx.fillStyle = '#fdfbf7'; 
    ctx.fillRect(0, 0, 500, 350);

    // Draw lines
    ctx.strokeStyle = '#cce3f0'; // Light blue lines
    ctx.lineWidth = 1;
    for(let i=50; i<350; i+=35) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(500, i);
        ctx.stroke();
    }

    // Header
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.fillStyle = '#333';
    ctx.fillText("Cardiology Consult Note", 20, 30);
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText("Patient: A. Rivera", 350, 30);

    // Simulated Handwriting
    // Using a few different font styles/offsets to look slightly organic
    ctx.font = '24px "Comic Sans MS", cursive, sans-serif';
    ctx.fillStyle = '#1a237e'; // Blue ink
    
    ctx.fillText("Impression: Gastritis / GERD", 20, 80);
    ctx.fillText("Unlikely cardiac etiology.", 20, 120);
    
    // THE CONFLICT
    ctx.fillStyle = '#b71c1c'; // Red ink for emphasis
    ctx.font = 'bold 26px "Comic Sans MS", cursive, sans-serif';
    ctx.fillText("PLAN: STOP HEPARIN", 20, 180);
    
    ctx.fillStyle = '#1a237e'; // Back to blue
    ctx.font = '22px "Comic Sans MS", cursive, sans-serif';
    ctx.fillText("Monitor for GI bleeding.", 20, 230);
    ctx.fillText("Signed, Dr. Cardio", 250, 300);

    // Download
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'Cardiology_Consult_Handwritten.png';
    a.click();
  };

  // --- Generate Dummy Audio for Transcription Test (Modified for Demo Conflict) ---
  const handleGenerateTestAudio = async () => {
    try {
        const blob = await generateHandoffAudio();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Nurse_Handoff_Recording.wav';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e: any) {
        console.error("Audio Gen Failed", e);
        alert("Failed to generate test audio: " + e.message);
    }
  };

  const handleExportJSON = () => {
    if (!result) return;
    const exportData = { 
      patient: patientDetails,
      notes, 
      result, 
      dismissedFlags, 
      history: currentCaseHistory, 
      exportDate: new Date().toISOString() 
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `handoff_report_${patientDetails.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportPDF = () => {
    if (!result) return;
    try {
      generatePDF(result, notes, dismissedFlags, patientDetails);
    } catch (e) {
      console.error("PDF Generation failed", e);
      alert("Failed to generate PDF. Please try JSON export.");
    }
  };

  // --- Drag and Drop ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedNoteId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedNoteId || draggedNoteId === id) return;
    const sourceIndex = notes.findIndex(n => n.id === draggedNoteId);
    const targetIndex = notes.findIndex(n => n.id === id);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const newNotes = [...notes];
    const [removed] = newNotes.splice(sourceIndex, 1);
    newNotes.splice(targetIndex, 0, removed);
    setNotes(newNotes);
    setHasUnsavedChanges(true); // Reordering is a change
  };

  const handleDragEnd = () => {
    setDraggedNoteId(null);
  };

  // --- Source Editing ---
  const handleViewSource = (id: string) => {
      setViewSourceId(id);
      setIsEditingSource(false);
      const content = notes.find(n => n.id === id)?.content || '';
      setEditSourceContent(content);
      // Initialize History
      setHistoryStack([content]);
      setHistoryStep(0);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const prevStep = historyStep - 1;
      setHistoryStep(prevStep);
      setEditSourceContent(historyStack[prevStep]);
    }
  };

  const handleRedo = () => {
    if (historyStep < historyStack.length - 1) {
      const nextStep = historyStep + 1;
      setHistoryStep(nextStep);
      setEditSourceContent(historyStack[nextStep]);
    }
  };

  const saveSourceEdit = () => {
      if (!viewSourceId) return;
      const updatedNotes = notes.map(n => 
          n.id === viewSourceId ? { ...n, content: editSourceContent } : n
      );
      setNotes(updatedNotes);
      setHasUnsavedChanges(true);
      logHistory('NOTE_EDITED', `Modified content of note ${viewSourceId}`);
      setIsEditingSource(false);
      setResult(null); // Invalidate analysis
  };

  // Filter cases logic
  const filteredCases = cases.filter(c => {
      const matchText = c.name.toLowerCase().includes(caseSearchTerm.toLowerCase()) || 
                        c.patientDetails.id.toLowerCase().includes(caseSearchTerm.toLowerCase());
      
      let matchDate = true;
      if (searchStartDate) matchDate = matchDate && c.timestamp >= new Date(searchStartDate).getTime();
      if (searchEndDate) matchDate = matchDate && c.timestamp <= new Date(searchEndDate).getTime() + 86400000; // End of day

      let matchSource = true;
      if (searchMinSources) matchSource = c.notes.length >= parseInt(searchMinSources);

      return matchText && matchDate && matchSource;
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col">
      <ErrorBoundary>
        {/* 1. Global Safety Banner */}
        <div className="bg-slate-900 text-white text-center py-2 text-[10px] font-bold uppercase tracking-widest z-50 sticky top-0 shadow-md">
          ⚠️ Clinical Decision Support Tool • Not For Diagnostic Use • Verify All Output
        </div>

        {/* Header */}
        <header className="bg-white border-b border-slate-200 shadow-sm z-40 relative">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-md">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M8 12h8" />
                    <path d="M12 8v8" />
                  </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">Synapse</h1>
                <div className="flex gap-2 items-center">
                  <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wide">Intelligent Patient Safety</p>
                  {hasUnsavedChanges && <span className="text-[9px] text-amber-500 font-bold px-1.5 py-0.5 bg-amber-50 rounded-full border border-amber-100">Unsaved Changes</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDemoTest(!showDemoTest)} className="text-[10px] text-slate-500 font-bold hover:text-blue-600 mr-2 hidden sm:inline border border-slate-200 px-2 py-1 rounded bg-slate-50">
                  {showDemoTest ? 'Hide Test Panel' : 'Show Test Panel'}
              </button>
              
              {/* Case Manager Dropdown */}
              <div className="relative">
                  <button 
                      onClick={() => { 
                          setShowCaseList(!showCaseList); 
                          setCaseSearchTerm(''); 
                          setSearchStartDate('');
                          setSearchEndDate('');
                          setSearchMinSources('');
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1"
                  >
                      Saved Cases ({cases.length})
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showCaseList && (
                      <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
                          <div className="p-2 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Local Database</span>
                              <button onClick={() => setShowCaseList(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                          </div>
                          
                          {/* Advanced Search Filters - Styled to match Patient Context */}
                          <div className="p-4 border-b border-slate-100 bg-white space-y-3">
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Search Cases</label>
                                  <div className="relative">
                                      <input 
                                          type="text" 
                                          placeholder="Filter by ID or Name..."
                                          value={caseSearchTerm}
                                          onChange={(e) => setCaseSearchTerm(e.target.value)}
                                          className={inputClass}
                                      />
                                      <svg className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                  </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Start Date</label>
                                      <input 
                                          type="date" 
                                          className={inputClass}
                                          value={searchStartDate} 
                                          onChange={e => setSearchStartDate(e.target.value)} 
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">End Date</label>
                                      <input 
                                          type="date" 
                                          className={inputClass} 
                                          value={searchEndDate} 
                                          onChange={e => setSearchEndDate(e.target.value)} 
                                      />
                                  </div>
                              </div>
                              
                              <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Min Sources</label>
                                  <input 
                                      type="number" 
                                      min="0" 
                                      className={inputClass} 
                                      placeholder="e.g. 2" 
                                      value={searchMinSources} 
                                      onChange={e => setSearchMinSources(e.target.value)} 
                                  />
                              </div>
                          </div>

                          <div className="max-h-64 overflow-y-auto">
                              {filteredCases.length === 0 && <div className="p-8 text-xs text-slate-400 text-center italic">No matching cases found.</div>}
                              {filteredCases.map(c => {
                                  // Dynamically calculate risk counts from conflicts list for display
                                  // UPDATED: Calculate stats using ONLY active (non-dismissed) conflicts to reflect current state
                                  const high = c.result?.critical_conflicts?.filter(x => x.severity === 'HIGH' && !c.dismissedFlags[x.id]).length || 0;
                                  const med = c.result?.critical_conflicts?.filter(x => x.severity === 'MEDIUM' && !c.dismissedFlags[x.id]).length || 0;
                                  return (
                                  <div key={c.id} onClick={() => loadCase(c)} className={`p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 group transition-colors ${currentCaseId === c.id ? 'bg-blue-50/50' : ''}`}>
                                      <div className="flex justify-between items-start">
                                          <div className="flex-1">
                                              <div className="font-bold text-sm text-slate-700 truncate">{c.name}</div>
                                              <div className="text-[10px] text-slate-500 mt-1 flex gap-2 items-center">
                                                  <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                                                  <span>•</span>
                                                  <span>{c.notes.length} srcs</span>
                                                  {c.result && (
                                                      <>
                                                      <span>•</span>
                                                      <span className={`font-bold ${high > 0 ? 'text-red-500' : 'text-slate-400'}`}>{high} High / {med} Med</span>
                                                      </>
                                                  )}
                                              </div>
                                          </div>
                                          {/* Removed Delete button from UI as requested */}
                                      </div>
                                  </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}
              </div>
            </div>
          </div>
        </header>

        {/* Demo Test Panel */}
        {showDemoTest && (
          <div className="bg-slate-800 text-slate-200 border-b border-slate-700 animate-fade-in shadow-inner">
            <div className="max-w-screen-2xl mx-auto p-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                      <strong className="text-white text-sm">System Diagnostics & Demo</strong>
                      {geminiStatus === 'Checking' && <span className="text-[10px] text-yellow-400 font-mono animate-pulse">CHECKING API...</span>}
                      {geminiStatus === 'OK' && <span className="text-[10px] text-green-400 font-mono font-bold">API CONNECTED</span>}
                      {geminiStatus === 'FAIL' && <span className="text-[10px] text-red-400 font-mono font-bold">API ERROR</span>}
                  </div>
                  {testResults && (
                    <div className="text-[10px] flex gap-3 text-slate-300">
                        <span className="text-green-400">PASSED: {testResults.passed}</span>
                        <span className={testResults.failed > 0 ? "text-red-400" : "text-slate-400"}>FAILED: {testResults.failed}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Tools to generate test assets for demo purposes.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={handleGenerateTestImage} className="text-xs text-slate-300 hover:text-white border border-slate-600 px-3 py-1.5 rounded bg-slate-700/50 whitespace-nowrap">
                      Download "Stop Heparin" Scan
                    </button>
                    <button onClick={handleGenerateTestAudio} className="text-xs text-slate-300 hover:text-white border border-slate-600 px-3 py-1.5 rounded bg-slate-700/50 whitespace-nowrap">
                      Download "Heparin Running" Audio
                    </button>
                    <button onClick={runDiagnostics} className="text-xs text-blue-300 hover:text-white underline decoration-dotted whitespace-nowrap">Run System Health Check</button>
                    <button onClick={handleRunTest} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold text-xs shadow-md transition-colors flex items-center gap-2 whitespace-nowrap">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Run Full Test Scenario
                    </button>
                </div>
            </div>
          </div>
        )}

        <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full">
          
          {/* Patient Header */}
          <PatientHeader details={patientDetails} onChange={handlePatientDetailsChange} validationErrors={validationErrors} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            
            {/* Mobile Navigation Tabs */}
            <div className="sm:hidden col-span-1 bg-white border border-slate-200 rounded-lg p-1 flex mb-4 shadow-sm sticky top-16 z-30">
              {['Sources', 'Analysis', 'Timeline'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveMobileTab(tab)}
                    className={`flex-1 py-2 text-xs font-bold rounded ${activeMobileTab === tab ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    {tab}
                  </button>
              ))}
            </div>

            {/* LEFT: Clinical Sources */}
            <div className={`
              lg:col-span-4 flex flex-col gap-6
              ${activeMobileTab === 'Sources' ? 'flex' : 'hidden sm:flex'}
            `}>
              
              {/* Tablet Collapsible Header */}
              <div className="hidden sm:flex lg:hidden justify-between items-center bg-white p-3 rounded border border-slate-200 cursor-pointer" onClick={() => setIsSourcesCollapsed(!isSourcesCollapsed)}>
                <span className="font-bold text-sm text-slate-700">Clinical Sources ({notes.length})</span>
                <svg className={`w-5 h-5 text-slate-400 transform transition-transform ${isSourcesCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>

              <div className={`${isSourcesCollapsed ? 'hidden lg:flex' : 'flex'} flex-col gap-6`}>
                  <NoteInput key={resetKey} onAddNote={handleAddNote} noteCount={notes.length} />

                  <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-end border-b border-slate-200 pb-1">
                      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Source List</h2>
                      <span className="text-[10px] font-mono text-slate-500">
                          {notes.length} Added
                      </span>
                  </div>
                  
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {notes.length === 0 && (
                      <div className="py-8 px-4 text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                          <p className="text-xs font-medium text-slate-400">No sources added.</p>
                          <p className="text-[10px] text-slate-400 mt-1">Use the input above to add text, scans, or voice notes.</p>
                      </div>
                      )}
                      {notes.map((note) => (
                      <div 
                          key={note.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, note.id)}
                          onDragOver={(e) => handleDragOver(e, note.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleViewSource(note.id)}
                          className={`group bg-white p-3 rounded-lg border shadow-sm transition-all relative cursor-pointer
                          ${draggedNoteId === note.id ? 'opacity-50 border-blue-400 border-dashed' : 'border-slate-200 hover:border-blue-400 hover:shadow-md'}
                          `}
                      >
                          <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                              <span className="cursor-move text-slate-300 hover:text-slate-500 p-1">
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" /></svg>
                              </span>
                              <span className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white
                                  ${note.type === 'text' ? 'bg-slate-500' : note.type === 'image' ? 'bg-indigo-500' : 'bg-red-500'}
                              `}>
                                  {note.type === 'text' ? 'T' : note.type === 'image' ? 'I' : 'A'}
                              </span>
                              <span className="text-sm font-bold text-slate-800 truncate max-w-[140px]">{note.label}</span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveNote(note.id); }} className="text-slate-300 hover:text-red-500 p-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mb-2 h-8 leading-4 font-mono bg-slate-50 p-1 rounded">
                          {note.content}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <div className="flex gap-2 items-center">
                                  <span>{new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  {note.confidence !== undefined && note.type !== 'text' && (
                                      <span className={`px-1 rounded ${note.confidence > 80 ? 'text-green-600 bg-green-50' : 'text-amber-500 bg-amber-50'} font-bold`}>
                                          {note.confidence}% Conf.
                                      </span>
                                  )}
                            </div>
                            <span className="text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Click to view</span>
                          </div>
                      </div>
                      ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-200">
                      <button
                      onClick={handleAnalyze}
                      disabled={notes.length < 2 || isAnalyzing}
                      className={`w-full py-3 px-4 rounded-lg shadow-sm text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
                          ${notes.length < 2 || isAnalyzing 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                          : 'bg-blue-700 text-white hover:bg-blue-800 shadow-md transform active:translate-y-0.5'}
                      `}
                      >
                      {isAnalyzing ? (
                          <>
                          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                          Checking Safety...
                          </>
                      ) : (
                          "Analyze Handoff"
                      )}
                      </button>
                  </div>
                  </div>
              </div>
            </div>

            {/* RIGHT: Analysis Report */}
            <div className={`
              lg:col-span-8 lg:h-full min-h-[500px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden
              hidden sm:flex
            `}>
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Analysis Report</h2>
                    <p className="text-xs text-slate-500">AI-generated decision support • Gemini 3 Pro</p>
                  </div>
                  {result && (
                    <div className="flex items-center gap-2">
                      <button onClick={handleExportPDF} className="text-xs font-bold text-slate-600 bg-white border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 shadow-sm flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        PDF
                      </button>
                      <button onClick={handleExportJSON} className="text-xs font-bold text-blue-700 bg-white border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-50 shadow-sm flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        JSON
                      </button>
                    </div>
                  )}
              </div>

              <div className="flex-grow p-6 overflow-hidden bg-white">
                  {error ? (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                      <strong>Analysis Error:</strong> {error}
                      <div className="mt-2 text-xs opacity-75">
                        Troubleshooting: Check Test Panel for Gemini connection status. If model "gemini-3-pro-preview" is unavailable, the system automatically falls back to flash models.
                      </div>
                    </div>
                  ) : (
                    <AnalysisResults 
                      key={resetKey}
                      result={result} 
                      notes={notes} 
                      dismissedFlags={dismissedFlags}
                      onDismiss={handleDismissFlag}
                      onRestore={handleRestoreFlag}
                      activeMobileTab={activeMobileTab}
                      onViewSource={handleViewSource}
                      onSaveCase={saveCase}
                      onClearCase={handleResetCase}
                      isSaving={isSaving}
                    />
                  )}
              </div>
              
              {/* Footer Info */}
              <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400 text-center flex justify-between items-center">
                  <span>Local Device Storage • Encrypted</span>
                  {currentCaseHistory.length > 0 && (
                      <button onClick={() => setShowHistoryModal(true)} className="flex items-center gap-1 hover:text-blue-600">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          History Log
                      </button>
                  )}
              </div>
            </div>

          </div>
        </main>

        {/* Toast Notification */}
        {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

        {/* History Log Modal */}
        {showHistoryModal && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)}>
                <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[70vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">Case History Log</h3>
                        <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                    </div>
                    <div className="flex-grow overflow-y-auto p-4">
                        {currentCaseHistory.length === 0 ? (
                            <div className="text-center text-slate-400 text-sm py-8">No history recorded yet.</div>
                        ) : (
                            <div className="relative border-l border-slate-200 ml-3 space-y-4">
                                {currentCaseHistory.map((evt, idx) => (
                                    <div key={idx} className="relative pl-4">
                                        <div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-blue-100 border border-blue-500 rounded-full"></div>
                                        <div className="text-[10px] text-slate-400 font-mono mb-0.5">{new Date(evt.timestamp).toLocaleString()}</div>
                                        <div className="text-sm font-bold text-slate-700">{evt.action.replace('_', ' ')}</div>
                                        {evt.details && <div className="text-xs text-slate-500 mt-0.5">{evt.details}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* View Source Modal (Now with Undo/Redo) */}
        {viewSourceId && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewSourceId(null)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <div>
                      <h3 className="font-bold text-slate-800 text-lg">{notes.find(n => n.id === viewSourceId)?.label}</h3>
                      <p className="text-xs text-slate-500">
                          {notes.find(n => n.id === viewSourceId)?.type.toUpperCase()} Source • {new Date(notes.find(n => n.id === viewSourceId)?.timestamp || 0).toLocaleString()}
                      </p>
                  </div>
                  <button onClick={() => setViewSourceId(null)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6 overflow-y-auto">
                  <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Extracted Content</span>
                          {!isEditingSource ? (
                              <button onClick={() => setIsEditingSource(true)} className="text-[10px] text-blue-600 hover:underline font-bold">Edit Content</button>
                          ) : (
                              <div className="flex gap-2 items-center">
                                  {/* Undo/Redo Controls */}
                                  <div className="flex mr-3 bg-slate-100 rounded border border-slate-200">
                                      <button 
                                          onClick={handleUndo} 
                                          disabled={historyStep <= 0}
                                          className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 border-r border-slate-200"
                                          title="Undo"
                                      >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                      </button>
                                      <button 
                                          onClick={handleRedo} 
                                          disabled={historyStep >= historyStack.length - 1}
                                          className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                                          title="Redo"
                                      >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                                      </button>
                                  </div>
                                  
                                  <button onClick={() => setIsEditingSource(false)} className="text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
                                  <button onClick={saveSourceEdit} className="text-[10px] text-green-600 hover:text-green-700 font-bold">Save Changes</button>
                              </div>
                          )}
                      </div>
                      
                      {isEditingSource ? (
                          <textarea
                              value={editSourceContent}
                              onChange={(e) => setEditSourceContent(e.target.value)}
                              // Exact match to NoteInput styling
                              className="w-full text-sm bg-[#f7fafc] border border-slate-200 rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-slate-800 placeholder-slate-400 resize-none font-sans leading-relaxed min-h-[200px]"
                          />
                      ) : (
                          <pre className="whitespace-pre-wrap text-sm font-mono text-slate-800 bg-slate-50 p-4 rounded-lg border border-slate-200 leading-relaxed">
                              {notes.find(n => n.id === viewSourceId)?.content}
                          </pre>
                      )}
                  </div>
                  
                  {notes.find(n => n.id === viewSourceId)?.originalFile && (
                    <div className="mt-6 border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-3">Original Media Input</p>
                        {notes.find(n => n.id === viewSourceId)?.type === 'image' && (
                          <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
                              <img src={`data:${notes.find(n => n.id === viewSourceId)?.mimeType};base64,${notes.find(n => n.id === viewSourceId)?.originalFile}`} alt="Original" className="max-w-full h-auto mx-auto" />
                          </div>
                        )}
                        {notes.find(n => n.id === viewSourceId)?.type === 'audio' && (
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <audio controls src={`data:${notes.find(n => n.id === viewSourceId)?.mimeType};base64,${notes.find(n => n.id === viewSourceId)?.originalFile}`} className="w-full" />
                          </div>
                        )}
                    </div>
                  )}
                  
                  {notes.find(n => n.id === viewSourceId)?.confidence !== undefined && (
                      <div className="mt-4 flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">Ingestion Confidence:</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${notes.find(n => n.id === viewSourceId)!.confidence! > 80 ? "text-green-700 bg-green-100" : "text-amber-700 bg-amber-100"}`}>
                              {notes.find(n => n.id === viewSourceId)?.confidence}%
                          </span>
                      </div>
                  )}
                </div>
                <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                  <button onClick={() => setViewSourceId(null)} className="px-6 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-100 shadow-sm transition-colors">Close Viewer</button>
                </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default App;