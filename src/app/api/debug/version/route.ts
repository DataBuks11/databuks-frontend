export const dynamic = "force-dynamic";
export async function GET() {
  return new Response("commit:" + (process.env.VERCEL_GIT_COMMIT_SHA || "unknown") + " time:" + new Date().toISOString(), {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
