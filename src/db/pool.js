import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
console.log(
    "DB port :",
    new URL( process.env.DATABASE_URL).port
  );
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}
