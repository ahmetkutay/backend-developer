import { MongoClient, Db } from 'mongodb';

export interface Mongo {
  client: MongoClient;
  db: Db;
}

function getDbNameFromUri(uri: string, fallback = 'inventory'): string {
  const lastSlash = uri.lastIndexOf('/');
  if (lastSlash === -1) return fallback;
  const name = uri.substring(lastSlash + 1).split('?')[0];
  return name || fallback;
}

export async function connectMongo(uri: string): Promise<Mongo> {
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = getDbNameFromUri(uri);
  const db = client.db(dbName);
  return { client, db };
}

export async function closeMongo(mongo: Mongo | null) {
  try {
    await mongo?.client.close();
  } catch {}
}
