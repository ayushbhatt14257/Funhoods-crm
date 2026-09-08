// A PI's own status (Draft/Sent/Confirmed/...) and its price-approval status
// are tracked separately — a Confirmed PI can still be sitting there
// "Waiting for approval" if a founder priced a line below base rate. This
// gives the one label/color that should actually be shown for a PI, so
// every list/detail screen stays consistent instead of re-deriving it.
export function piStatusDisplay(pi) {
  if (pi.priceApproval?.status === 'pending') return { label: 'Waiting for approval', cls: 'p' };
  if (pi.status === 'Cancelled') return { label: pi.status, cls: 'r' };
  if (pi.status === 'Fully Dispatched') return { label: pi.status, cls: 'g' };
  if (pi.status === 'Partial Dispatched' || pi.status === 'Closed') return { label: pi.status, cls: 'y' };
  return { label: pi.status, cls: '' };
}
