import FailedAnimeIdsSchema from '../models/failed-anime-ids-schema.js'

/** In-memory blacklist of MAL anime ids that failed to load, backed by the DB. */
export class FailedAnimeIdsService {
    private static instance: FailedAnimeIdsService
    private failedIds = new Set<number>()
    private initialized = false

    static getInstance(): FailedAnimeIdsService {
        if (!this.instance) this.instance = new FailedAnimeIdsService()
        return this.instance
    }

    async initialize(): Promise<void> {
        if (this.initialized) return
        try {
            const records = await FailedAnimeIdsSchema.find({}, { animeId: 1 })
            this.failedIds = new Set(records.map((r: any) => r.animeId))
            // Only on success: marking it here regardless would drop the persisted
            // blacklist for the whole process life after one transient DB error.
            this.initialized = true
        } catch {
            /* keep whatever is in memory, and try again on the next call */
        }
    }

    isFailedId(animeId: number): boolean {
        return this.failedIds.has(animeId)
    }

    async addFailedId(animeId: number, reason: string): Promise<void> {
        this.failedIds.add(animeId)
        try {
            await FailedAnimeIdsSchema.updateOne(
                { animeId },
                { $inc: { failureCount: 1 }, $set: { failureDate: new Date(), failureReason: reason } },
                { upsert: true }
            )
        } catch {
            /* memory copy is enough */
        }
    }
}
