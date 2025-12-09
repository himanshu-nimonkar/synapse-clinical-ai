
import React, { useState, useRef, useEffect } from 'react';
import { Note } from '../types';
import { processMedia } from '../services/geminiService';
import { validateClinicalContent } from '../services/securityService';

interface NoteInputProps {
  onAddNote: (note: Note) => void;
  noteCount: number;
}

const NoteInput: React.FC<NoteInputProps> = ({ onAddNote, noteCount }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'audio'>('text');
  
  // Generic State
  const [label, setLabel] = useState(`Source ${noteCount + 1}`);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Text State
  const [text, setText] = useState('');
  
  // Media State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tempMedia, setTempMedia] = useState<{ blob: Blob, mimeType: string, url: string } | null>(null);
  const [transcription, setTranscription] = useState('');
  const [confidence, setConfidence] = useState(100);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Shared styles for the input box - Exportable if needed, but keeping inline for consistency
  const inputBoxClass = "w-full text-sm bg-[#f7fafc] border border-slate-200 rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-slate-800 placeholder-slate-400 resize-none font-sans leading-relaxed";
  const containerClasses = "flex-grow flex flex-col h-full relative"; // Added relative for overlay

  // Broad file acceptance lists
  const ACCEPTED_IMAGE_TYPES = "image/png, image/jpeg, image/jpg, image/webp, image/heic, image/bmp, image/gif";
  const ACCEPTED_AUDIO_TYPES = "audio/mpeg, audio/wav, audio/webm, audio/ogg, audio/x-m4a, audio/mp4, audio/aac, video/mp4, video/webm"; 

  useEffect(() => {
    setLabel(`Source ${noteCount + 1}`);
  }, [noteCount]);

  const resetForm = () => {
    setText('');
    setTempMedia(null);
    setTranscription('');
    setProcessing(false);
    setIsRecording(false);
    setRecordingTime(0);
    setIsDragging(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // --- Handlers ---

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    if (!validateClinicalContent(text)) {
        alert("Input invalid. Please enter substantial clinical text.");
        return;
    }

    onAddNote({
      id: crypto.randomUUID(),
      type: 'text',
      content: text,
      label: label,
      timestamp: Date.now(),
      status: 'ready'
    });
    resetForm();
  };

  const processFile = async (file: File) => {
      // Looser type checking to support more variations
      const isImage = file.type.startsWith('image/');
      const isAudio = file.type.startsWith('audio/') || file.type.startsWith('video/'); // video/ used for some audio containers like webm/mp4
      
      // Auto-switch tabs based on file type if needed, or validate against current tab
      if (activeTab === 'text') {
          // If user drops a file on text tab, auto-switch
          if (isImage) setActiveTab('image');
          else if (isAudio) setActiveTab('audio');
          else { alert("Unsupported file type. Please upload an Image or Audio file."); return; }
      } else {
          if (activeTab === 'image' && !isImage) { alert("Please drop an image file."); return; }
          if (activeTab === 'audio' && !isAudio) { alert("Please drop an audio file."); return; }
      }

      const url = URL.createObjectURL(file);
      setTempMedia({ blob: file, mimeType: file.type, url });
      
      setProcessing(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const task = (isImage || activeTab === 'image') ? 'ocr' : 'transcribe';
          const result = await processMedia(base64, file.type, task);
          setTranscription(result.text);
          setConfidence(result.confidence);
        } catch (err) {
          console.error(err);
          setTranscription(`Error: Could not ${activeTab === 'image' ? 'extract text' : 'transcribe audio'}.`);
        } finally {
          setProcessing(false);
        }
      };
      reader.readAsDataURL(file);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Robust Drag and Drop Handlers
  const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Check if we are really leaving the container
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
  };


  const startRecording = async () => {
    // Basic check for secure context or localhost
    if (!navigator.mediaDevices) {
        alert("Audio recording is not supported in this environment (likely due to HTTP vs HTTPS).");
        return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setTempMedia({ blob, mimeType: 'audio/webm', url });
        stream.getTracks().forEach(t => t.stop());
        
        // Auto process
        setProcessing(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const result = await processMedia(base64, 'audio/webm', 'transcribe');
            setTranscription(result.text);
            setConfidence(result.confidence);
          } catch (err) {
            setTranscription("Error: Transcription failed.");
          } finally {
            setProcessing(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleMediaSubmit = () => {
    if (!tempMedia) return;
    
    if (!validateClinicalContent(transcription)) {
        alert("Transcription invalid or too short. Please review.");
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(tempMedia.blob);
    reader.onloadend = () => {
      onAddNote({
        id: crypto.randomUUID(),
        type: activeTab,
        content: transcription,
        originalFile: (reader.result as string).split(',')[1],
        mimeType: tempMedia.mimeType,
        label: label,
        timestamp: Date.now(),
        status: 'ready',
        confidence: confidence
      });
      resetForm();
    };
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px] relative transition-colors"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      {/* Global Drag Overlay */}
      {isDragging && (
          <div className="absolute inset-0 bg-blue-50/95 z-50 border-2 border-blue-500 border-dashed rounded-xl flex flex-col items-center justify-center animate-fade-in pointer-events-none">
              <svg className="w-16 h-16 text-blue-500 mb-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <h3 className="text-xl font-bold text-blue-700">Drop File to Upload</h3>
              <p className="text-blue-500 font-medium mt-2">Supports Images (JPG, PNG) and Audio (MP3, WAV, M4A)</p>
          </div>
      )}

      {/* Header Tabs - Equal Width */}
      <div className="bg-slate-50 border-b border-slate-200 p-2">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">Add Clinical Input</h3>
        <div className="flex bg-slate-200/50 p-1 rounded-lg">
          {[
            { id: 'text', label: 'Text Note', icon: 'M4 6h16M4 12h16m-7 6h7' },
            { id: 'image', label: 'Scan / Photo', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'audio', label: 'Voice Handoff', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); resetForm(); }}
              className={`flex-1 flex items-center justify-center py-2 rounded-md text-xs font-bold transition-all ${
                activeTab === tab.id 
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <svg className="w-3.5 h-3.5 mr-1.5 lg:inline hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col overflow-hidden">
        {/* Source Label */}
        <div className="mb-3 shrink-0">
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Source Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full text-sm bg-[#f7fafc] border border-slate-200 rounded-md focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-slate-800 placeholder-slate-400 font-medium"
            placeholder="e.g. ED Resident Note"
          />
        </div>

        <div className="flex-grow min-h-0 flex flex-col relative">
            {/* Text Input Mode */}
            {activeTab === 'text' && (
            <form onSubmit={handleTextSubmit} className={containerClasses}>
                <div className="relative mb-3 flex-grow h-full">
                <textarea
                    className={`${inputBoxClass} h-full`}
                    placeholder="Paste clinical note content here..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 font-mono bg-white/80 px-1 rounded">
                    {text.length} chars
                </div>
                {text.length > 0 && (
                    <button 
                    type="button" 
                    onClick={() => setText('')}
                    className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 bg-white rounded-full p-0.5"
                    >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}
                </div>
                <button
                type="submit"
                disabled={!text.trim()}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm shrink-0"
                >
                Add Text Source
                </button>
            </form>
            )}

            {/* Image Input Mode */}
            {activeTab === 'image' && (
            <div className={containerClasses}>
                {!tempMedia ? (
                <div className={`text-center border-2 border-dashed rounded-lg transition-all bg-[#f7fafc] flex-grow flex flex-col items-center justify-center p-6 mb-3 relative border-slate-300 hover:bg-slate-50`}>
                    <input type="file" ref={fileInputRef} className="hidden" accept={ACCEPTED_IMAGE_TYPES} onChange={handleFileUpload} id="file-upload" />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
                    <div className="h-12 w-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-3 shadow-sm border border-indigo-100">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2H6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <span className="text-sm text-indigo-700 font-bold hover:underline">Upload Scan or Photo</span>
                    <p className="text-xs text-slate-500 mt-2 text-center max-w-[200px]">Drag & drop or click to upload.</p>
                    <p className="text-[10px] text-slate-400 mt-1">JPG, PNG, HEIC, WEBP, BMP</p>
                    </label>
                </div>
                ) : (
                <div className="space-y-3 animate-fade-in flex-grow flex flex-col min-h-0 h-full">
                    {/* Proper Image Preview Window */}
                    <div className="w-full h-1/2 min-h-[150px] bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 relative">
                        <img 
                            src={tempMedia.url} 
                            alt="Preview" 
                            className="max-w-full max-h-full object-contain" 
                        />
                        <button 
                            onClick={() => setTempMedia(null)}
                            className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors"
                            title="Remove Image"
                        >
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-1.5 shrink-0">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">OCR Extraction</label>
                            {processing ? (
                            <span className="text-[10px] text-blue-500 flex items-center gap-1 font-bold">
                                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                                Extracting...
                            </span>
                            ) : (
                            <span 
                                title="Higher confidence means the text extracted closely matches the image content."
                                className={`text-[10px] font-bold flex items-center gap-1 ${confidence > 80 ? 'text-green-600' : confidence > 50 ? 'text-amber-500' : 'text-red-500'}`}
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                {confidence}% Confidence
                            </span>
                            )}
                        </div>
                        <textarea
                            disabled={processing}
                            value={transcription}
                            onChange={(e) => setTranscription(e.target.value)}
                            className={`${inputBoxClass} h-full`}
                            placeholder="OCR result will appear here. Correct any errors."
                        />
                    </div>

                    <div className="flex gap-2 shrink-0">
                    <button onClick={resetForm} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                    <button onClick={handleMediaSubmit} disabled={processing || !transcription} className="flex-1 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors">Add Scan Source</button>
                    </div>
                </div>
                )}
            </div>
            )}

            {/* Audio Input Mode */}
            {activeTab === 'audio' && (
            <div className={containerClasses}>
                {!tempMedia && (
                <div className={`text-center py-6 border-2 border-dashed rounded-lg transition-all bg-[#f7fafc] flex-grow flex flex-col items-center justify-center mb-3 relative ${isRecording ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}>
                    
                    {isRecording ? (
                    <div className="flex flex-col items-center">
                        <div className="text-4xl font-mono font-bold text-red-600 mb-4">{formatTime(recordingTime)}</div>
                        <button onClick={stopRecording} className="bg-red-600 text-white px-8 py-3 rounded-full font-bold text-sm shadow-md hover:bg-red-700 animate-pulse transform active:scale-95 transition-all">
                        Stop Recording
                        </button>
                        <p className="text-[10px] text-red-400 mt-4 font-bold uppercase tracking-widest">Recording Live</p>
                    </div>
                    ) : (
                    <div className="flex flex-col items-center">
                        <button onClick={startRecording} className="h-16 w-16 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 mb-4 transition-transform transform active:scale-95">
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        </button>
                        <span className="text-sm text-slate-700 font-bold">Record Voice Handoff</span>
                        <p className="text-xs text-slate-400 mt-1">Or drag & drop audio file (auto-transcribed)</p>
                        <div className="mt-2 text-[9px] text-slate-300">
                             <input type="file" ref={fileInputRef} className="hidden" accept={ACCEPTED_AUDIO_TYPES} onChange={handleFileUpload} id="audio-upload" />
                             <label htmlFor="audio-upload" className="cursor-pointer hover:text-blue-500">
                                Click to Upload (MP3, WAV, M4A)
                             </label>
                        </div>
                    </div>
                    )}
                </div>
                )}

                {tempMedia && (
                <div className="space-y-3 animate-fade-in flex-grow flex flex-col min-h-0 h-full">
                    <div className="bg-slate-100 rounded-lg p-3 flex items-center gap-3 border border-slate-200 shrink-0">
                        <audio src={tempMedia.url} controls className="w-full h-8" />
                    </div>
                    <div className="flex-grow flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-1.5 shrink-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Transcription</label>
                        {processing ? (
                            <span className="text-[10px] text-blue-500 font-bold animate-pulse">Transcribing...</span>
                        ) : (
                            <span 
                                title="Confidence in audio transcription accuracy. Low confidence suggests background noise or unclear speech."
                                className={`text-[10px] font-bold flex items-center gap-1 ${confidence > 80 ? 'text-green-600' : confidence > 50 ? 'text-amber-500' : 'text-red-500'}`}
                            >
                                {confidence}% Confidence
                            </span>
                        )}
                        </div>
                        <textarea
                        disabled={processing}
                        value={transcription}
                        onChange={(e) => setTranscription(e.target.value)}
                        className={`${inputBoxClass} h-full`}
                        placeholder="Transcription result..."
                        />
                    </div>
                    <div className="flex gap-2 shrink-0">
                    <button onClick={resetForm} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors">Discard</button>
                    <button onClick={handleMediaSubmit} disabled={processing || !transcription} className="flex-1 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors">Add Voice Note</button>
                    </div>
                </div>
                )}
            </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default NoteInput;
