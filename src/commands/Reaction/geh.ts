import { createCounterCommand } from '../../lib/counter-command.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { addGeh } from '../../lib/functions/counters.js'

export default createCounterCommand({
    name: 'geh',
    description: 'Why are they geh?',
    commandType: CommandType.Geh,
    add: addGeh,
    titleKey: null,
    descriptionKey: 'counter:actions.geh.description',
})
