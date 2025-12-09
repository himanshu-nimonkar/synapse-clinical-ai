
import React from 'react';
import { PatientDetails } from '../types';

interface PatientHeaderProps {
  details: PatientDetails;
  onChange: (details: PatientDetails) => void;
  validationErrors?: {
    id?: boolean;
    encounterDate?: boolean;
  };
}

const PatientHeader: React.FC<PatientHeaderProps> = ({ details, onChange, validationErrors }) => {
  const handleChange = (field: keyof PatientDetails, value: string) => {
    onChange({ ...details, [field]: value });
  };

  // Shared input style matching NoteInput.tsx source label style
  const inputClass = (isError?: boolean) => `w-full text-sm bg-[#f7fafc] border ${isError ? 'border-red-400 bg-red-50 focus:ring-red-500 focus:border-red-500' : 'border-slate-200 focus:ring-blue-500 focus:border-blue-500'} rounded-md px-3 py-2 text-slate-800 placeholder-slate-400 font-medium transition-colors`;
  const labelClass = (isError?: boolean) => `block text-[10px] font-bold ${isError ? 'text-red-500' : 'text-slate-500'} mb-1.5 uppercase tracking-wide`;

  return (
    <div className={`bg-white rounded-xl border ${validationErrors && (validationErrors.id || validationErrors.encounterDate) ? 'border-red-300 shadow-md' : 'border-slate-200 shadow-sm'} p-5 mb-6 transition-all`}>
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
         <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Patient Context
         </h3>
         <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Secure Browser Storage • Encrypted
         </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
         <div>
            <label className={labelClass(validationErrors?.id)}>Patient ID <span className="text-red-400">*</span></label>
            <input 
              type="text" 
              value={details.id} 
              onChange={e => handleChange('id', e.target.value)}
              placeholder="e.g. DEMO-001"
              className={inputClass(validationErrors?.id)}
            />
            {validationErrors?.id && <p className="text-[9px] text-red-500 mt-1 font-bold">Required</p>}
         </div>
         <div className="md:col-span-1">
            <label className={labelClass()}>Name</label>
            <input 
              type="text" 
              value={details.name || ''} 
              onChange={e => handleChange('name', e.target.value)}
              placeholder="Optional"
              className={inputClass()}
            />
         </div>
         <div>
            <label className={labelClass()}>Age / Gender</label>
            <input 
              type="text" 
              value={details.age || ''} 
              onChange={e => handleChange('age', e.target.value)}
              placeholder="e.g. 64M"
              className={inputClass()}
            />
         </div>
         <div>
            <label className={labelClass()}>Location</label>
            <input 
              type="text" 
              value={details.location || ''} 
              onChange={e => handleChange('location', e.target.value)}
              placeholder="e.g. Unit 4B"
              className={inputClass()}
            />
         </div>
         <div>
            <label className={labelClass(validationErrors?.encounterDate)}>Encounter Date <span className="text-red-400">*</span></label>
            <input 
              type="text" 
              value={details.encounterDate || ''} 
              onChange={e => handleChange('encounterDate', e.target.value)}
              placeholder="e.g. Dec 08"
              className={inputClass(validationErrors?.encounterDate)}
            />
            {validationErrors?.encounterDate && <p className="text-[9px] text-red-500 mt-1 font-bold">Required</p>}
         </div>
      </div>
    </div>
  );
};

export default PatientHeader;
