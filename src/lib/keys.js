// Desktop app key plans (validity), shared by the owner console and the super admin page.

export const PLAN_LABEL = { none: 'No expiry', monthly: 'Monthly', yearly: 'Yearly', custom: 'Fixed date' }

// Whole days until the key expires (0 or less = expired), or null when it never expires.
export const daysLeft = (inst) => (inst?.expiresAt ? Math.ceil((new Date(inst.expiresAt) - Date.now()) / 86_400_000) : null)
