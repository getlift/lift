export class PolicyStatement {
    Effect = "Allow";
    Action: string | string[];
    Resource: string | Array<unknown>;
    constructor(Action: string | string[], Resource: string | Array<unknown>) {
        this.Action = Action;
        this.Resource = Resource;
    }
}
