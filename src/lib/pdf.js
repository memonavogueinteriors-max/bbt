import { jsPDF } from "jspdf";

export function downloadRulebookPDF(
  entries,
  departmentName = "All Departments"
) {
  const pdf = new jsPDF();

  const margin = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - margin * 2;

  let y = 20;

  function checkPage(space = 20) {
    if (y + space > pageHeight - 15) {
      pdf.addPage();
      y = 20;
    }
  }

  function addText(
    label,
    value,
    size = 10
  ) {
    checkPage(15);

    pdf.setFontSize(size);
    pdf.setFont("helvetica", "bold");
    pdf.text(label, margin, y);

    y += 5;

    pdf.setFont("helvetica", "normal");

    const lines = pdf.splitTextToSize(
      String(value || "—"),
      contentWidth
    );

    pdf.text(lines, margin, y);

    y += lines.length * 5 + 5;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("BBT", margin, y);

  y += 9;

  pdf.setFontSize(15);
  pdf.text(
    "Black Box Thinking — Rulebook",
    margin,
    y
  );

  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(
    `Department: ${departmentName}`,
    margin,
    y
  );

  y += 6;

  pdf.text(
    `Generated: ${new Date().toLocaleDateString()}`,
    margin,
    y
  );

  y += 12;

  if (!entries.length) {
    pdf.setFontSize(11);
    pdf.text(
      "No Rulebook entries available.",
      margin,
      y
    );
  }

  entries.forEach((entry, index) => {
    checkPage(30);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);

    pdf.text(
      `Rulebook #${
        entry.rulebook_number || entry.id
      }`,
      margin,
      y
    );

    y += 8;

    addText(
      "Mistake Title",
      entry.mistake_title
    );

    addText(
      "Name",
      entry.name
    );

    addText(
      "Designation",
      entry.designation
    );

    addText(
      "Department",
      entry.departments?.name
    );

    addText(
      "Project",
      entry.project_name
    );

    addText(
      "Finding",
      entry.finding
    );

    addText(
      "Learning",
      entry.learning
    );

    addText(
      "Solution",
      entry.solution
    );

    addText(
      "Date",
      entry.mistake_date
    );

    if (index < entries.length - 1) {
      checkPage(15);

      pdf.setDrawColor(210);
      pdf.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 10;
    }
  });

  const totalPages =
    pdf.internal.getNumberOfPages();

  for (
    let page = 1;
    page <= totalPages;
    page++
  ) {
    pdf.setPage(page);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");

    pdf.text(
      `BBT — Page ${page} of ${totalPages}`,
      margin,
      pageHeight - 8
    );
  }

  const safeName =
    departmentName
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");

  pdf.save(
    `BBT-Rulebook-${safeName || "All"}.pdf`
  );
}