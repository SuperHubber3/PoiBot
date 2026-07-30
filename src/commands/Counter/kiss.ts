import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addKiss } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'kiss',
    description: 'Kiss someone!',
    commandType: CommandType.Kiss,
    add: addKiss,
})
