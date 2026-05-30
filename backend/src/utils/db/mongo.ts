import { MongoClient, Db } from "mongodb";

import { generateUniqueId } from "../id";
import type { Case } from "../../types";

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db) return db;

  try {
    await client.connect();
    console.log("MongoDB connected");
    db = client.db("notis");
    return db;
  } catch (error) {
    console.error("Mongo connection error:", error);
    throw error;
  }
}
export async function casesCol() {
  const db = await connectDB();
  return db.collection<Case>("cases");
}
export async function getCollection<T>(name: string) {
  const database = await connectDB();
  return database.collection(name);
}
