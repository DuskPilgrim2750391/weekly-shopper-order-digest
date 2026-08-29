import { infrai } from "./infrai.ts";

const publicUrl = process.env.PUBLIC_URL;
if (!publicUrl) throw new Error("Set PUBLIC_URL to the deployed digest service URL");

const job = await infrai.cron.create({
  cron_expr: "0 9 * * 1",
  task: new URL("/digests/weekly", publicUrl).toString()
});

console.log(`Scheduled weekly digest as ${job.job_id}`);
