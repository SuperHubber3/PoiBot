import type { Client, Message, TextChannel } from "discord.js";
import WOKCommands from "wokcommands";
import { IAward } from "../models/award-schema";

export default (client: Client, instance: WOKCommands) => {
    client.on("awardDeserved", async (awardItem: IAward, userId: string, guildId: string, message: Message) => {
        console.log('awardDeserved!')
        message.reply({ content: `<@${userId}> you got reward! Reward for ${awardItem.countNeeded} ${awardItem.type}s. Silver: ${awardItem.silverReward}` })
    });
};
