import { Note, PatientDetails } from './types';

export const MAX_NOTES = 10;

export const DEMO_PATIENT: PatientDetails = {
  id: 'TEST-CASE-001',
  name: 'Alex Rivera',
  age: '64M',
  location: 'ICU-4',
  encounterDate: 'Dec 08 2024'
};

export const DEMO_NOTES: Note[] = [
  {
    id: 'ED-1',
    type: 'text',
    label: 'ED Triage Note',
    timestamp: Date.now() - 10000000,
    status: 'ready',
    content: `Patient arrived with severe chest pain radiating to left arm.
History: HTN, HLD.
Home meds: Aspirin 81 mg daily, Lisinopril 10mg.
Allergies: NKDA.
BP 150/95, HR 94.
Plan: EKG, Troponin.`,
  },
  {
    id: 'Scan-1',
    type: 'image',
    label: 'Cardiology Consult (Handwritten)',
    timestamp: Date.now() - 5000000,
    status: 'ready',
    confidence: 88,
    content: `Cardiology Consult
Impression: NSTEMI
Plan:
- Start Heparin drip
- Aspirin 325 mg CHEW NOW
- Admit to ICU
- Echo tomorrow
Note: Patient mentions rash with Penicillin previously?`,
  },
  {
    id: 'Voice-1',
    type: 'audio',
    label: 'Nurse Handoff (Voice)',
    timestamp: Date.now(),
    status: 'ready',
    confidence: 94,
    content: `Giving report on Alex Rivera in bed 4.
Vitals stable now. BP 130/85.
Meds given: Aspirin 81 mg per home med list.
Heparin started.
Family asking about diet, NPO for now.
Code Status: Full Code.
No known allergies listed in chart.`,
  }
];