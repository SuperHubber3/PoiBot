import { CommandType } from '../../enums/command.enum'
import counterSchema from '../../models/command-counter-schema'
import { AwardSystemService } from '../award-system.service'

export class HugService {
    guildId: string
    userId: string
    partnerId: string

    constructor(guildId: string, userId: string, partnerId: string) {
        this.guildId = guildId
        this.userId = userId
        this.partnerId = partnerId
    }

    async addHug(guildId: string, userId: string, partnerId: string) {
        let hugCount = 1
        console.log("Running findOneAndUpdate()");

        await counterSchema.findOne({
            guildId,
            userId,
        }, async (err: any, schema: any) => {
            if (!schema) {
                schema = new counterSchema({
                    guildId,
                    userId,
                    hugs: [{
                        userId: partnerId,
                        count: 1,
                    }],
                });
                return schema.save(function (err: any) {
                    if (err) throw err;
                });
            }
    
            const hugs = schema.hugs;
            const index = hugs.findIndex((x: any) => x.userId === partnerId);
            if (index === -1) {
                hugs.push({
                    userId: partnerId,
                    count: 1,
                });
            } else {
                hugs[index].count += 1;
                hugCount = hugs[index].count
            }
            schema.hugs = hugs;
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }).clone();

        (new AwardSystemService(CommandType.Hug))

        return hugCount
    }
}