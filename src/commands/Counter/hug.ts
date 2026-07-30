import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addHug } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'hug',
    description: 'Hug someone!',
    commandType: CommandType.Hug,
    add: addHug,
    // TODO: when the "hugs a pillow" gifs are ready, add a `selfResponse` here to
    // replace the default "You can't hug yourself!" error, e.g.:
    // selfResponse: async (ctx, giverId) => v2Container(...)
})
