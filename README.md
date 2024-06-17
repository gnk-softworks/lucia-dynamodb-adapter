# lucia-dynamodb-adapter
An easy to set up adapter allowing you to use DynamoDB with the 'lucia-auth' library (v3). 

## Installation
```bash
npm install --save lucia-dynamodb-adapter
```

## Features
- [x] Easy to set up, initialize adapter with some basic config and pass it to the 'lucia-auth' library
- [x] DynamoDB TTL based session expiration
- [x] Use your own user table by providing a "getUser" function

## Usage

### DynamoDB Setup (CDK Example)

Below is a basic example of how to set up a DynamoDB table for storing sessions with a global secondary index for the user id. This is a basic example, you may need to customise it to fit your needs. 

You do not need to set this up using CDK, you can also set it up using cloudformation, manually in the AWS console or using any other method you prefer.
```ts
const sessionTable = new dynamodb.Table(customResourceStack, `SessionTable`, {
    tableName: 'lucia-sessions',
    partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PROVISIONED,
    readCapacity: 1,
    writeCapacity: 1,
    timeToLiveAttribute: "ttl"
})

sessionTable.addGlobalSecondaryIndex({
    indexName: 'lucia-sessions-user-index',
    partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    readCapacity: 1,
    writeCapacity: 1
});
```


### Configuring the adapter
DynamoDBAdapterConfig:
- `client` - An instance of DynamoDB client setup with your configuration (Region, credentials, etc.)
- `sessionTableName` - The name of the table in dynamodb for storing sessions (Needs to be created with the correct schema)
- `sessionUserIndexName` - The name of the index in the session table for the user id
- `getUser` - A function that takes a user id, loads the user from your db and returns it as a Lucia user object

```ts
import {Lucia, Session, User} from "lucia";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBAdapter} from "@/lucia/DynamoDBAdapter";
import {getUserFromDb} from "your-user-db";

//Create a new DynamoDB client
const client = new DynamoDBClient();

// Create a function to get a user from your own user table then pass it to the adapter as a Lucia user
async function getUser(userId: string): Promise<User | null> {
    //Get the user from your own user table
    const user = await getUserFromDb(userId);
    
    //If the user does not exist, return null
    if (!user) {
        return null;
    }
    
    //Return the user as a Lucia user. This example assumes that the attributes field has been customised to include a username. See more in this tutorial https://lucia-auth.com/tutorials/username-and-password/
    return {
        id: user.id,
        attributes: {
            username: user.username,
        },
    };
}

//Create a new adapter with the required parameters
const adapter = new DynamoDBAdapter({
    client,
    sessionTableName: "lucia-sessions",
    sessionUserIndexName: "lucia-sessions-user-index",
    getUser: getUser,
});

//Use the adapter with the 'lucia-auth' library as you would with any other adapter
```

## Contributions
If you want to improve the library, please create a pull request.