import pkg from "@/package.json";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => json({ version: pkg.version, commit: process.env.GIT_SHA || null }), { public: true });
