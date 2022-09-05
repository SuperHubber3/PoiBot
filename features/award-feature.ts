import { Client, Message, MessageEmbed } from "discord.js";
import WOKCommands from "wokcommands";
import { IAward } from "../models/award-schema";

export default (client: Client, instance: WOKCommands) => {
    client.on("awardDeserved", async (awardItem: IAward, userId: string, guildId: string, message: Message) => {
        console.log('awardDeserved!')
        const embed = new MessageEmbed()
            .setAuthor({ name: `Achievement unlocked: ${awardItem.rewardMessage}`, iconURL: message.author.displayAvatarURL(), url: `https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands` })
            .setDescription(`Use the ${awardItem.type} command ${awardItem.countNeeded} times`)
            .setFooter({ text: `+${awardItem.silverReward} silver reward` })
            .setColor('RANDOM')
        message.reply({ embeds: [embed], allowedMentions: { parse: [] } })
    });
};

export const config = {
    displayName: 'Award Feature',
    dbName: 'AWARDS',
}
