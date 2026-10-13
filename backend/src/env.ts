import {createEnv} from "@t3-oss/env-core";
import {z} from "zod";
import dotenv from "dotenv";

dotenv.config();

export const env = createEnv({
  server: {
    FRONTEND_URL: z.string()
  },
  runtimeEnv: process.env,
})