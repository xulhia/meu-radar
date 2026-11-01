"""Resumo do dia: grava data/resumo.json e, se houver as chaves, manda para o seu Telegram.

Para o Telegram, crie um bot com o @BotFather e guarde no GitHub (Settings > Secrets and
variables > Actions) os segredos TELEGRAM_TOKEN e TELEGRAM_CHAT_ID.
"""
import collections
import datetime as dt
import html
import json
import os
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
AGORA = dt.datetime.now(dt.timezone.utc)
HOJE = dt.date.today()


def ler(nome, padrao):
    try:
        return json.loads((DATA / nome).read_text(encoding="utf-8"))
    except Exception:
        return padrao


def main():
    noticias = ler("noticias.json", {}).get("noticias", [])
    cong = ler("congresso.json", {})
    eco = ler("economia.json", {})
    dia_atras = AGORA - dt.timedelta(hours=24)
    recentes = [n for n in noticias if dt.datetime.fromisoformat(n["publicado"]) >= dia_atras]
    temas = collections.Counter(t for n in recentes for t in n.get("temas", []))
    alertas = sorted({(p, n["titulo"]) for n in recentes for p in n.get("vigiar", [])})[:6]
    prazos = [m for m in cong.get("mps", []) if (dt.date.fromisoformat(m["prazo"]) - HOJE).days <= 7]
    ontem = str(HOJE - dt.timedelta(days=1))
    vots = [v for v in cong.get("votacoes", []) if (v.get("data") or "")[:10] in (ontem, str(HOJE))]
    resumo = {
        "gerado": AGORA.isoformat(),
        "temas_em_alta": temas.most_common(5),
        "alertas_noticias": [{"palavra": p, "titulo": t} for p, t in alertas],
        "prazos_7_dias": [{"titulo": m["titulo"], "prazo": m["prazo"], "ementa": m["ementa"][:160]} for m in prazos],
        "votacoes_recentes": [{"proposicao": v["proposicao"], "descricao": v["descricao"][:160], "aprovacao": v["aprovacao"], "derrota_governo": v["derrota"]} for v in vots],
        "projetos_novos": [{"titulo": p["titulo"], "termos": p["termos"]} for p in cong.get("projetos_novos", [])[:6]],
        "discursos": len(cong.get("discursos", [])),
        "dolar": (eco.get("dolar") or [{}])[-1].get("valor"),
        "selic": (eco.get("selic") or [{}])[-1].get("valor"),
    }
    (DATA / "resumo.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")

    token, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        print("Resumo gravado. Telegram não configurado.")
        return
    e = html.escape
    linhas = [f"<b>Meu Radar · {HOJE.strftime('%d/%m')}</b>", ""]
    if resumo["temas_em_alta"]:
        linhas.append("<b>Em alta:</b> " + ", ".join(f"{e(t)} ({n})" for t, n in resumo["temas_em_alta"]))
    if alertas:
        linhas += ["", "<b>Alertas</b>"] + [f"• [{e(p)}] {e(t)}" for p, t in alertas]
    if resumo["projetos_novos"]:
        linhas += ["", "<b>Projetos novos nos seus temas</b>"] + [f"• {e(p['titulo'])} ({e(', '.join(p['termos']))})" for p in resumo["projetos_novos"]]
    if prazos:
        linhas += ["", "<b>MPs vencendo em 7 dias</b>"] + [f"• {e(m['titulo'])}: {dt.date.fromisoformat(m['prazo']).strftime('%d/%m')}" for m in prazos]
    if vots:
        linhas += ["", "<b>Votações recentes</b>"] + [f"• {e(v['proposicao'] or v['descricao'][:60])}: {'aprovado' if v['aprovacao'] == 1 else 'rejeitado' if v['aprovacao'] == 0 else '—'}{' · governo derrotado' if v['derrota'] else ''}" for v in vots[:5]]
    if resumo["dolar"]:
        linhas += ["", f"Dólar R$ {resumo['dolar']:.2f} · Selic {resumo['selic']}%".replace(".", ",", 1)]
    url = os.environ.get("RADAR_URL")
    if url:
        linhas += ["", f'<a href="{e(url)}">Abrir o painel</a>']
    corpo = urllib.parse.urlencode({"chat_id": chat, "text": "\n".join(linhas)[:4000], "parse_mode": "HTML", "disable_web_page_preview": "true"}).encode()
    with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=corpo, timeout=30) as r:
        print("Telegram:", r.status)


if __name__ == "__main__":
    main()
