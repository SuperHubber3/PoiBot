import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addCuddle } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'cuddle',
    description: 'Cuddle someone!',
    commandType: CommandType.Cuddle,
    add: addCuddle,
})
