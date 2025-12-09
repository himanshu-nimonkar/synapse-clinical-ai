import { jsPDF } from "jspdf";
import { AnalysisResult, Note, DismissalRecord, Severity, PatientDetails } from "../types";

export const generatePDF = (result: AnalysisResult, notes: Note[], dismissedFlags: Record<string, DismissalRecord>, patientDetails?: PatientDetails) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = 20;

  // Helper to check page break
  const checkPageBreak = (neededHeight: number) => {
    if (cursorY + neededHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = 20;
    }
  };

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Clinical Handoff Safety Report", margin, cursorY);
  cursorY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Report Generated: ${new Date().toLocaleString()}`, margin, cursorY);
  doc.setTextColor(0, 0, 0);
  cursorY += 12;

  // Patient Header Box
  if (patientDetails) {
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(250, 252, 255); // Very light blue bg
      doc.rect(margin, cursorY, contentWidth, 25, "FD");
      
      const pY = cursorY + 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Patient: ${patientDetails.name || 'N/A'}`, margin + 5, pY);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`ID: ${patientDetails.id || 'N/A'}`, margin + contentWidth - 50, pY);
      
      const pY2 = pY + 8;
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text(`Age/Sex: ${patientDetails.age || 'N/A'}`, margin + 5, pY2);
      doc.text(`Location: ${patientDetails.location || 'N/A'}`, margin + 60, pY2);
      doc.text(`Date: ${patientDetails.encounterDate || 'N/A'}`, margin + 110, pY2);
      doc.setTextColor(0, 0, 0);

      cursorY += 32;
  } else {
      cursorY += 5;
  }

  // Disclaimer Box
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, cursorY, contentWidth, 14, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "DISCLAIMER: This tool does not provide medical advice. It is intended for clinician decision support and documentation error detection only. Verify all outputs.",
    margin + 2,
    cursorY + 6,
    { maxWidth: contentWidth - 4 }
  );
  cursorY += 22;
  doc.setTextColor(0, 0, 0);

  // --- Patient Trajectory Summary ---
  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Patient Trajectory Summary", margin, cursorY);
  cursorY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(result.patient_trajectory_summary, contentWidth);
  doc.text(summaryLines, margin, cursorY);
  cursorY += summaryLines.length * 5 + 10;

  // --- Critical Conflicts Detected ---
  checkPageBreak(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Critical Conflicts Detected", margin, cursorY);
  cursorY += 8;

  if (result.critical_conflicts.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("No critical conflicts detected.", margin, cursorY);
    cursorY += 10;
  } else {
    result.critical_conflicts.forEach((conflict) => {
      const isDismissed = !!dismissedFlags[conflict.id];
      const dismissal = dismissedFlags[conflict.id];
      
      // Calculate height needed roughly
      checkPageBreak(45); 

      // Title & Severity
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      
      let titlePrefix = "";
      if (isDismissed) {
        doc.setTextColor(150, 150, 150);
        titlePrefix = "[DISMISSED] ";
      } else {
        doc.setTextColor(0, 0, 0);
      }
      
      doc.text(`${titlePrefix}${conflict.description}`, margin, cursorY);
      
      // Severity Badge (Text)
      doc.setFontSize(9);
      if (isDismissed) {
          doc.text(`Reason: ${dismissal.reason}`, margin + contentWidth - 5, cursorY, { align: 'right' });
      } else {
          doc.setTextColor(conflict.severity === Severity.HIGH ? 200 : 0, 0, 0);
          doc.text(`Severity: ${conflict.severity}`, margin + contentWidth - 5, cursorY, { align: 'right' });
      }
      doc.setTextColor(0,0,0);
      cursorY += 6;

      // Justification
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      if (isDismissed) doc.setTextColor(150, 150, 150);
      
      const justLines = doc.splitTextToSize(conflict.reasoning, contentWidth - 5);
      doc.text(justLines, margin + 5, cursorY);
      cursorY += justLines.length * 5 + 4;

      // Sources
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      const sourceLabels = conflict.source_ids.map(sid => notes.find(n => n.id === sid)?.label).filter(Boolean).join(", ");
      doc.text(`Sources: ${sourceLabels}`, margin + 5, cursorY);
      cursorY += 6;

      // Excerpts (Simplified for PDF)
      if (conflict.excerpts && conflict.excerpts.length > 0) {
          doc.setFont("courier", "normal");
          doc.setFontSize(8);
          conflict.excerpts.forEach(e => {
             const noteLabel = notes.find(n => n.id === e.source_id)?.label || "Unknown";
             const excerptText = `"${e.text}" (${noteLabel})`;
             const lines = doc.splitTextToSize(excerptText, contentWidth - 10);
             checkPageBreak(lines.length * 4);
             doc.text(lines, margin + 5, cursorY);
             cursorY += lines.length * 4;
          });
      }

      cursorY += 8; // Spacing between items
      doc.setTextColor(0, 0, 0); // Reset color
    });
  }

  // --- Missing Information ---
  checkPageBreak(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Missing Information", margin, cursorY);
  cursorY += 8;

  const missingCategories = ["Allergies", "Active Medications", "Vitals / Trends", "Pending Tests", "Follow-up Actions", "Code Status", "Other"];
  
  // Group missing info
  const missingByCat: Record<string, any[]> = {};
  result.potentially_missing_information.forEach(m => {
    if (!missingByCat[m.category]) missingByCat[m.category] = [];
    missingByCat[m.category].push(m);
  });

  let hasMissingItems = false;
  missingCategories.forEach(cat => {
    const items = missingByCat[cat];
    if (items && items.length > 0) {
      hasMissingItems = true;
      checkPageBreak(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(cat, margin, cursorY);
      cursorY += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      items.forEach(item => {
        const lines = doc.splitTextToSize(`• ${item.description}`, contentWidth - 5);
        checkPageBreak(lines.length * 5);
        doc.text(lines, margin + 5, cursorY);
        cursorY += lines.length * 5 + 2;

        if (item.why_it_matters) {
             doc.setFont("helvetica", "italic");
             doc.setFontSize(9);
             doc.setTextColor(100,100,100);
             const whyLines = doc.splitTextToSize(`Why: ${item.why_it_matters}`, contentWidth - 10);
             doc.text(whyLines, margin + 8, cursorY);
             cursorY += whyLines.length * 4 + 1;
             doc.setTextColor(0,0,0);
             doc.setFont("helvetica", "normal");
             doc.setFontSize(10);
        }
      });
      cursorY += 4;
    }
  });
  
  if (!hasMissingItems) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("No missing information flagged.", margin, cursorY);
      cursorY += 10;
  }

  // --- Sources Used ---
  checkPageBreak(20);
  cursorY += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Sources Analyzed:", margin, cursorY);
  cursorY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  notes.forEach(note => {
     const typeLabel = note.type === 'text' ? 'Text' : note.type === 'image' ? 'Scan/OCR' : 'Audio/Transcript';
     const time = new Date(note.timestamp).toLocaleTimeString();
     const confText = note.confidence ? ` (Conf: ${note.confidence}%)` : "";
     doc.text(`• ${note.label} [${typeLabel}${confText}] - Added ${time}`, margin + 5, cursorY);
     cursorY += 5;
  });

  doc.save("clinical_handoff_report.pdf");
};