export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/debug") {
            return new Response(JSON.stringify({
                apiKeyValue: env.API_KEY,
                apiKeyLength: env.API_KEY ? env.API_KEY.length : "undefined",
                aiBindingExists: env.AI ? "yes" : "no",
                envKeys: Object.keys(env)
            }, null, 2), {
                headers: { "Content-Type": "application/json" }
            });
        }

        const API_KEY = env.API_KEY;
        const auth = request.headers.get("Authorization");

        if (auth !== `Bearer ${API_KEY}`) {
            return new Response(JSON.stringify({
                error: "Unauthorized",
                expected: `Bearer ${API_KEY}`,
                received: auth
            }, null, 2), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method !== "POST" || url.pathname !== "/") {
            return new Response(JSON.stringify({ error: "Not allowed" }), {
                status: 405,
                headers: { "Content-Type": "application/json" }
            });
        }

        try {
            const { prompt } = await request.json();
            if (!prompt) return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400, headers: { "Content-Type": "application/json" } });

            const result = await env.AI.run(
                "@cf/stabilityai/stable-diffusion-xl-base-1.0",
                { prompt }
            );

            return new Response(result, {
                headers: { "Content-Type": "image/jpeg" }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: "Failed to generate image", details: err.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    },
};
