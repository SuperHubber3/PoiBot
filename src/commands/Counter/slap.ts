import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addSlap } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'slap',
    description: 'Slap someone!',
    commandType: CommandType.Slap,
    add: addSlap,
})
