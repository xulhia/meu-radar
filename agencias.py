"""Texto integral das agências públicas (Agência Brasil, Agência Câmara, Agência Senado).

Lê o RSS de cada agência, abre cada matéria, extrai o texto editorial (sem menus,
anúncios ou caixas de compartilhamento) e grava data/agencias.json em Markdown,
sempre com crédito e link do original. Só biblioteca padrão.
"""
import datetime as dt
import email.utils
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
CFG = json.loads((ROOT / "config" / "agencias.json").read_text(encoding="utf-8"))
AGORA = dt.datetime.now(dt.timezone.utc)
UA = {"User-Agent": "Mozilla/5.0 (meu-radar; leitura pessoal com crédito à fonte)"}

RUIDO = re.compile(r"(^|[-_\s])(ad|ads|advert|publicidade|banner|cookie|consent|lgpd|modal|popup|newsletter|share|sharing|compartilh|social|comment|comentario|related|relacionad|recomend|leia-tambem|veja-tambem|mais-lidas|sidebar|menu|breadcrumb|tags|toolbar)([-_\s]|$)", re.I)
DESCARTA = {"script", "style", "noscript", "template", "iframe", "svg", "canvas", "form", "button", "input", "select", "textarea", "nav", "footer", "aside", "dialog"}
VAZIOS = {"br", "img", "hr", "meta", "link", "input", "source", "wbr", "area", "base", "col", "embed", "param", "track"}


class No:
    def __init__(self, tag, attrs, pai):
        self.tag, self.attrs, self.pai, self.filhos = tag, dict(attrs), pai, []


class Arvore(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.raiz = No("#doc", [], None)
        self.atual = self.raiz
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        if tag == "meta":
            a = dict(attrs)
            chave = a.get("property") or a.get("name")
            if chave and a.get("content"):
                self.meta[chave.lower()] = a["content"]
        no = No(tag, attrs, self.atual)
        self.atual.filhos.append(no)
        if tag not in VAZIOS:
            self.atual = no

    def handle_endtag(self, tag):
        n = self.atual
        while n is not None and n.tag != tag:
            n = n.pai
        if n is not None and n.pai is not None:
            self.atual = n.pai

    def handle_data(self, data):
        self.atual.filhos.append(data)


def texto(no):
    if isinstance(no, str):
        return no
    if no.tag in DESCARTA:
        return ""
    sep = " " if no.tag in ("br", "p", "div", "li") else ""
    return sep.join(texto(f) for f in no.filhos)


def limpa(t):
    return " ".join(t.split())


def ruido(no):
    if no.tag in DESCARTA:
        return True
    a = no.attrs
    if a.get("hidden") is not None or a.get("aria-hidden") == "true" or a.get("role") in ("navigation", "banner", "contentinfo", "complementary", "dialog"):
        return True
    return bool(RUIDO.search(f"{a.get('class', '')} {a.get('id', '')}"))


def todos(no, pred):
    for f in no.filhos:
        if isinstance(f, No):
            if pred(f):
                yield f
            yield from todos(f, pred)


def pontua(no):
    return sum(len(limpa(texto(p))) for p in todos(no, lambda n: n.tag == "p"))


def nucleo(raiz):
    alvo = next(todos(raiz, lambda n: n.attrs.get("itemprop") == "articleBody"), None)
    if alvo:
        return alvo
    arts = sorted(todos(raiz, lambda n: n.tag == "article"), key=pontua, reverse=True)
    if arts and pontua(arts[0]) > 300:
        return arts[0]
    melhor, mp = None, 0
    for c in todos(raiz, lambda n: n.tag in ("main", "div", "section")):
        direto = sum(len(limpa(texto(f))) for f in c.filhos if isinstance(f, No) and f.tag == "p")
        if direto > mp:
            melhor, mp = c, direto
    return melhor or raiz


def blocos(no, saida, vistos):
    for f in no.filhos:
        if not isinstance(f, No) or ruido(f):
            continue
        t = f.tag
        if t in ("h2", "h3", "h4", "h5", "h6", "p", "blockquote", "li", "figcaption"):
            s = limpa(texto(f))
            if len(s) < 2 or s.lower() in vistos:
                continue
            vistos.add(s.lower())
            if t.startswith("h"):
                saida.append("#" * int(t[1]) + " " + s)
            elif t == "blockquote":
                saida.append("> " + s)
            elif t == "li":
                saida.append("- " + s)
            elif t == "figcaption":
                saida.append("*" + s + "*")
            else:
                saida.append(s)
        else:
            blocos(f, saida, vistos)


def extrair(pagina, titulo_rss=""):
    arv = Arvore()
    arv.feed(pagina)
    core = nucleo(arv.raiz)
    h1 = next(todos(arv.raiz, lambda n: n.tag == "h1"), None)
    titulo = limpa(texto(h1)) if h1 else (arv.meta.get("og:title") or titulo_rss)
    subt = arv.meta.get("og:description") or arv.meta.get("description") or ""
    autor = arv.meta.get("author", "")
    data = arv.meta.get("article:published_time", "")
    corpo = []
    blocos(core, corpo, {titulo.lower(), subt.lower()})
    md = [f"# {titulo}"]
    if subt:
        md.append(f"## {subt}")
    linha = " · ".join(x for x in (autor, data[:16].replace("T", " ") if data else "") if x)
    if linha:
        md.append(f"*{linha}*")
    return titulo, "\n\n".join(md + corpo), len(" ".join(corpo).split())


def baixar(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        bruto = r.read()
        cs = r.headers.get_content_charset() or "utf-8"
    return bruto.decode(cs, errors="replace")


def ler_rss(xml):
    raiz = ET.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    for it in raiz.iter("item"):
        quando = it.findtext("pubDate")
        try:
            q = email.utils.parsedate_to_datetime(quando).astimezone(dt.timezone.utc) if quando else AGORA
        except Exception:
            q = AGORA
        yield {"titulo": html.unescape((it.findtext("title") or "").strip()), "link": (it.findtext("link") or "").strip(), "publicado": q.isoformat()}


def main():
    arq = DATA / "agencias.json"
    antigos = {}
    if arq.exists():
        try:
            antigos = {m["id"]: m for m in json.loads(arq.read_text(encoding="utf-8")).get("materias", [])}
        except Exception:
            pass
    status = []
    for ag in CFG["agencias"]:
        itens, erro = None, ""
        for feed in ag["feeds"]:
            try:
                itens = list(ler_rss(baixar(feed)))
                if itens:
                    break
            except Exception as e:
                erro = str(e)[:150]
        if not itens:
            status.append({"agencia": ag["nome"], "ok": False, "erro": erro or "RSS vazio"})
            continue
        novas = 0
        for it in itens[: CFG.get("por_agencia", 20)]:
            mid = hashlib.sha1(it["link"].encode()).hexdigest()[:16]
            if mid in antigos or not it["link"].startswith("http"):
                continue
            try:
                titulo, md, palavras = extrair(baixar(it["link"]), it["titulo"])
            except Exception:
                continue
            if palavras < 40:
                continue
            antigos[mid] = {"id": mid, "agencia": ag["nome"], "credito": ag["credito"], "titulo": titulo or it["titulo"], "link": it["link"],
                            "publicado": it["publicado"], "markdown": md, "palavras": palavras}
            novas += 1
            time.sleep(1)
        status.append({"agencia": ag["nome"], "ok": True, "novas": novas, "itens_rss": len(itens)})
    limite = AGORA - dt.timedelta(days=CFG.get("dias_guardados", 7))
    lista = sorted((m for m in antigos.values() if dt.datetime.fromisoformat(m["publicado"]) >= limite), key=lambda m: m["publicado"], reverse=True)
    arq.write_text(json.dumps({"atualizado": AGORA.isoformat(), "status": status, "materias": lista}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("; ".join(f"{s['agencia']}: {'ok, ' + str(s.get('novas', 0)) + ' novas' if s['ok'] else 'falhou'}" for s in status))


if __name__ == "__main__":
    main()
