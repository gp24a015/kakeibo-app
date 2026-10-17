import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
const databaseEnvSchema = z.object({
    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z
        .string()
        .transform((value) => parseInt(value, 10))
        .pipe(z.number().int().positive()),
    DATABASE_NAME: z.string().min(1),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1),
});
export const env = createEnv({
    server: {
        FRONTEND_URL: z.string().url().transform((value) => new URL(value).origin),
    },
    runtimeEnv: process.env,
});
export const getDatabaseConfig = () => databaseEnvSchema.parse(process.env);
