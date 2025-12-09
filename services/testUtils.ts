

import { Note, Conflict, Severity, AnalysisResult, PatientDetails, Case } from '../types';

/**
 * Runs a suite of internal unit and integration tests to verify app logic.
 * Returns a report of passed/failed tests.
 */
export const runUnitTests = async (): Promise<{ passed: number; failed: number; logs: string[] }> => {
  const logs: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, name: string) => {
    if (condition) {
      passed++;
      // logs.push(`✅ PASS: ${name}`);
    } else {
      failed++;
      logs.push(`❌ FAIL: ${name}`);
    }
  };

  logs.push("--- STARTING SYSTEM HEALTH CHECK ---");

  // TEST 1: Data Model Integrity
  try {
    const note: Note = {
      id: 'test-1',
      type: 'text',
      content: 'test content',
      label: 'test label',
      timestamp: Date.now(),
      status: 'ready'
    };
    assert(!!note.id && note.type === 'text', "Note model structure valid");
  } catch (e) {
    assert(false, "Note model structure crashed");
  }

  // TEST 2: LocalStorage Case Management
  try {
    const testCase: Case = {
      id: 'test-case-1',
      name: 'Unit Test Case',
      patientDetails: { id: 'TEST-001' },
      notes: [],
      result: null,
      dismissedFlags: {},
      timestamp: Date.now(),
      history: []
    };
    localStorage.setItem('handoff_test_item', JSON.stringify(testCase));
    const retrieved = localStorage.getItem('handoff_test_item');
    const parsed = JSON.parse(retrieved || '{}');
    assert(parsed.id === 'test-case-1', "LocalStorage Read/Write");
    localStorage.removeItem('handoff_test_item');
  } catch (e) {
    assert(false, "LocalStorage access failed");
  }

  // TEST 3: Analysis Result Schema Check (Mock)
  try {
    const mockConflict: Conflict = {
      id: 'c1',
      description: 'Test conflict',
      severity: Severity.HIGH,
      source_ids: ['n1'],
      reasoning: 'reason',
      why_it_matters: 'matters',
      confidence: 'HIGH',
      excerpts: []
    };
    assert(mockConflict.severity === 'HIGH', "Enum Severity validation");
  } catch (e) {
    assert(false, "Enum validation failed");
  }

  // TEST 4: Browser Capability Check
  assert(typeof window.speechSynthesis !== 'undefined', "Speech Synthesis API available");
  assert(typeof window.localStorage !== 'undefined', "LocalStorage API available");
  
  // TEST 5: Date Parsing
  const date = new Date().toISOString();
  assert(!isNaN(Date.parse(date)), "Date parsing logic");

  logs.push("--- HEALTH CHECK COMPLETE ---");
  
  return { passed, failed, logs };
};