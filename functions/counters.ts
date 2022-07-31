	import { Client } from 'discord.js'
import counterSchema from '../models/command-counter-schema'
const wait = require('util').promisify(setTimeout);

const boopsCache = {} as { [key: string]: number }

export default (client: Client) => { }

export const addBoop = async (guildId: string, userId: string, partnerId: string) => {
    console.log("Running findOneAndUpdate()");
    let boopCount = 1
    counterSchema.findOne({
        guildId,
        userId,
    }, async function (err: any, schema: any) {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                boops: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const boops = schema.boops;
        const index = boops.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            boops.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            boops[index].count += 1;
            boopCount = boops[index].count
        }
        schema.boops = boops;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    }
    )
    await wait(1000); // this wait is sus if you can find another way to do it, it will be nice

    boopsCache[`${guildId}-${userId}`] = boopCount;
    return boopCount;
};

export const getBoop = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = boopsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let boops = 0;
    if (result) {
        result.boops.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                boops = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            boops: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    boopsCache[`${guildId}-${userId}`] = boops;

    return boops;
};

export const config = {
    displayName: 'Command Counters',
    dbName: 'COUNTERS',
}