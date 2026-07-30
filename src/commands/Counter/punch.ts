import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addPunch } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'punch',
    description: 'Punch someone!',
    commandType: CommandType.Punch,
    add: addPunch,
    allowSelf: true, // the original punch command never blocked self-punching
})
