import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addBite } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'bite',
    description: 'Bite someone!',
    commandType: CommandType.Bite,
    add: addBite,
})
