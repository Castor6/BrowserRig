import { Effect, Fiber, Latch } from "effect"
import { describe, expect, it } from "vitest"
import { RelayWork } from "../src/relay-work.ts"

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe("RelayWork", () => {
  it("rejects new work while retaining accepted work and sandbox continuations", async () => {
    const work = new RelayWork()
    const entered = Latch.makeUnsafe()
    const release = Latch.makeUnsafe()
    const active = Effect.runPromise(work.track(entered.open.pipe(Effect.andThen(release.await))))
    await Effect.runPromise(entered.await)
    work.stopAdmission()
    await expect(Effect.runPromise(work.track(Effect.void))).rejects.toThrow("draining")
    let settled = false
    const drain = Effect.runPromise(work.settle()).then(() => { settled = true })
    await Effect.runPromise(work.track(Effect.void, true))
    await tick()
    expect(settled).toBe(false)
    await Effect.runPromise(release.open)
    await Promise.all([active, drain])
    expect(settled).toBe(true)
  })

  it("retains a started uninterruptible promise after its requester aborts", async () => {
    const work = new RelayWork()
    let release!: () => void
    const entered = Latch.makeUnsafe()
    const promise = new Promise<void>((resolve) => { release = resolve })
    const worker = Effect.runFork(work.track(Effect.gen(function* () {
      yield* entered.open
      yield* Effect.promise(() => promise)
    }).pipe(Effect.uninterruptible)))
    await Effect.runPromise(entered.await)
    const interrupted = Effect.runPromise(Fiber.interrupt(worker))
    work.stopAdmission()
    let settled = false
    const drain = Effect.runPromise(work.settle()).then(() => { settled = true })
    await tick()
    expect(settled).toBe(false)
    release()
    await Promise.all([interrupted, drain])
    expect(settled).toBe(true)
  })
})
