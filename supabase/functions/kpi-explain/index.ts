const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You are a senior hospital revenue-cycle analyst writing for a hospital CEO/CFO in India.
You receive aggregated KPI numbers only (no patient data). Amounts are in Indian Rupees; use Lakhs/Crores.
Write in plain language, no jargon. Use markdown with exactly these sections:
## What moved and why
## Data-quality risks
## Corrective actions (prioritised)
Number the actions 1-5, each with an owner (e.g. RCM team, billing, TPA desk) and expected impact.
Only use the numbers provided. If something cannot be concluded from the data, say so. Keep under 350 words.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);
    const payload = await req.json();
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM,
        input: "KPI context (JSON):\n" + JSON.stringify(payload).slice(0, 20000),
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text();
      let msg = "AI request failed.";
      try { msg = JSON.parse(t)?.error?.message || JSON.parse(t)?.message || msg; } catch { /* keep */ }
      if (res.status === 402) msg = "AI credits are used up. Add credits in workspace billing to continue.";
      if (res.status === 429) msg = "Too many requests right now. Please try again in a minute.";
      return json({ error: msg }, res.status);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", failed = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_text.delta") text += ev.delta;
          if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message || ev.message || "AI failed.";
        } catch { /* partial */ }
      }
    }
    if (!text) return json({ error: failed || "The AI returned no explanation." }, 502);
    return json({ text });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
