import { Command } from "@oclif/command";
import Lift from "../plugin";

export default class Deploy extends Command {
    static description = "deploy the application";

    async run(): Promise<void> {
        const lift = new Lift();
        await lift.deploy();
    }
}
