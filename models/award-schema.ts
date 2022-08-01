import { Document } from 'mongoose'
import mongoose from 'mongoose'

const reqStr = { type: String, required: true }
const reqInt = { type: Number, default: 0 }

export interface IAward extends Document {
    _id: string;
    type: string;
    rewardMessage: string;
    countNeeded: number;
    silverReward: number;
}

const awardSchema = new mongoose.Schema({
    _id: { type: mongoose.Types.ObjectId },
    type: reqStr,
    rewardMessage: reqStr,
    countNeeded: reqInt,
    silverReward: reqInt,
});

const name = 'awards'

export default mongoose.models[name] || mongoose.model(name, awardSchema);
