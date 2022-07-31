import fs from 'fs'
import { CommandType } from "../enums/command.enum";

export class MediaService {
    type: CommandType

    constructor(type: CommandType) {
        this.type = type
    }

    getFilename(): string {
        return this.type.toString()
    }

    getMedia(): string {
        let fileName: string = this.getFilename()
        let dataArray = JSON.parse(fs.readFileSync('./media/' + fileName + '.json', 'utf-8'))

        let randomElement = Math.floor(Math.random() * dataArray.length)
        return dataArray[randomElement]
    }
}