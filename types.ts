
export interface PatientDetails {
  id: string;
  name?: string;
  age?: string;
  location?: string;
  encounterDate?: string;
}

export interface Note {
  id: string;
  type: 'text' | 'image' | 'audio';
  content: string; // The text content (raw or transcribed)
  originalFile?: string; // Base64 for images/audio to show thumbnails/player
  mimeType?: string;
  label: string;
  timestamp: number;
  status: 'processing' | 'ready' | 'error';
  confidence?: number; // 0-100 for OCR/Transcription
}

export enum Severity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Conflict {
  id: string;
  description: string;
  severity: Severity;
  source_ids: string[]; // IDs of notes involved
  reasoning: string; // Technical justification
  why_it_matters: string; // Clinical relevance
  confidence: ConfidenceLevel; // Flag confidence
  excerpts: { source_id: string; text: string }[]; // Array of excerpts
  resolved_text?: string; // Text content of the resolved/correct version
}

export interface MissingInfo {
  id: string;
  category: "Allergies" | "Active Medications" | "Vitals / Trends" | "Pending Tests" | "Follow-up Actions" | "Code Status" | "Other";
  description: string;
  importance: Severity;
  source_ids?: string[];
  why_it_matters?: string; // Safety relevance
  suggested_questions?: string[]; // Clarification prompts
}

export interface TimelineEvent {
  time: string;
  description: string;
  source_id: string;
  is_conflict: boolean;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEUTRAL'; // Added severity
}

export interface AnalysisResult {
  critical_conflicts: Conflict[];
  potentially_missing_information: MissingInfo[];
  patient_trajectory_summary: string;
  summary_stats: {
    high: number;
    medium: number;
    low: number;
  };
  timeline_events: TimelineEvent[];
  analysis_confidence: ConfidenceLevel;
}

export enum DismissalReason {
  NOT_RELEVANT = 'Not Clinically Relevant',
  FALSE_POSITIVE = 'False Positive',
  ADDRESSED = 'Already Addressed',
  DOC_ERROR = 'Documentation Error',
  RESOLVED = 'Resolved',
  OTHER = 'Other'
}

export interface DismissalRecord {
  conflictId: string;
  reason: DismissalReason;
  customReason?: string;
  note?: string;
  resolutionSourceId?: string; // ID of the source selected as correct
  timestamp: number;
}

export interface CaseHistoryEvent {
  timestamp: number;
  action: string;
  details?: string;
}

export interface Case {
  id: string;
  name: string;
  patientDetails: PatientDetails;
  notes: Note[];
  result: AnalysisResult | null;
  dismissedFlags: Record<string, DismissalRecord>;
  timestamp: number;
  history: CaseHistoryEvent[];
}
