import { Hono } from 'hono';
import { cors } from "hono/cors";
import { env, getDatabaseConfig } from "./env.js";
import { Pool } from "pg";
import {z} from "zod";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";

//ハッシュ関数
const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);

  const key = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });

  return `${salt.toString("hex")}:${key.toString("hex")}`;
};

let pool: Pool | undefined;
const getPool = () => {
  if (!pool) {
    const databaseConfig = getDatabaseConfig();
    pool = new Pool({
      host: databaseConfig.DATABASE_HOST,
      port: databaseConfig.DATABASE_PORT,
      database: databaseConfig.DATABASE_NAME,
      user: databaseConfig.DATABASE_USER,
      password: databaseConfig.DATABASE_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
};

const toYMD = (d: Date) => {
  return d.toISOString().slice(0, 10);
};

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: [env.FRONTEND_URL],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/transactions", async (c) => {
  const type = c.req.query("type");

  if (!type || !["income", "expense", "all"].includes(type)) {
    return c.json(
      {message: "typeはincome, expense, allのいずれかである必要があります"},
      400,
    );
  }

  let historyQuery = 'SELECT id, item, amount, date FROM transactions';

  let countQuery = 'SELECT COUNT(*) as total FROM transactions';

  const params: string[] = [];

  if (type === "income" || type === "expense"){
    const addTypeQuery = 
      type === "income" ? ' WHERE amount > 0' : ' WHERE amount < 0' ;
      historyQuery += addTypeQuery;
      countQuery += addTypeQuery;
  }

  historyQuery += ' ORDER BY date DESC';

  const historyResult = await getPool().query(historyQuery, params);
  const countResult = await getPool().query(countQuery, params);

  const transactions = historyResult.rows.map((row) => ({
    id: parseInt(row.id),
    item: row.item,
    amount: parseFloat(row.amount),
    date: toYMD(new Date(row.date)),
  }));

  const totalAmount = transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  const result = {
    transactions,
    totalCount: parseInt(countResult.rows[0].total, 10),
    totalAmount,
  };

  return c.json(result, 200);
});

//ポストを行うAPI
app.post("/transactions", async (c) => {
  const body = await c.req.json();

  const { item, amount, date } = body;

  if (!item || amount === undefined || !date) {
    return c.json({message: "必須項目が不足しています"}, 400);
  }

  if (typeof amount !== "number" || amount === 0) {
    return c.json({message: "金額は0以外の数値である必要があります"}, 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({message: "日付はYYYY-MM-DD形式で入力してください"}, 400);
  }

  const result = await getPool().query(
    'INSERT INTO transactions (item, amount, date) VALUES ($1, $2, $3) RETURNING id, item, amount, date',
    [item, amount, date]
  );

  const newTransaction = {
    id: parseInt(result.rows[0].id),
    item: result.rows[0].item,
    amount: parseFloat(result.rows[0].amount),
    date: toYMD(new Date(result.rows[0].date)),
  };

  return c.json(newTransaction, 201);
});

//削除を行うAPI
app.delete("/transactions/:id", async (c) => {
  const id = c.req.param("id"); // 例: "12"
  const numericId = Number(id); // 例: 12
  
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) {
    return c.json({ message: "idは正の整数である必要があります" }, 400);
}
  const result = await getPool().query(
    'DELETE FROM transactions WHERE id = $1 RETURNING id',[numericId]
  );

  if (result.rowCount != 1){
    return c.json({message: "削除が正常に行えませんでした"}, 404);
  }
  return c.body(null,204);
});

//サインアップ機能のAPI
app.post("/auth/signup", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);

  const signupSchema = z.object({
    userId: z.string().trim().min(1).max(50),
    password: z.string().min(8).max(128),
  });

  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { message: "IDは1〜50文字、パスワードは8〜128文字で入力してください" },
      400,
    );
  }

  const { userId, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  try {
    await getPool().query(
      "INSERT INTO users (user_id, password_hash) VALUES ($1, $2)",
      [userId, passwordHash],
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return c.json({ message: "このIDはすでに使われています" }, 409);
    }

    throw error;
  }

  return c.json({ message: "登録完了しました" }, 201);
});

export default app;
