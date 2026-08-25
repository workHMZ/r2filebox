/**
 * The page a table is showing can disappear when its last row is removed. Step
 * back to the last page that still holds rows so the table never renders an
 * empty page and then corrects itself through the pagination control's clamp.
 */
export const pageAfterRemoval = (
  page: number,
  totalBeforeRemoval: number,
  pageSize: number,
  removed = 1,
): number => {
  if (!Number.isFinite(page) || !Number.isFinite(pageSize) || pageSize < 1) return 1
  const remaining = Math.max(totalBeforeRemoval - removed, 0)
  const lastPage = Math.max(1, Math.ceil(remaining / pageSize))
  return Math.min(Math.max(Math.trunc(page), 1), lastPage)
}
