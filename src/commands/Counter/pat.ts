import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addPat } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'pat',
    description: 'Pat someone!',
    commandType: CommandType.Pat,
    add: addPat,
})
