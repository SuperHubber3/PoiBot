import { MessageEmbed } from 'discord.js'
import { ICommand } from 'wokcommands'
import { MediaService } from '../../services/media.service';
import { CommandType } from '../../enums/command.enum';

export default {
    name: 'smug',
    category: 'Reaction',
    description: "Sends a smug reaction",
    slash: 'both',
    guildOnly: true,
    testOnly: false,
    cooldown: "5s",

    callback: async ({ }) => {
        let mediaString = (new MediaService(CommandType.Smug)).getMedia()
        const embed = new MessageEmbed()
            .setImage(mediaString)
        return embed
    },
} as ICommand