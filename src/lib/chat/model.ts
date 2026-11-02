import { askAntigravity } from './antigravity.js'
import { askCodex } from './codex.js'
import type { ChatSettings } from './settings.js'

export function askModel(prompt: string, settings: ChatSettings) {
    return settings.model.startsWith('gemini-') ? askAntigravity(prompt, settings) : askCodex(prompt, settings)
}
