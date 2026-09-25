import { Effect, Latch } from "effect"

/** Tracks accepted transport work independently of the requesting socket. */
export class RelayWork {
  private accepting = true
  private pending = 0
  private readonly idle = Latch.makeUnsafe(true)

  get isAccepting(): boolean {
    return this.accepting
  }

  stopAdmission(): void {
    this.accepting = false
  }

  settle(): Effect.Effect<void> {
    return this.idle.await
  }

  track<A, E, R>(effect: Effect.Effect<A, E, R>, continuation = false): Effect.Effect<A, E | Error, R> {
    return Effect.acquireUseRelease(
      Effect.suspend(() => {
        if (!this.accepting && !continuation) return Effect.fail(new Error("Relay is draining accepted work"))
        this.pending += 1
        this.idle.closeUnsafe()
        return Effect.void
      }),
      () => effect,
      () => Effect.sync(() => {
        if (--this.pending === 0) this.idle.openUnsafe()
      }),
    )
  }
}
