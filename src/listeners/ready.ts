import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { ActivityType, Client } from 'discord.js'
import { resumePendingRefunds } from '../lib/functions/refunds.js'
import {
    GACHA_REFRESH_INTERVAL_MS,
    refreshGachaRoster,
} from '../lib/gacha/rosters.js'

const games = [
    "Counter-Strike 3",
    "Cyberpunk 3167",
    "Dota 3",
    "GTA VII",
    "Half-Life 3",
    "Minecraft 2",
    "Wordle 2"
]

@ApplyOptions<Listener.Options>({ event: Events.ClientReady, once: true })
export class ReadyListener extends Listener<typeof Events.ClientReady> {
    public override run(client: Client<true>) {
        console.log('PoiBot Online')

        // Pay back anything the /redeem troll still owes from before this restart.
        void resumePendingRefunds().catch((error) =>
            this.container.logger.error('[refunds] resume failed', error)
        )

        const refreshRosters = () => {
            for (const game of ['genshin', 'bluearchive'] as const) {
                void refreshGachaRoster(game)
                    .then((result) =>
                        this.container.logger.info(
                            `[gacha] refreshed ${game}: ${result.total} characters (${result.rateUps.join(', ')} rate-up)`
                        )
                    )
                    .catch((error) =>
                        this.container.logger.warn(`[gacha] ${game} refresh failed; keeping cached roster`, error)
                    )
            }
        }
        refreshRosters()
        const rosterTimer = setInterval(refreshRosters, GACHA_REFRESH_INTERVAL_MS)
        rosterTimer.unref()

        const setRandomActivity = () => {
            const game = games[Math.floor(Math.random() * games.length)]
            client.user.setActivity({ name: game, type: ActivityType.Playing })
        }

        setRandomActivity()
        setInterval(setRandomActivity, 1000 * 60 * 60 * 3)
    }
}
