
import { Case } from '../types';
import { sanitizeInput } from './securityService';

const STORAGE_KEY = 'handoff_cases_secure_db';

export const storageService = {
  async saveCase(newCase: Case): Promise<Case[]> {
    try {
        // Deep sanitization of the case object before storage
        const sanitizedCase = this.sanitizeCase(newCase);
        
        const existing = await this.loadCases();
        // Prepend new case
        const updated = [sanitizedCase, ...existing];
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch (e) {
        console.error("Database Write Error", e);
        throw new Error("Failed to save case to secure storage.");
    }
  },

  async updateCase(updatedCase: Case): Promise<Case[]> {
      try {
        const sanitizedCase = this.sanitizeCase(updatedCase);
        const existing = await this.loadCases();
        const index = existing.findIndex(c => c.id === updatedCase.id);
        
        let newCasesList;
        if (index >= 0) {
            // Update existing
            newCasesList = [...existing];
            newCasesList[index] = sanitizedCase;
        } else {
            // Fallback to save new if not found
            newCasesList = [sanitizedCase, ...existing];
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(newCasesList));
        return newCasesList;
      } catch (e) {
        console.error("Database Update Error", e);
        throw new Error("Failed to update case.");
      }
  },

  async loadCases(): Promise<Case[]> {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch (e) {
        console.error("Database Read Error", e);
        return [];
    }
  },

  async deleteCase(id: string): Promise<Case[]> {
     const existing = await this.loadCases();
     const updated = existing.filter(c => c.id !== id);
     localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
     return updated;
  },

  sanitizeCase(c: Case): Case {
      return {
            ...c,
            name: sanitizeInput(c.name),
            patientDetails: {
                id: sanitizeInput(c.patientDetails.id),
                name: sanitizeInput(c.patientDetails.name || ''),
                age: sanitizeInput(c.patientDetails.age || ''),
                location: sanitizeInput(c.patientDetails.location || ''),
                encounterDate: sanitizeInput(c.patientDetails.encounterDate || '')
            },
            notes: c.notes.map(n => ({
                ...n,
                content: sanitizeInput(n.content),
                label: sanitizeInput(n.label)
            })),
            result: c.result,
            dismissedFlags: c.dismissedFlags,
            history: c.history || []
      };
  }
};
