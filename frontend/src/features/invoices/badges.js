export const invoiceBadgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Delivered' ? 'g' : '');
export const piBadgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Fully Dispatched' ? 'g' : (s === 'Partial Dispatched' || s === 'Closed') ? 'y' : '');
