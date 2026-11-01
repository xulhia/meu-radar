/**
 * Leitor do Meu Radar: um Cloudflare Worker (plano gratuito) que busca uma página
 * pública como um visitante comum e devolve o HTML para o modo leitura do painel.
 *
 * - Busca só endereços http(s) públicos (bloqueia redes internas).
 * - Não finge ser buscador, não usa cache de terceiros nem versões de impressão:
 *   devolve exatamente o que o site entrega a qualquer visitante.
 * - O modo leitura do painel para no bloqueio de assinatura.
 * - Só responde a quem tiver a sua CHAVE (variável CHAVE no painel da Cloudflare),
 *   para ninguém usar o seu leitor.
 */
const LIMITE_BYTES = 3_000_000;

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ORIGEM || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-Chave",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const responder = (msg, status) => new Response(msg, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });

    if (!env.CHAVE || req.headers.get("X-Chave") !== env.CHAVE) return responder("Chave inválida", 401);

    let alvo;
    try { alvo = new URL(new URL(req.url).searchParams.get("url") || ""); } catch { return responder("Endereço inválido", 400); }
    if (!/^https?:$/.test(alvo.protocol)) return responder("Só endereços http ou https", 400);
    const host = alvo.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.includes(":")) {
      return responder("Endereço não permitido", 400);
    }

    const r = await fetch(alvo.toString(), {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (leitor pessoal Meu Radar)", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    const tipo = r.headers.get("Content-Type") || "";
    if (!tipo.includes("html")) return responder("A página não é HTML", 415);
    const corpo = await r.arrayBuffer();
    if (corpo.byteLength > LIMITE_BYTES) return responder("Página grande demais", 413);
    return new Response(corpo, { status: r.status, headers: { ...cors, "Content-Type": "text/html; charset=utf-8", "X-Url-Final": r.url } });
  },
};
