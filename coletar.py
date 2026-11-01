"""Coletor do radar de notícias.

Busca notícias no RSS do Google Notícias (sem chave de API), classifica por tema,
marca palavras vigiadas e grava data/noticias.json e data/status.json.
Usa só a biblioteca padrão do Python. Roda pelo GitHub Actions de hora em hora.
"""
import datetime as dt
import email.utils
import hashlib
import json
import pathlib
import re
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "config" / "fontes.json").read_text(encoding="utf-8"))
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
AGORA = dt.datetime.now(dt.timezone.utc)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def url_gnews(q, janela="2d"):
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": f"{q} when:{janela}", "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"})


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (radar pessoal de noticias)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def ler_rss(xml_bytes):
    raiz = ET.fromstring(xml_bytes)
    for item in raiz.iter("item"):
        titulo = (item.findtext("title") or "").strip()
        fonte_el = item.find("source")
        fonte = (fonte_el.text or "").strip() if fonte_el is not None else ""
        fonte_url = fonte_el.get("url", "") if fonte_el is not None else ""
        if fonte and titulo.endswith(" - " + fonte):
            titulo = titulo[: -len(fonte) - 3].strip()
        data = item.findtext("pubDate")
        try:
            quando = email.utils.parsedate_to_datetime(data).astimezone(dt.timezone.utc) if data else AGORA
        except Exception:
            quando = AGORA
        yield {"titulo": titulo, "link": (item.findtext("link") or "").strip(), "fonte": fonte,
               "fonte_url": fonte_url, "publicado": quando.isoformat()}


def chave(titulo):
    t = re.sub(r"[^a-z0-9 ]", " ", norm(titulo))
    return hashlib.sha1(" ".join(t.split()).encode()).hexdigest()[:16]


def classificar(n):
    t = " " + norm(n["titulo"]) + " "
    n["temas"] = [tema for tema, termos in CFG["temas"].items() if any(norm(p) in t for p in termos)]
    n["vigiar"] = [p for p in CFG.get("vigiar", []) if norm(p) in t]
    return n


def grupo_da_fonte(n):
    host = urllib.parse.urlparse(n.get("fonte_url", "")).netloc.lower()
    for f in CFG["fontes"]:
        if f["dominio"] in host or norm(f["nome"]) == norm(n["fonte"]):
            return f["grupo"], f.get("linha", "")
    return "Outros", ""


def main():
    antigos = {}
    arq = DATA / "noticias.json"
    if arq.exists():
        try:
            for n in json.loads(arq.read_text(encoding="utf-8")).get("noticias", []):
                antigos[n["id"]] = n
        except Exception:
            pass

    buscas = [(c["nome"], url_gnews(c["q"])) for c in CFG["consultas"]]
    filtro = CFG.get("filtro_fontes", "")
    buscas += [("Fonte: " + f["nome"], url_gnews(f"site:{f['dominio']} {filtro}".strip()))
               for f in CFG["fontes"]]

    diretos = {"Feed: " + f["nome"]: f for f in CFG.get("feeds_diretos", [])}
    buscas += [(k, f["url"]) for k, f in diretos.items()]

    status, novos = [], 0
    for nome, url in buscas:
        inicio = time.time()
        try:
            itens = list(ler_rss(baixar(url)))
            for n in itens:
                if not n["titulo"]:
                    continue
                if nome in diretos:
                    f = diretos[nome]
                    n["fonte"] = n["fonte"] or f["nome"]
                    n["texto_livre"] = bool(f.get("texto_livre"))
                    n["licenca"] = f.get("licenca", "")
                n["id"] = chave(n["titulo"] + " " + n["fonte"])
                n["grupo"], n["linha"] = grupo_da_fonte(n)
                classificar(n)
                velho = antigos.get(n["id"])
                if velho:
                    velho["consultas"] = sorted(set(velho.get("consultas", []) + [nome]))
                else:
                    n["consultas"] = [nome]
                    n["coletado"] = AGORA.isoformat()
                    antigos[n["id"]] = n
                    novos += 1
            status.append({"busca": nome, "ok": True, "itens": len(itens), "segundos": round(time.time() - inicio, 1)})
        except Exception as e:
            status.append({"busca": nome, "ok": False, "erro": str(e)[:200]})
        time.sleep(1.5)

    limite = AGORA - dt.timedelta(days=CFG.get("dias_guardados", 14))
    lista = [n for n in antigos.values() if dt.datetime.fromisoformat(n["publicado"]) >= limite]
    lista.sort(key=lambda n: n["publicado"], reverse=True)
    lista = lista[:4000]

    arq.write_text(json.dumps({"atualizado": AGORA.isoformat(), "total": len(lista), "noticias": lista},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "status.json").write_text(json.dumps({"atualizado": AGORA.isoformat(), "novas": novos, "buscas": status},
                                                 ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for s in status if s["ok"])
    print(f"{ok}/{len(status)} buscas ok, {novos} notícias novas, {len(lista)} guardadas")


if __name__ == "__main__":
    main()
