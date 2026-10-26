import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { env, getDatabaseConfig } from "./env.js";
import { Pool } from "pg";
import {z} from "zod";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, Next } from "hono";

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

//パスワードハッシュ一致判定
const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const [saltHex, keyHex] = storedHash.split(":");

  if (
    !saltHex ||
    !keyHex ||
    !/^[a-f\d]{32}$/i.test(saltHex) ||
    !/^[a-f\d]{128}$/i.test(keyHex)
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");

  const actualKey = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, expectedKey.length, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });

  return timingSafeEqual(actualKey, expectedKey);
};

//セッションIDのハッシュ関数
const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

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

//セッショントークン検証
type AppEnv = {
  Variables: {
    userId: string;
  };
};

const app = new Hono<AppEnv>();

const requireAuthenticatedUser: MiddlewareHandler<AppEnv> = async (c, next) => {
    const sessionToken = getCookie(c, "kakeibo_session");

  if (!sessionToken) {
    return c.json({ message: "ログインが必要です" }, 401);
  }

  //トークンをDBのセッションと照合する
  const result = await getPool().query(
    `SELECT user_id
    FROM user_sessions
    WHERE token_hash = $1
    AND expires_at > NOW()`,
    [hashSessionToken(sessionToken)],
  );

  const session = result.rows[0];

  if (!session) {
    return c.json({ message: "セッションが無効か、有効期限が切れています" }, 401);
  }

  c.set("userId", String(session.user_id));
  await next();
};

app.use(
  "/*",
  cors({
    origin: [env.FRONTEND_URL],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/auth/me", requireAuthenticatedUser, async (c) => {
  const result = await getPool().query(
    "SELECT user_id FROM users WHERE id = $1",
    [c.get("userId")],
  );
  const user = result.rows[0];

  if (!user) {
    return c.json({ message: "ユーザーが見つかりません" }, 401);
  }

  return c.json({ userId: user.user_id });
});

app.post("/auth/logout", async (c) => {
  const sessionToken = getCookie(c, "kakeibo_session");

  if (sessionToken) {
    await getPool().query(
      "DELETE FROM user_sessions WHERE token_hash = $1",
      [hashSessionToken(sessionToken)],
    );
  }

  deleteCookie(c, "kakeibo_session", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });

  return c.body(null, 204);
});

app.get("/transactions",requireAuthenticatedUser,  async (c) => {
  const type = c.req.query("type");

  if (!type || !["income", "expense", "all"].includes(type)) {
    return c.json(
      {message: "typeはincome, expense, allのいずれかである必要があります"},
      400,
    );
  }

  let historyQuery = 'SELECT id, item, amount, date FROM transactions WHERE user_id = $1';

  let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = $1';

  const params: string[] = [c.get("userId")];

  if (type === "income" || type === "expense"){
    const addTypeQuery = 
      type === "income" ? ' AND amount > 0' : ' AND amount < 0' ;
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
app.post("/transactions", requireAuthenticatedUser, async (c) => {
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
    `INSERT INTO transactions (item, amount, date, user_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, item, amount, date`,
    [item, amount, date, c.get("userId")],
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
app.delete("/transactions/:id", requireAuthenticatedUser, async (c) => {
  const id = c.req.param("id"); // 例: "12"
  const numericId = Number(id); // 例: 12
  
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) {
    return c.json({ message: "idは正の整数である必要があります" }, 400);
  }
  const result = await getPool().query(
    "DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id",
    [numericId, c.get("userId")],
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

//ログイン機能のAPI
app.post("/auth/login", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);

  const loginSchema = z.object({
    userId: z.string().trim().min(1).max(50),
    password: z.string().min(1).max(128),
  });

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: "IDとパスワードを入力してください" }, 400);
  }

  const { userId, password } = parsed.data;

  const result = await getPool().query(
    "SELECT id, user_id, password_hash FROM users WHERE user_id = $1",
    [userId],
  );

  const user = result.rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ message: "IDまたはパスワードが正しくありません" }, 401);
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await getPool().query(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(sessionToken), user.id, expiresAt],
  );

  setCookie(c, "kakeibo_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({ user: { id: user.id, userId: user.user_id } }, 200);
});

//推論APIとの通信
app.post("/receipts/predict", requireAuthenticatedUser, async (c) => {
  let form: FormData;

  try {
    form = await c.req.formData();
  } catch {
    return c.json({ message: "画像をフォーム形式で送信してください" }, 400);
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return c.json({ message: "fileに画像を指定してください" }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return c.json({ message: "画像ファイルを指定してください" }, 400);
  }

  if (file.size > 10 * 1024 * 1024) {
    return c.json({ message: "画像は10MB以下にしてください" }, 413);
  }

  const modelForm = new FormData();
  modelForm.append("file", file, file.name);

  let response: Response;

  try {
    response = await fetch(`${env.MODEL_API_URL}/predict`, {
      method: "POST",
      body: modelForm,
    });
  } catch (error) {
    console.error("モデルAPIへの接続に失敗しました", error);
    return c.json({ message: "金額予測サービスに接続できません" }, 502);
  }

  if (!response.ok) {
    console.error("モデルAPIがエラーを返しました", response.status);
    return c.json({ message: "金額を予測できませんでした" }, 502);
  }

  const result: unknown = await response.json().catch(() => null);
  const parsed = z.object({
    predicted_yen: z.number().int(),
  }).safeParse(result);

  if (!parsed.success) {
    console.error("モデルAPIのレスポンス形式が不正です");
    return c.json({ message: "予測サービスから不正な応答がありました" }, 502);
  }

  return c.json(parsed.data);
});

export default app;
