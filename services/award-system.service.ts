import { CommandType } from "../enums/command.enum";
import awardSchema from "../models/award-schema";
import { IAward } from "../models/award-schema";
import mongoose from 'mongoose'
import userAwardSchema from "../models/user-award-schema";
import profileSchema from "../models/profile-schema";
import client from "..";
import { Message } from "discord.js";

export class AwardSystemService {
    type: CommandType

    constructor(type: CommandType) {
        this.type = type
    }

    async checkForAward(guildId: string, userId: string, count: number, message: Message): Promise<boolean> {
        const isAwardDeserved = await this.isAwardDeserved(count)
        const awardItem: IAward = isAwardDeserved[1] as IAward

        if (isAwardDeserved[0]) {
            this.addUserAward(guildId, userId, awardItem)
            this.updateUserProfile(guildId, userId, awardItem.silverReward)
            client.emit('awardDeserved', awardItem, userId, guildId, message)

            return true
        }

        return false
    }

    async updateUserProfile(guildId: string, userId: string, silver: number) {
        await profileSchema.findOne({
            guildId,
            userId,
        }).then((schema: any) => {
            if (!schema) {
                schema = new profileSchema({
                    guildId,
                    userId,
                    silver
                });
                return schema.save(function (err: any) {
                    if (err) throw err;
                });
            }

            schema.silver += silver;
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        })
    }

    async addUserAward(guildId: string, userId: string, awardItem: IAward) {
        userAwardSchema.findOne({
            guildId,
            userId,
        }, async (err: any, schema: any) => {
            if (!schema) {
                schema = new userAwardSchema({
                    guildId,
                    userId,
                    awards: [awardItem._id],
                });
                return schema.save(function (err: any) {
                    if (err) throw err;
                });
            }

            const awards = schema.awards;
            const index = awards.findIndex((awardId: any) => awardId === awardItem._id.toString());

            if (index === -1) {
                awards.push(awardItem._id);
            }

            schema.awards = awards;
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        })
    }

    async isAwardDeserved(count: number): Promise<(boolean | IAward | null)[]> {
        const awardItem: IAward | null = await awardSchema.findOne({
            type: this.type.toString(),
            countNeeded: count
        });

        if (awardItem) {
            return [true, awardItem]
        }

        return [false, null]
    }

    public createSchemaIfDoesntExists() {
        mongoose.connection.collection('awards').insertMany(
            [
                {
                    type: CommandType.Hug.toString(),
                    rewardMessage: "Doesn't It Feel Good?!",
                    countNeeded: 10,
                    silverReward: 10
                },
                {
                    type: CommandType.Hug.toString(),
                    rewardMessage: "Hug Addict!",
                    countNeeded: 500,
                    silverReward: 500
                },
                {
                    type: CommandType.Hug.toString(),
                    rewardMessage: "Hug Master!",
                    countNeeded: 1000,
                    silverReward: 1000
                },
                {
                    type: CommandType.Hug.toString(),
                    rewardMessage: "Hug Champion!",
                    countNeeded: 5000,
                    silverReward: 5000
                },
                {
                    type: CommandType.Hug.toString(),
                    rewardMessage: "God Of All Hugs!",
                    countNeeded: 10000,
                    silverReward: 10000
                },
                {
                    type: CommandType.Boop.toString(),
                    rewardMessage: "Boop lover!",
                    countNeeded: 10,
                    silverReward: 10
                },
                {
                    type: CommandType.Boop.toString(),
                    rewardMessage: "Boop enthusiast!",
                    countNeeded: 500,
                    silverReward: 500
                },
                {
                    type: CommandType.Boop.toString(),
                    rewardMessage: "Boop Master!",
                    countNeeded: 1000,
                    silverReward: 1000
                },
                {
                    type: CommandType.Boop.toString(),
                    rewardMessage: "Boop Champion!",
                    countNeeded: 5000,
                    silverReward: 5000
                },
                {
                    type: CommandType.Boop.toString(),
                    rewardMessage: "God Of All Boops!",
                    countNeeded: 10000,
                    silverReward: 10000
                },
                {
                    type: CommandType.Pat.toString(),
                    rewardMessage: "Cute!",
                    countNeeded: 10,
                    silverReward: 10
                },
                {
                    type: CommandType.Pat.toString(),
                    rewardMessage: "Hair messy upper!",
                    countNeeded: 500,
                    silverReward: 500
                },
                {
                    type: CommandType.Pat.toString(),
                    rewardMessage: "Pat Master!",
                    countNeeded: 1000,
                    silverReward: 1000
                },
                {
                    type: CommandType.Pat.toString(),
                    rewardMessage: "Pat Champion!",
                    countNeeded: 5000,
                    silverReward: 5000
                },
                {
                    type: CommandType.Pat.toString(),
                    rewardMessage: "God Of All Pats!",
                    countNeeded: 10000,
                    silverReward: 10000
                },
                {
                    type: CommandType.Slap.toString(),
                    rewardMessage: "Ouch!",
                    countNeeded: 10,
                    silverReward: 10
                },
                {
                    type: CommandType.Slap.toString(),
                    rewardMessage: "Mean!",
                    countNeeded: 500,
                    silverReward: 500
                },
                {
                    type: CommandType.Slap.toString(),
                    rewardMessage: "Fast Hands!",
                    countNeeded: 1000,
                    silverReward: 1000
                },
                {
                    type: CommandType.Slap.toString(),
                    rewardMessage: "They're Red!",
                    countNeeded: 5000,
                    silverReward: 5000
                },
                {
                    type: CommandType.Slap.toString(),
                    rewardMessage: "Bleeding Hands!",
                    countNeeded: 10000,
                    silverReward: 10000
                },
                {
                    type: CommandType.Bite.toString(),
                    rewardMessage: "Itching Teeth!",
                    countNeeded: 10,
                    silverReward: 10
                },
                {
                    type: CommandType.Bite.toString(),
                    rewardMessage: "It's Sharp!",
                    countNeeded: 500,
                    silverReward: 500
                },
                {
                    type: CommandType.Bite.toString(),
                    rewardMessage: "Bite Master!",
                    countNeeded: 1000,
                    silverReward: 1000
                },
                {
                    type: CommandType.Bite.toString(),
                    rewardMessage: "Bite Champion!",
                    countNeeded: 5000,
                    silverReward: 5000
                },
                {
                    type: CommandType.Bite.toString(),
                    rewardMessage: "God Of All Bites!",
                    countNeeded: 10000,
                    silverReward: 10000
                }
            ]
        )
    }
}