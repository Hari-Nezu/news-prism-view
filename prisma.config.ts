import { defineConfig } from "prisma/config";

// prisma db push / migrate 用の接続設定
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://newsprism:newsprism@localhost:5432/newsprism",
  },
});
