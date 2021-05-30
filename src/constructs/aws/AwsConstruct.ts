import { PolicyStatement } from '../../Stack';
import Construct from '../Construct';

export default interface AwsConstruct extends Construct {
    postDeploy?(): Promise<void>;

    preRemove?(): Promise<void>;

    permissions?(): PolicyStatement[];
}
