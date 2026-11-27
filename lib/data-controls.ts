export function disconnectedCredentialState() {
  return {
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    tokenExpiresAt: null,
    status: "DISCONNECTED" as const,
    monitoringEnabled: false,
    watchExpiresAt: null,
    syncInProgress: false,
    syncLockUntil: null,
    continuationPageToken: null,
    pendingHistoryId: null,
    pendingMessageIds: [],
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}
export function validDeletionConfirmation(
  value: FormDataEntryValue | null,
  account = false,
) {
  return value === (account ? "DELETE MY ACCOUNT" : "DELETE");
}
