
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, AnalysisResult } from "../types";

const SYSTEM_INSTRUCTION = `
You are a clinical document reconciliation assistant for handoff safety. 
You must not diagnose or recommend treatment. 
Use only the content of the provided notes. 
Produce structured JSON with flags, timeline events, and missing information categorized. 
Label ambiguous data as "unclear". 
Prioritize medication and allergy conflicts. 
Include exact excerpts and source ids.

RULES:
1. "Critical Conflicts": High risk issues like medication mismatches (dose, route), allergy contradictions, code status conflicts.
   - CHECK FOR EXPIRING ORDERS: Compare medication order dates/durations against the Encounter Date or "Today's Date". If an order has expired or is expiring within 24 hours, flag it.
     - Justification should be: "Order expired on [Date]" or "Order approaching expiration".
   - "Why This Matters": Provide a single clinically relevant sentence explaining the risk (e.g. "Potential toxicity due to double dosing" or "Therapeutic gap if medication falls off").
   - "Confidence": Rate your confidence in this flag (HIGH/MEDIUM/LOW) based on clarity of the notes.
2. "Missing Information": Must be categorized strictly.
   - For each missing item, provide "why_it_matters": a generic safety explanation.
   - Provide "suggested_questions": 1-2 generic clarification prompts.
   - If code status is not mentioned, add a Missing Item in "Code Status".
   - If vitals are missing or no trend is visible, add a Missing Item in "Vitals / Trends".
   - If active medications are not clearly listed, add a Missing Item in "Active Medications" with importance "HIGH". Use description: "Key medications the patient is currently taking are not clearly documented." and why_it_matters: "Ensures continuity of care and prevents therapeutic gaps or omissions." and suggested_questions: ["What are the patient's current home medications?", "Are there any scheduled or PRN medications to be continued?"].
3. "Patient Trajectory Summary": Concise 2-3 sentence summary.
4. "Timeline Events": Chronological list of key events/observations.
   - "Severity": Assign a severity (HIGH, MEDIUM, LOW, NEUTRAL) to each event. 
     - HIGH: Critical interventions, crashing vitals, code events.
     - MEDIUM: Medication changes, abnormal labs.
     - LOW/NEUTRAL: Routine checks, stable vitals.
5. "Excerpts": For conflicts, you MUST provide the exact string text from the source note that supports the finding, mapped by source_id.

SCHEMA:
Return strict JSON matching the requested schema.
`;

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    patient_trajectory_summary: { type: Type.STRING },
    critical_conflicts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          description: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
          source_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
          excerpts: { 
            type: Type.ARRAY, 
            items: {
                type: Type.OBJECT,
                properties: {
                    source_id: { type: Type.STRING },
                    text: { type: Type.STRING }
                },
                required: ["source_id", "text"]
            },
            nullable: false
          },
        },
        required: ["description", "severity", "source_ids", "reasoning", "why_it_matters", "confidence", "excerpts"],
      },
    },
    potentially_missing_information: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["Allergies", "Active Medications", "Vitals / Trends", "Pending Tests", "Follow-up Actions", "Code Status", "Other"] },
          description: { type: Type.STRING },
          importance: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
          source_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
          why_it_matters: { type: Type.STRING },
          suggested_questions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["category", "description", "importance"],
      },
    },
    timeline_events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          description: { type: Type.STRING },
          source_id: { type: Type.STRING },
          is_conflict: { type: Type.BOOLEAN },
          severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW", "NEUTRAL"] }
        },
        required: ["time", "description", "source_id", "is_conflict", "severity"]
      },
    },
    analysis_confidence: {
      type: Type.STRING,
      enum: ["HIGH", "MEDIUM", "LOW"],
    }
  },
  required: ["patient_trajectory_summary", "critical_conflicts", "potentially_missing_information", "timeline_events", "analysis_confidence"],
};

const getAiClient = () => {
  const key = process.env.API_KEY;
  if (!key) throw new Error("API Key not found in environment.");
  return new GoogleGenAI({ apiKey: key });
};

// Log structure
interface GeminiLog {
  timestamp: string;
  type: 'ANALYSIS' | 'OCR' | 'TRANSCRIPTION' | 'SELF_TEST';
  model: string;
  status: 'SUCCESS' | 'ERROR';
  details?: any;
}

const logGeminiRequest = (log: GeminiLog) => {
  // In a real production app, this would go to a telemetry service.
  // For demo, we keep it in console but structured.
  console.debug("[Gemini Telemetry]", JSON.stringify(log));
};

// Retry helper
async function retryOperation<T>(operation: () => Promise<T>, retries = 1, context: string): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries > 0) {
      console.warn(`[${context}] Operation failed, retrying... (${retries} attempts left)`, error.message);
      await new Promise(r => setTimeout(r, 1000));
      return retryOperation(operation, retries - 1, context);
    }
    throw error;
  }
}

export const runGeminiSelfTest = async (): Promise<{ status: 'OK' | 'FAIL', message: string }> => {
  try {
    const ai = getAiClient();
    const startTime = Date.now();
    await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Test connection. Reply 'OK'.",
    });
    logGeminiRequest({ timestamp: new Date().toISOString(), type: 'SELF_TEST', model: 'gemini-2.5-flash', status: 'SUCCESS' });
    return { status: 'OK', message: `Connected (${Date.now() - startTime}ms)` };
  } catch (e: any) {
    logGeminiRequest({ timestamp: new Date().toISOString(), type: 'SELF_TEST', model: 'gemini-2.5-flash', status: 'ERROR', details: e.message });
    console.error("Self Test Failed:", e);
    return { status: 'FAIL', message: e.message || "Connection failed" };
  }
};

// Generic media processor for OCR and Transcription
export const processMedia = async (base64Data: string, mimeType: string, task: 'ocr' | 'transcribe'): Promise<{ text: string, confidence: number }> => {
  const ai = getAiClient();
  const model = 'gemini-2.5-flash';
  
  const prompt = task === 'ocr' 
    ? "Analyze this clinical image. Extract all legible text precisely. If it is a handwritten note, transcribe it line by line. Return only the raw text."
    : "You are an expert medical scribe. Transcribe the following clinical audio note verbatim. Do not summarize. Output only the transcription text.";

  try {
    return await retryOperation(async () => {
       const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType, data: base64Data } }
          ]
        }
      });
      
      const text = response.text || "No content extracted.";
      logGeminiRequest({ timestamp: new Date().toISOString(), type: task === 'ocr' ? 'OCR' : 'TRANSCRIPTION', model, status: 'SUCCESS' });
      
      return { 
        text: text, 
        confidence: 95 
      };
    }, 1, `${task.toUpperCase()}`);
  } catch (error: any) {
    logGeminiRequest({ timestamp: new Date().toISOString(), type: task === 'ocr' ? 'OCR' : 'TRANSCRIPTION', model, status: 'ERROR', details: error.message });
    console.error(`Processing Error (${task}):`, error);
    throw new Error(`Failed to process ${task === 'ocr' ? 'image' : 'audio'}. Please try again.`);
  }
};

export const generateHandoffAudio = async (): Promise<Blob> => {
  const ai = getAiClient();
  const text = "Hi, this is nurse Sarah giving report on Alex Rivera in ICU-4. Patient is currently stable. Vitals are within normal limits. Per the earlier orders, the Heparin drip is currently running at 12 units per kilo. Family is at the bedside.";
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: { parts: [{ text }] },
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
    }
  });

  const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new Error("No audio data received");
  
  // Decode Base64 to binary
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Wrap in WAV header (Assuming 24kHz, 1ch, 16bit PCM - Standard for Gemini TTS)
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, 24000, true); // Sample Rate
  view.setUint32(28, 24000 * 2, true); // Byte Rate
  view.setUint16(32, 2, true); // Block Align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, len, true);

  const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
  return blob;
};

export const analyzeNotes = async (notes: Note[]): Promise<AnalysisResult> => {
  if (!notes || notes.length === 0) {
    throw new Error("No notes provided for analysis.");
  }

  const ai = getAiClient();

  const parts: any[] = [];
  const currentDate = new Date().toLocaleDateString();
  parts.push({
    text: `TODAY'S DATE: ${currentDate}. Here are the clinical notes to analyze. Cross-reference them to build a timeline and detect safety risks:`
  });

  notes.forEach((note) => {
    // Truncate very long notes to avoid context issues
    const content = note.content.length > 20000 ? note.content.substring(0, 20000) + "...[truncated]" : note.content;
    parts.push({
      text: `\n--- START NOTE ID: "${note.id}" (Label: "${note.label}") ---\n${content}\n--- END NOTE ID: "${note.id}" ---\n`
    });
  });

  const callModel = async (modelName: string) => {
    console.log(`Sending request to Gemini (${modelName})...`, { noteCount: notes.length });
    const startTime = Date.now();
    
    // thinkingConfig is only for gemini-3-pro-preview
    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1, 
    };
    
    // Only use thinking config for the reasoning model
    if (modelName.includes('gemini-3-pro')) {
      config.thinkingConfig = { thinkingBudget: 2048 };
    }

    const response = await ai.models.generateContent({
      model: modelName, 
      contents: { parts: parts },
      config: config,
    });

    console.log(`Gemini response received from ${modelName} in ${(Date.now() - startTime) / 1000}s`);
    return response;
  }

  try {
    return await retryOperation(async () => {
      let response;
      let usedModel = 'gemini-3-pro-preview';
      try {
        // First try the powerful model
        response = await callModel(usedModel);
      } catch (err: any) {
         // Fallback to flash if preview model is not available or errors out
         console.warn("Primary model failed, failing over to gemini-2.5-flash", err);
         usedModel = 'gemini-2.5-flash';
         response = await callModel(usedModel);
      }
      
      const text = response.text;
      if (!text) throw new Error("Empty response from AI.");

      const parsed = JSON.parse(text) as AnalysisResult;
      
      // Fallback ID generation if model misses them
      parsed.critical_conflicts?.forEach((c, i) => { if(!c.id) c.id = `conflict-${i}`; });
      parsed.potentially_missing_information?.forEach((m, i) => { if(!m.id) m.id = `missing-${i}`; });
      
      // Manually calculate summary stats from actual conflicts to avoid AI hallucination
      parsed.summary_stats = {
          high: parsed.critical_conflicts?.filter(c => c.severity === 'HIGH').length || 0,
          medium: parsed.critical_conflicts?.filter(c => c.severity === 'MEDIUM').length || 0,
          low: parsed.critical_conflicts?.filter(c => c.severity === 'LOW').length || 0
      };

      logGeminiRequest({ timestamp: new Date().toISOString(), type: 'ANALYSIS', model: usedModel, status: 'SUCCESS' });
      return parsed;
    }, 0, "ANALYSIS");

  } catch (error: any) {
    logGeminiRequest({ timestamp: new Date().toISOString(), type: 'ANALYSIS', model: 'UNKNOWN', status: 'ERROR', details: error.message });
    console.error("Gemini Analysis Error:", error);
    let msg = "Analysis failed.";
    if (error.message.includes("400")) msg = "Request rejected by API (Check inputs or content safety).";
    if (error.message.includes("404")) msg = "Model not found. Service availability issue.";
    if (error.message.includes("429")) msg = "Too many requests. Please wait a moment.";
    if (error.message.includes("500") || error.message.includes("503")) msg = "Service unavailable. Retrying usually fixes this.";
    
    throw new Error(msg + " (" + (error.message || "Unknown error") + ")");
  }
};
