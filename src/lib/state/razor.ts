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
let revision = 0
type Reservation = { until: number; revision: number }

export const razorState = {
    /** True while Razor's last message is still inside the window. */
    get razorCache(): boolean {
        return Date.now() < recentUntil
    },
    set razorCache(on: boolean) {
        revision++
        recentUntil = on ? Date.now() + RECENT_WINDOW_MS : 0
    },
    claim(): Reservation | null {
        if (Date.now() >= recentUntil) return null
        const reservation = { until: recentUntil, revision: ++revision }
        recentUntil = 0
        return reservation
    },
    restore(reservation: Reservation): void {
        if (revision === reservation.revision) recentUntil = reservation.until
    },
}
