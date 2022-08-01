import { CommandType } from "../enums/command.enum";
import awardSchema from "../models/award-schema";
import { IAward } from "../models/award-schema";
import { Collection } from 'mongoose'
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

    async checkForAward(guildId: string, userId: string, count: number, message: Message): Promise<boolean>
    {
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

    async updateUserProfile(guildId: string, userId: string, silver: number)
    {
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

    async addUserAward(guildId: string, userId: string, awardItem: IAward)
    {
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

    async isAwardDeserved(count: number): Promise<(boolean | IAward|null)[]>
    {
        const awardItem: IAward|null = await awardSchema.findOne({ 
            type: this.type.toString(),
            countNeeded: count
        });

        if (awardItem) {
            return [true, awardItem]
        }

        return [false, null]
    }

    public createSchemaIfDoesntExists()
    {
        mongoose.connection.collection('awards').insertMany(
            [
                {
                    type: CommandType.Hug.toString(),
                    countNeeded: 5,
                    silverReward: 10
                },
                {
                    type: CommandType.Hug.toString(),
                    countNeeded: 10,
                    silverReward: 20
                }
            ]
        )
    }
}