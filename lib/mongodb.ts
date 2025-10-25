import { MongoClient } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const options = {};

let memoizedUri: string | null = null;
let clientPromise: Promise<MongoClient> | undefined;

function getMongoUri(): string {
  if (memoizedUri) {
    return memoizedUri;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  memoizedUri = uri;
  return memoizedUri;
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(getMongoUri(), options);
  return client.connect();
}

export function getMongoClientPromise(): Promise<MongoClient> {
  if (clientPromise) {
    return clientPromise;
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createClientPromise();
    }
    clientPromise = global._mongoClientPromise;
    return clientPromise;
  }

  clientPromise = createClientPromise();
  return clientPromise;
}

export default getMongoClientPromise;
