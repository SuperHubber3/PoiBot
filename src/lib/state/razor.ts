// Tracks whether a specific user ("razor") recently sent a message. The boop
// command uses this to gate booping them (see commands/Counter/boop.ts).
export const RAZOR_ID = '555484255363530782'

/**
 * How long "recently" lasts.
 *
 * This used to be a bare boolean that stayed true until somebody successfully
 * booped, so a single message hours ago still counted as recent. A deadline
 * expires on its own.
 */
const RECENT_WINDOW_MS = 10 * 60 * 1000

let recentUntil = 0

export const razorState = {
    /** True while Razor's last message is still inside the window. */
    get razorCache(): boolean {
        return Date.now() < recentUntil
    },
    set razorCache(on: boolean) {
        recentUntil = on ? Date.now() + RECENT_WINDOW_MS : 0
    },
}
