export function resolveExplicitSessionSelector(options: {
  readonly positional: string | undefined
  readonly flag: string | undefined
  readonly environment: string | undefined
}): string | undefined {
  if (options.positional && options.flag) {
    throw new Error("Use either a positional session id or --session, not both")
  }
  return options.flag ?? options.positional ?? options.environment
}

export function resolveSessionDeletionId(options: {
  readonly explicit: string | undefined
  readonly persisted: string | undefined
}): string {
  const sessionId = options.explicit ?? options.persisted
  if (!sessionId) {
    throw new Error("No session provided and no current BrowserRig session exists")
  }
  return sessionId
}
