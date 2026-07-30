import { container } from "@sapphire/framework";
import { CommandType } from "../enums/command.enum.js";
import { AWARD_TIER_REWARDS } from "../economy/prices.js";
import awardSchema, { IAward } from "../models/award-schema.js";
import userAwardSchema from "../models/user-award-schema.js";
import { addSilverOnce } from "../functions/economy.js";
import type { AwardReplyTarget } from "../types.js";

export class AwardSystemService {
    type: CommandType

    constructor(type: CommandType) {
        this.type = type
    }

    async checkForAward(guildId: string, userId: string, count: number, message: AwardReplyTarget): Promise<boolean> {
        const awardItems = await this.unclaimedAwardsAtOrBelow(guildId, userId, count)
        let granted = false
        for (const awardItem of awardItems) {
            // Credit first with a durable key. If ownership persistence fails,
            // the next counter increment retries the ownership write without
            // paying again.
            await this.updateUserProfile(
                guildId,
                userId,
                awardItem.silverReward,
                `award:${String(awardItem._id)}`
            )
            const inserted = await this.addUserAward(guildId, userId, awardItem)
            if (!inserted) continue
            container.client.emit('awardDeserved', awardItem, userId, guildId, message)
            granted = true
        }
        return granted
    }

    async updateUserProfile(
        guildId: string,
        userId: string,
        silver: number,
        creditKey: string
    ) {
        await addSilverOnce(guildId, userId, silver, creditKey)
    }

    async addUserAward(guildId: string, userId: string, awardItem: IAward): Promise<boolean> {
        try {
            const result = await userAwardSchema.updateOne(
                { guildId, userId },
                {
                    $setOnInsert: { guildId, userId },
                    $addToSet: { awards: awardItem._id },
                },
                { upsert: true }
            )
            return (result.modifiedCount ?? 0) > 0 || (result.upsertedCount ?? 0) > 0
        } catch (error: any) {
            if (error?.code === 11000) {
                const result = await userAwardSchema.updateOne(
                    { guildId, userId },
                    { $addToSet: { awards: awardItem._id } }
                )
                return (result.modifiedCount ?? 0) > 0
            }
            throw error
        }
    }

    async unclaimedAwardsAtOrBelow(
        guildId: string,
        userId: string,
        count: number
    ): Promise<IAward[]> {
        const owned = await userAwardSchema.findOne({ guildId, userId }).select('awards')
        return awardSchema.find({
            type: this.type.toString(),
            countNeeded: { $lte: count },
            _id: { $nin: owned?.awards ?? [] },
        }).sort({ countNeeded: 1 })
    }

    // Idempotent: upserts each award by (type, countNeeded) so it can be re-run
    // to add newly-introduced award types without duplicating existing ones.
    public createSchemaIfDoesntExists() {
        return seedAwardDefinitions()
    }
}

type AwardDefinition = { type: string; rewardMessage: string; countNeeded: number; silverReward: number }

const award = (type: CommandType, rewardMessage: string, countNeeded: number, tierIndex: number): AwardDefinition => ({
    type: type.toString(),
    rewardMessage,
    countNeeded,
    silverReward: AWARD_TIER_REWARDS[tierIndex],
})

const AWARD_DEFINITIONS: AwardDefinition[] = [
    award(CommandType.Hug, "Doesn't It Feel Good?!", 10, 0),
    award(CommandType.Hug, "Hug Addict!", 500, 1),
    award(CommandType.Hug, "Hug Master!", 1000, 2),
    award(CommandType.Hug, "Hug Champion!", 5000, 3),
    award(CommandType.Hug, "God Of All Hugs!", 10000, 4),
    award(CommandType.Boop, "Boop lover!", 10, 0),
    award(CommandType.Boop, "Boop enthusiast!", 500, 1),
    award(CommandType.Boop, "Boop Master!", 1000, 2),
    award(CommandType.Boop, "Boop Champion!", 5000, 3),
    award(CommandType.Boop, "God Of All Boops!", 10000, 4),
    award(CommandType.Pat, "Cute!", 10, 0),
    award(CommandType.Pat, "Hair messy upper!", 500, 1),
    award(CommandType.Pat, "Pat Master!", 1000, 2),
    award(CommandType.Pat, "Pat Champion!", 5000, 3),
    award(CommandType.Pat, "God Of All Pats!", 10000, 4),
    award(CommandType.Slap, "Ouch!", 10, 0),
    award(CommandType.Slap, "Mean!", 500, 1),
    award(CommandType.Slap, "Fast Hands!", 1000, 2),
    award(CommandType.Slap, "They're Red!", 5000, 3),
    award(CommandType.Slap, "Bleeding Hands!", 10000, 4),
    award(CommandType.Bite, "Itching Teeth!", 10, 0),
    award(CommandType.Bite, "It's Sharp!", 500, 1),
    award(CommandType.Bite, "Bite Master!", 1000, 2),
    award(CommandType.Bite, "Bite Champion!", 5000, 3),
    award(CommandType.Bite, "God Of All Bites!", 10000, 4),
    award(CommandType.Punch, "That'll Bruise!", 10, 0),
    award(CommandType.Punch, "Brawler!", 500, 1),
    award(CommandType.Punch, "Punch Master!", 1000, 2),
    award(CommandType.Punch, "Punch Champion!", 5000, 3),
    award(CommandType.Punch, "God Of All Punches!", 10000, 4),
    award(CommandType.Cuddle, "Warm And Cozy!", 10, 0),
    award(CommandType.Cuddle, "Cuddle Bug!", 500, 1),
    award(CommandType.Cuddle, "Cuddle Master!", 1000, 2),
    award(CommandType.Cuddle, "Cuddle Champion!", 5000, 3),
    award(CommandType.Cuddle, "God Of All Cuddles!", 10000, 4),
    award(CommandType.Geh, "So Geh!", 10, 0),
    award(CommandType.Geh, "Geh Enthusiast!", 500, 1),
    award(CommandType.Geh, "Geh Master!", 1000, 2),
    award(CommandType.Geh, "Geh Champion!", 5000, 3),
    award(CommandType.Geh, "God Of All Gehs!", 10000, 4),
    award(CommandType.Kill, "First Blood!", 10, 0),
    award(CommandType.Kill, "Killing Spree!", 500, 1),
    award(CommandType.Kill, "Kill Master!", 1000, 2),
    award(CommandType.Kill, "Kill Champion!", 5000, 3),
    award(CommandType.Kill, "God Of All Kills!", 10000, 4),
]

/** Idempotently creates or updates every built-in award definition. */
export function seedAwardDefinitions() {
    return awardSchema.bulkWrite(
        AWARD_DEFINITIONS.map((definition) => ({
            updateOne: {
                filter: {
                    type: definition.type,
                    countNeeded: definition.countNeeded,
                },
                update: { $set: definition },
                upsert: true,
            },
        }))
    )
}
