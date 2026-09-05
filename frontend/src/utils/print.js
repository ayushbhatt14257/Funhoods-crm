// Chrome's (and most browsers') "Save as PDF" print destination suggests
// document.title as the filename. Every printable document in the app
// (PI, Invoice, dispatch slip, pipeline sheet) should save as
// "<Customer Name> <dd-mm-yyyy>.pdf" instead of the generic page title —
// this temporarily renames the document for the print dialog only, then
// restores it, so nothing else in the app (tab title, browser history) is affected.
export function printAs(filename) {
  const original = document.title;
  const safe = String(filename).replace(/[\\/:*?"<>|]/g, '-').trim();
  const restore = () => {
    document.title = original;
    window.removeEventListener('afterprint', restore);
  };
  document.title = safe || original;
  window.addEventListener('afterprint', restore);
  setTimeout(restore, 5000); // fallback in case `afterprint` never fires
  window.print();
}

// dd-mm-yyyy, matching the format used elsewhere in filenames/URLs.
export function ddmmyyyy(date = new Date()) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
