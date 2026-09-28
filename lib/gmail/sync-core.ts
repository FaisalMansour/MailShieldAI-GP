export function uniqueMessageIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}
export function cursorAfterPage(
  current: string,
  page: { historyId?: string | null; nextPageToken?: string | null },
  persisted: boolean,
) {
  if (!persisted) return { historyId: current, continuationPageToken: null };
  return page.nextPageToken
    ? { historyId: current, continuationPageToken: page.nextPageToken }
    : { historyId: page.historyId || current, continuationPageToken: null };
}
