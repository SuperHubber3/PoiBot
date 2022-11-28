import { Client, Message } from 'discord.js'
import profileSchema from '../models/profile-schema'

const silverCache = {} as { [key: string]: number }

export default (client: Client) => { }

const getNeededXP = (level: number) => level * level * 100;

export const addXP = async (guildId: string, userId: string, xpToAdd: number, message: Message) => {
    const result = await profileSchema.findOneAndUpdate(
        {
            guildId,
            userId,
        },
        {
            guildId,
            userId,
            $inc: {
                xp: xpToAdd,
            },
        },
        {
            upsert: true,
            new: true,
        }
    );

    let { xp, level } = result;
    const needed = getNeededXP(level);

    if (xp >= needed) {
        ++level;
        xp -= needed;

        addSilver(guildId, userId, 50);

        // message.reply(
        //     `You are now level ${level} with ${xp} experience! You earned 50 silver. You now need ${getNeededXP(
        //         level
        //     )} XP to level up again.`
        // );

        await profileSchema.updateOne(
            {
                guildId,
                userId,
            },
            {
                level,
                xp,
            }
        );
    }
};

export const getXP = async (guildId: string, userId: string) => {
    const result = await profileSchema.findOne({
        guildId,
        userId,
    });

    let xp = 0;
    if (result) {
        xp = result.xp;
    } else {
        console.log("Inserting a document");
        await new profileSchema({
            guildId,
            userId,
            xp,
        }).save();
    }

    return xp;
};

export const addSilver = async (guildId: string, userId: string, silver: number) => {
    console.log("Running findOneAndUpdate()");

    const result = await profileSchema.findOneAndUpdate(
        {
            guildId,
            userId,
        },
        {
            guildId,
            userId,
            $inc: {
                silver,
            },
        },
        {
            upsert: true,
            new: true,
        }
    );

    silverCache[`${guildId}-${userId}`] = result.silver;

    return result.silver;
};

export const getSilver = async (guildId: string, userId: string) => {
    const cachedValue = silverCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await profileSchema.findOne({
        guildId,
        userId,
    });

    let silver = 0;
    if (result) {
        silver = result.coins;
    } else {
        console.log("Inserting a document");
        await new profileSchema({
            guildId,
            userId,
            silver,
        }).save();
    }

    silverCache[`${guildId}-${userId}`] = silver;

    return silver;
};

export const config = {
    displayName: 'Economy',
    dbName: 'ECONOMY',
}