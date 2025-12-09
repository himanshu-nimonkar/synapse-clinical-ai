
export const sanitizeInput = (input: string): string => {
  if (!input) return "";
  // Basic HTML entity encoding to prevent XSS execution
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const validateClinicalContent = (input: string): boolean => {
  // Reject empty strings
  if (!input || input.trim().length === 0) return false;
  
  // Reject gibberish / extremely short non-clinical inputs (simple heuristic)
  // e.g. "asdf", "123"
  if (input.trim().length < 4) return false;
  
  // Reject strictly numeric or symbol only inputs usually
  // (But keep it loose enough for short valid notes like "NPO")
  const alphaChars = input.match(/[a-zA-Z]/g);
  if (!alphaChars || alphaChars.length < 2) return false;
  
  return true;
};
