import { container } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import type { Message, ChatInputCommandInteraction } from 'discord.js'
import { ChatError, chatService, type ChatAction } from './chat.js'

export async function respondToChat(ctx: Message | ChatInputCommandInteraction, scope: string, action: ChatAction) {
        // Reading and deleting existing memories remain available when chat generation is disabled.
        if (action.kind === 'say' && process.env.CHAT_ENABLED !== 'true') return resolveKey(ctx, 'chat:disabled')
        try {
            const result = await chatService.run(scope, action)
            if (action.kind === 'memories') return result.text || resolveKey(ctx, 'chat:empty')
            if (action.kind !== 'say') return resolveKey(ctx, `chat:${result.text}`)
            return result.text + (result.saved ? `\n\n${await resolveKey(ctx, 'chat:saved', { count: result.saved })}` : '')
        } catch (error) {
            if (error instanceof ChatError) return resolveKey(ctx, `chat:${error.message}`)
            // Do not log conversation contents or raw model output.
            container.logger.error('[chat] Request failed', error instanceof Error ? error.name : 'Unknown error')
            return resolveKey(ctx, 'chat:failed')
        }
}
