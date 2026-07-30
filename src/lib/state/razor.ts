// Tracks whether a specific user ("razor") recently sent a message. The boop
// command uses this to gate booping them (see commands/Counter/boop.ts).
export const RAZOR_ID = '555484255363530782'

export const razorState = { razorCache: false }
