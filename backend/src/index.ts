import { Hono } from 'hono';
import { cors } from "hono/cors";
import { env, getDatabaseConfig } from "./env.js";
import { Pool } from "pg";

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

export default app;
