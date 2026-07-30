import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import pointsSchema from '../lib/models/points-schema.js'

// Idle point generation for the tycoon game. The original tycoon shortened the
// user's interval by one second per speed level; this bulk tick converts that
// into equivalent points per minute.
@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class TycoonPointsListener extends Listener<typeof Events.ClientReady> {
    public override run() {
        const schedule = () => {
            const timer = setTimeout(async () => {
                await this.tick()
                schedule()
            }, 1000 * 60)
            timer.unref?.()
        }
        schedule()
    }

    private async tick() {
        try {
            const docs = await pointsSchema.find({})
            if (!docs.length) return
            const ops = docs.map((doc: any) => {
                const speed = Math.min(doc.upgrades?.speed ?? 0, 59)
                const multiply = Math.max(doc.upgrades?.multiply ?? 1, 1)
                const gain = multiply * (60 / Math.max(1, 60 - speed))
                return {
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $inc: { points: gain } },
                    },
                }
            })
            await pointsSchema.bulkWrite(ops)
        } catch (err) {
            this.container.logger.error('tycoon points tick failed', err)
        }
    }
}
