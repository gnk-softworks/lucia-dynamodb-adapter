import {
    Adapter,
    DatabaseSession,
    DatabaseUser,
    type RegisteredDatabaseSessionAttributes,
    UserId
} from 'lucia';
import {DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand} from '@aws-sdk/client-dynamodb';
import {QueryCommand} from '@aws-sdk/lib-dynamodb';
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb';

interface DynamoDBSession {
    userId: UserId;
    expiresAt: string;
    id: string;
    attributes: RegisteredDatabaseSessionAttributes;
    ttl: number;
}

interface DynamoDBAdapterConfig {
    client: DynamoDBClient;
    sessionTableName: string;
    sessionUserIndexName: string;
    getUser: (userId: UserId) => Promise<DatabaseUser | null>;
}

export class DynamoDBAdapter implements Adapter {

    private client: DynamoDBClient;
    private readonly sessionTableName: string;
    private readonly sessionUserIndexName: string;
    private readonly getUser: (userId: UserId) => Promise<DatabaseUser | null>;

    constructor(config: DynamoDBAdapterConfig) {
        this.client = config.client;
        this.sessionTableName = config.sessionTableName;
        this.sessionUserIndexName = config.sessionUserIndexName;
        this.getUser = config.getUser;
    }

    async deleteExpiredSessions(): Promise<void> {
        console.log("Expired sessions deleted by DynamoDB ttl. No need to implement this method.")
    }

    async deleteSession(sessionId: string): Promise<void> {
        const command = new DeleteItemCommand({
            TableName: this.sessionTableName,
            Key: {
                id: { S: sessionId },
            },
        });
        await this.client.send(command);
    }

    async deleteUserSessions(userId: UserId): Promise<void> {
        let sessions = await this.getUserSessions(userId);
        for (const session of sessions) {
            await this.deleteSession(session.id);
        }
    }

    async getSessionAndUser(sessionId: string): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {

        const session = await this.getSession(sessionId);
        if(!session) {
            return [null, null];
        }

        const user = await this.getUser(session.userId);
        if(!user) {
            return [null, null];
        }
        return [session, user];
    }

    async getSession(sessionId: string): Promise<DatabaseSession | null> {
        const command = new GetItemCommand({
            TableName: this.sessionTableName,
            Key: {
                id: { S: sessionId },
            },
        })

        const response = await this.client.send(command);
        if(!response.Item) {
            return null;
        }
        const dynamoSession = unmarshall(response.Item) as DynamoDBSession;
        return mapDynamoDBSessionToDatabaseSession(dynamoSession);
    }

    async getUserSessions(userId: UserId): Promise<DatabaseSession[]> {
        const command = new QueryCommand({
            TableName: this.sessionTableName,
            IndexName: this.sessionUserIndexName,
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: {
                ":userId": { S: userId },
            },
        });

        const response = await this.client.send(command);
        return response.Items?.map((item) => {
            const dynamoSession = unmarshall(item) as DynamoDBSession;
            return mapDynamoDBSessionToDatabaseSession(dynamoSession);
        }) || [];
    }

    async setSession(session: DatabaseSession): Promise<void> {
        const command = new PutItemCommand({
            TableName: this.sessionTableName,
            Item: marshall(mapDatabaseSessionToDynamoDBSession(session))
        });
        await this.client.send(command);
    }

    async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
        const session = await this.getSession(sessionId);
        if(!session) {
            return ;
        }
        session.expiresAt = expiresAt;
        await this.setSession(session);
    }

}

function mapDatabaseSessionToDynamoDBSession(session: DatabaseSession): DynamoDBSession {
    return {
        userId: session.userId,
        expiresAt: session.expiresAt.toISOString(),
        id: session.id,
        attributes: session.attributes,
        ttl: Math.floor(session.expiresAt.getTime() / 1000),
    }
}

function mapDynamoDBSessionToDatabaseSession(dynamoSession: DynamoDBSession): DatabaseSession {
    return {
        userId: dynamoSession.userId,
        expiresAt: new Date(dynamoSession.expiresAt),
        id: dynamoSession.id,
        attributes: dynamoSession.attributes,
    }
}