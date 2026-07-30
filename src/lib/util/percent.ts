import md5 from 'md5'

/**
 * The joke percentage behind `/rate` and the `/fun ship` love meter.
 *
 * MD5 is not a security choice here and nothing secret goes in: it is the exact
 * hash the original bots used, and the whole point is that the same pair always
 * gets the same number. Swapping it for a stronger digest would silently reroll
 * every ship result people already know. Both callers share this one copy so the
 * weak-hash warning has a single, documented home.
 *
 * Keeps the original derivation: take the hash, drop every non-digit character,
 * read the first two digits as the percentage.
 */
export function percentFrom(seed: string): number {
    const digits = md5(seed)
        .split('')
        .filter((char) => !isNaN(char as unknown as number))
        .join('')
    return parseInt(digits.substring(0, 2), 10)
}
