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
            // Every player accrues points every minute — that is what makes it an
            // idle game — so there is nothing to filter on. What we can avoid is
            // pulling the whole collection into this process to compute a number
            // per row: the same arithmetic runs server-side as one updateMany, so
            // nothing is transferred and the tick stays flat as the game grows.
            //
            //   gain = max(multiply, 1) * 60 / max(1, 60 - min(speed, 59))
            await pointsSchema.updateMany({}, [
                {
                    $set: {
                        points: {
                            $add: [
                                { $ifNull: ['$points', 0] },
                                {
                                    $let: {
                                        vars: {
                                            speed: { $min: [{ $ifNull: ['$upgrades.speed', 0] }, 59] },
                                            multiply: { $max: [{ $ifNull: ['$upgrades.multiply', 1] }, 1] },
                                        },
                                        in: {
                                            $multiply: [
                                                '$$multiply',
                                                { $divide: [60, { $max: [1, { $subtract: [60, '$$speed'] }] }] },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            ])
        } catch (err) {
            this.container.logger.error('tycoon points tick failed', err)
        }
    }
}
