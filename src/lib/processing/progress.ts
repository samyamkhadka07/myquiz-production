export type ProcessingCursor = {
  step?: string;
  offset?: number;
  page?: number;
  pages?: number;
  row?: number;
};

export function processingProgress(status: string, cursor: ProcessingCursor) {
  if (status === "SUCCEEDED") return 100;
  if (["FAILED", "DEAD_LETTER", "NEEDS_REVIEW"].includes(status)) {
    return Math.min(99, activeProgress(cursor));
  }
  return activeProgress(cursor);
}

function activeProgress(cursor: ProcessingCursor) {
  switch (cursor.step) {
    case "INSPECT":
      return 15;
    case "CSV":
      return Math.min(95, 25 + Math.floor(Math.max(0, Number(cursor.row ?? 2) - 2) / 10));
    case "EXTRACT": {
      const pages = Math.max(0, Number(cursor.pages ?? 0));
      const page = Math.max(1, Number(cursor.page ?? 1));
      return pages ? Math.min(95, 20 + Math.round((75 * Math.min(page - 1, pages)) / pages)) : 25;
    }
    case "HASH":
    default:
      return 8;
  }
}

export function processingPosition(cursor: ProcessingCursor) {
  if (cursor.step === "EXTRACT" && cursor.pages) {
    const completed = Math.max(0, Math.min(Number(cursor.page ?? 1) - 1, Number(cursor.pages)));
    return `${completed} of ${cursor.pages} pages processed`;
  }
  if (cursor.step === "CSV" && cursor.row) return `${Math.max(0, cursor.row - 2)} rows processed`;
  if (cursor.step === "HASH" && cursor.offset)
    return `${cursor.offset.toLocaleString()} bytes checked`;
  return "Waiting for the next safe checkpoint";
}
