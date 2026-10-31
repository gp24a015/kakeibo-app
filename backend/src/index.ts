import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { env, getDatabaseConfig } from "./env.js";
import { Pool } from "pg";
import {z} from "zod";
import {
  createHash,
  randomBytes,
  randomUUID,
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

const GUEST_SESSION_COOKIE = "kakeibo_guest";
const GUEST_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

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
    owner: TransactionOwner;
    userId: string;
  };
};

type TransactionOwner =
  | { type: "user"; id: string }
  | { type: "guest"; id: string };

const app = new Hono<AppEnv>();

const setGuestSessionCookie = (c: Context<AppEnv>, token: string) => {
  setCookie(c, GUEST_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE,
  });
};

const createOrRefreshGuestSession = async (
  c: Context<AppEnv>,
): Promise<string> => {
  const token = getCookie(c, GUEST_SESSION_COOKIE);

  if (token) {
    const tokenHash = hashSessionToken(token);
    const existing = await getPool().query(
      "SELECT id FROM guest_sessions WHERE token_hash = $1 AND expires_at > NOW()",
      [tokenHash],
    );

    if (existing.rows[0]) {
      const guestId = String(existing.rows[0].id);
      await getPool().query(
        "UPDATE guest_sessions SET expires_at = NOW() + INTERVAL '30 days' WHERE id = $1",
        [guestId],
      );
      setGuestSessionCookie(c, token);
      return guestId;
    }

    await getPool().query(
      "DELETE FROM guest_sessions WHERE token_hash = $1 AND expires_at <= NOW()",
      [tokenHash],
    );
  }

  await getPool().query("DELETE FROM guest_sessions WHERE expires_at <= NOW()");

  const guestId = randomUUID();
  const newToken = randomBytes(32).toString("hex");
  await getPool().query(
    `INSERT INTO guest_sessions (id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [guestId, hashSessionToken(newToken)],
  );
  setGuestSessionCookie(c, newToken);
  return guestId;
};

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

const requireTransactionOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionToken = getCookie(c, "kakeibo_session");

  if (sessionToken) {
    const result = await getPool().query(
      `SELECT user_id
      FROM user_sessions
      WHERE token_hash = $1
      AND expires_at > NOW()`,
      [hashSessionToken(sessionToken)],
    );

    const session = result.rows[0];
    if (session) {
      const userId = String(session.user_id);
      c.set("owner", { type: "user", id: userId });
      c.set("userId", userId);
      await next();
      return;
    }
  }

  if (!getCookie(c, GUEST_SESSION_COOKIE)) {
    return c.json({ message: "ゲストセッションがありません" }, 401);
  }

  const guestId = await createOrRefreshGuestSession(c);
  c.set("owner", { type: "guest", id: guestId });
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

app.post("/auth/guest", async (c) => {
  await createOrRefreshGuestSession(c);
  return c.json({ type: "guest" }, 200);
});

app.get("/auth/guest/status", async (c) => {
  const token = getCookie(c, GUEST_SESSION_COOKIE);

  if (!token) {
    return c.json({ transactionCount: 0 }, 200);
  }

  const result = await getPool().query(
    `SELECT COUNT(*) AS total
    FROM transactions
    WHERE guest_id = (
      SELECT id FROM guest_sessions
      WHERE token_hash = $1 AND expires_at > NOW()
    )`,
    [hashSessionToken(token)],
  );

  return c.json({ transactionCount: Number(result.rows[0].total) }, 200);
});

app.get("/transactions", requireTransactionOwner, async (c) => {
  const type = c.req.query("type");

  if (!type || !["income", "expense", "all"].includes(type)) {
    return c.json(
      {message: "typeはincome, expense, allのいずれかである必要があります"},
      400,
    );
  }

  const owner = c.get("owner");
  const ownerColumn = owner.type === "user" ? "user_id" : "guest_id";
  const params = [owner.id];
  let historyQuery = `SELECT id, item, amount, date FROM transactions WHERE ${ownerColumn} = $1`;
  let countQuery = `SELECT COUNT(*) as total FROM transactions WHERE ${ownerColumn} = $1`;

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
app.post("/transactions", requireTransactionOwner, async (c) => {
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

  const owner = c.get("owner");
  const result =
    owner.type === "user"
      ? await getPool().query(
          `INSERT INTO transactions (item, amount, date, user_id, guest_id)
          VALUES ($1, $2, $3, $4, NULL)
          RETURNING id, item, amount, date`,
          [item, amount, date, owner.id],
        )
      : await getPool().query(
          `INSERT INTO transactions (item, amount, date, user_id, guest_id)
          VALUES ($1, $2, $3, NULL, $4)
          RETURNING id, item, amount, date`,
          [item, amount, date, owner.id],
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
app.delete("/transactions/:id", requireTransactionOwner, async (c) => {
  const id = c.req.param("id"); // 例: "12"
  const numericId = Number(id); // 例: 12
  
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) {
    return c.json({ message: "idは正の整数である必要があります" }, 400);
  }
  const owner = c.get("owner");
  const ownerColumn = owner.type === "user" ? "user_id" : "guest_id";
  const result = await getPool().query(
    `DELETE FROM transactions WHERE id = $1 AND ${ownerColumn} = $2 RETURNING id`,
    [numericId, owner.id],
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
  const sessionToken = randomBytes(32).toString("hex");
  const guestToken = getCookie(c, GUEST_SESSION_COOKIE);
  const client = await getPool().connect();
  let user: { id: string | number; user_id: string };
  let importedTransactionCount = 0;

  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO users (user_id, password_hash)
      VALUES ($1, $2)
      RETURNING id, user_id`,
      [userId, passwordHash],
    );
    user = userResult.rows[0];

    if (guestToken) {
      const guestResult = await client.query(
        `SELECT id FROM guest_sessions
        WHERE token_hash = $1 AND expires_at > NOW()
        FOR UPDATE`,
        [hashSessionToken(guestToken)],
      );
      const guest = guestResult.rows[0];

      if (guest) {
        const transferResult = await client.query(
          `UPDATE transactions
          SET user_id = $1, guest_id = NULL
          WHERE guest_id = $2`,
          [user.id, guest.id],
        );
        importedTransactionCount = transferResult.rowCount ?? 0;
        await client.query("DELETE FROM guest_sessions WHERE id = $1", [
          guest.id,
        ]);
      }
    }

    await client.query(
      `INSERT INTO user_sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [hashSessionToken(sessionToken), user.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return c.json({ message: "このIDはすでに使われています" }, 409);
    }

    throw error;
  } finally {
    client.release();
  }

  setCookie(c, "kakeibo_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  if (guestToken) {
    deleteCookie(c, GUEST_SESSION_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
    });
  }

  return c.json(
    {
      message: "登録完了しました",
      user: { id: user.id, userId: user.user_id },
      importedTransactionCount,
    },
    201,
  );
});

//ログイン機能のAPI
app.post("/auth/login", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);

  const loginSchema = z.object({
    userId: z.string().trim().min(1).max(50),
    password: z.string().min(1).max(128),
    importGuestTransactions: z.boolean().optional().default(false),
  });

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: "IDとパスワードを入力してください" }, 400);
  }

  const { userId, password, importGuestTransactions } = parsed.data;

  const result = await getPool().query(
    "SELECT id, user_id, password_hash FROM users WHERE user_id = $1",
    [userId],
  );

  const user = result.rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ message: "IDまたはパスワードが正しくありません" }, 401);
  }

  const sessionToken = randomBytes(32).toString("hex");
  const guestToken = getCookie(c, GUEST_SESSION_COOKIE);
  const client = await getPool().connect();
  let importedTransactionCount = 0;
  let mergedGuestSession = false;

  try {
    await client.query("BEGIN");

    if (importGuestTransactions && guestToken) {
      const guestResult = await client.query(
        `SELECT id FROM guest_sessions
        WHERE token_hash = $1 AND expires_at > NOW()
        FOR UPDATE`,
        [hashSessionToken(guestToken)],
      );
      const guest = guestResult.rows[0];

      if (guest) {
        const transferResult = await client.query(
          `UPDATE transactions
          SET user_id = $1, guest_id = NULL
          WHERE guest_id = $2`,
          [user.id, guest.id],
        );
        importedTransactionCount = transferResult.rowCount ?? 0;
        await client.query("DELETE FROM guest_sessions WHERE id = $1", [
          guest.id,
        ]);
        mergedGuestSession = true;
      }
    }

    await client.query(
      `INSERT INTO user_sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [hashSessionToken(sessionToken), user.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  setCookie(c, "kakeibo_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  if (mergedGuestSession) {
    deleteCookie(c, GUEST_SESSION_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
    });
  }

  return c.json(
    {
      user: { id: user.id, userId: user.user_id },
      importedTransactionCount,
    },
    200,
  );
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
