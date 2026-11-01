"""Coletor do Congresso e da economia.

Gera data/congresso.json, data/termometro.json e data/economia.json a partir das
APIs oficiais da Câmara dos Deputados e do Banco Central. Só biblioteca padrão.

Uso:
  python congresso.py              # coleta normal (a cada 3 horas)
  python congresso.py --discursos  # inclui a busca nos discursos (1 vez por dia)
"""
import concurrent.futures as cf
import datetime as dt
import json
import pathlib
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
CFG = json.loads((ROOT / "fontes.json").read_text(encoding="utf-8"))
SEGUIR = json.loads((ROOT / "seguir.json").read_text(encoding="utf-8"))
CAMARA = "https://dadosabertos.camara.leg.br/api/v2"
HOJE = dt.date.today()
STATUS = []


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def get(url, tentativas=3):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "meu-radar/1.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if i == tentativas - 1:
                raise
            time.sleep(2 * (i + 1))


def camara(path, paginas=5):
    url, out = CAMARA + path, []
    for _ in range(paginas):
        d = get(url)
        out += d.get("dados", [])
        prox = next((l["href"] for l in d.get("links", []) if l.get("rel") == "next"), None)
        if not prox:
            break
        url = prox
    return out


def etapa(nome, fn, padrao):
    inicio = time.time()
    try:
        r = fn()
        STATUS.append({"etapa": nome, "ok": True, "segundos": round(time.time() - inicio, 1)})
        return r
    except Exception as e:
        STATUS.append({"etapa": nome, "ok": False, "erro": str(e)[:200]})
        return padrao


# ---------- medidas provisórias (CF art. 62) ----------
def recesso(d):
    return (d.month == 7 and d.day >= 18) or (d.month == 12 and d.day >= 23) or d.month == 1 or (d.month == 2 and d.day == 1)


def somar_dias(inicio, n):
    d, c = inicio, 0
    while c < n:
        d += dt.timedelta(days=1)
        if not recesso(d):
            c += 1
    return d


def mps():
    lista = camara(f"/proposicoes?siglaTipo=MPV&dataApresentacaoInicio={HOJE - dt.timedelta(days=240)}&dataApresentacaoFim={HOJE}&ordem=DESC&ordenarPor=id&itens=100", 2)
    out = []
    for p in lista[:60]:
        try:
            d = get(f"{CAMARA}/proposicoes/{p['id']}")["dados"]
        except Exception:
            continue
        apres = dt.date.fromisoformat(d["dataApresentacao"][:10])
        st = d.get("statusProposicao") or {}
        sit = f"{st.get('descricaoSituacao') or ''} {st.get('descricaoTramitacao') or ''}"
        encerrada = any(x in norm(sit) for x in ["transformad", "perdeu", "rejeitad", "arquivad", "prejudicad", "sancion"])
        prazo = somar_dias(apres, 120)
        if encerrada or prazo < HOJE:
            continue
        out.append({"id": d["id"], "titulo": f"MPV {d['numero']}/{d['ano']}", "ementa": d.get("ementa", ""),
                    "apresentacao": str(apres), "prazo": str(prazo), "tranca": str(somar_dias(apres, 45)),
                    "situacao": st.get("descricaoSituacao") or "", "orgao": st.get("siglaOrgao") or "",
                    "link": f"https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={d['id']}"})
    return sorted(out, key=lambda m: m["prazo"])


# ---------- agenda e pauta ----------
def eventos():
    lista = camara(f"/eventos?dataInicio={HOJE}&dataFim={HOJE + dt.timedelta(days=10)}&ordem=ASC&ordenarPor=dataHoraInicio&itens=100", 4)
    out = []
    for e in lista:
        tipo = e.get("descricaoTipo") or ""
        if "cancel" in norm(e.get("situacao")) or not any(x in norm(tipo) for x in ["sessao deliberativa", "audiencia", "reuniao deliberativa"]):
            continue
        org = (e.get("orgaos") or [{}])[0]
        item = {"id": e["id"], "inicio": e.get("dataHoraInicio"), "tipo": tipo, "descricao": " ".join((e.get("descricao") or "").split()),
                "orgao": org.get("sigla") or "", "orgao_nome": org.get("nome") or "", "link": f"https://www.camara.leg.br/evento-legislativo/{e['id']}", "pauta": []}
        if org.get("sigla") == "PLEN":
            try:
                for p in get(f"{CAMARA}/eventos/{e['id']}/pauta").get("dados", [])[:15]:
                    prop = p.get("proposicao_") or p.get("proposicaoRelacionada_") or {}
                    rot = p.get("titulo") or (f"{prop.get('siglaTipo', '')} {prop.get('numero', '')}/{prop.get('ano', '')}".strip())
                    item["pauta"].append({"titulo": rot, "ementa": prop.get("ementa") or p.get("topico") or ""})
            except Exception:
                pass
        out.append(item)
    return out


# ---------- votações, bancada do Ceará e termômetro ----------
def votacoes(deps_ce):
    lista = camara(f"/votacoes?idOrgao=180&dataInicio={HOJE - dt.timedelta(days=30)}&dataFim={HOJE}&ordem=DESC&ordenarPor=dataHoraRegistro&itens=100", 2)

    def uma(v):
        votos = get(f"{CAMARA}/votacoes/{v['id']}/votos").get("dados", [])
        if not votos:
            return None
        ori = {norm(o.get("siglaPartidoBloco")): o.get("orientacaoVoto") for o in get(f"{CAMARA}/votacoes/{v['id']}/orientacoes").get("dados", [])}
        gov = next((val for k, val in ori.items() if k.startswith("gov")), None)
        sim = sum(1 for x in votos if x.get("tipoVoto") == "Sim")
        nao = sum(1 for x in votos if norm(x.get("tipoVoto")) == "nao")
        partidos = {}
        ce = []
        for x in votos:
            dep = x.get("deputado_") or x.get("deputado") or {}
            tv = x.get("tipoVoto")
            if gov in ("Sim", "Não") and tv in ("Sim", "Não"):
                p = partidos.setdefault(dep.get("siglaPartido") or "?", [0, 0])
                p[1] += 1
                p[0] += 1 if tv == gov else 0
            if dep.get("id") in deps_ce:
                ce.append({"nome": dep.get("nome"), "partido": dep.get("siglaPartido"), "voto": tv})
        aprov = v.get("aprovacao")
        derrota = gov in ("Sim", "Não") and aprov in (0, 1) and ((gov == "Sim") != (aprov == 1))
        alinhados = sum(p[0] for p in partidos.values())
        total = sum(p[1] for p in partidos.values())
        return {"id": v["id"], "data": v.get("dataHoraRegistro") or v.get("data"), "descricao": " ".join((v.get("descricao") or "").split()),
                "proposicao": v.get("proposicaoObjeto") or "", "aprovacao": aprov, "governo": gov, "derrota": derrota,
                "sim": sim, "nao": nao, "governismo": round(alinhados / total, 4) if total else None,
                "partidos": partidos, "ceara": ce}

    with cf.ThreadPoolExecutor(6) as ex:
        res = [r for r in ex.map(lambda v: _seguro(uma, v), lista[:60]) if r]
    return res


def _seguro(fn, *a):
    try:
        return fn(*a)
    except Exception:
        return None


def termometro(vots):
    arq = DATA / "termometro.json"
    hist = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {"votacoes": {}}
    for v in vots:
        if v["governismo"] is not None:
            hist["votacoes"][v["id"]] = {k: v[k] for k in ("data", "proposicao", "descricao", "governo", "aprovacao", "derrota", "governismo", "partidos")}
    hist["atualizado"] = dt.datetime.now(dt.timezone.utc).isoformat()
    arq.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(hist["votacoes"])


# ---------- projetos novos nos seus temas ----------
def projetos_novos():
    termos = [norm(t) for t in CFG.get("temas_projetos", []) + CFG.get("vigiar", [])]
    lista = camara(f"/proposicoes?siglaTipo=PL,PEC,PLP,PDL,MPV&dataApresentacaoInicio={HOJE - dt.timedelta(days=7)}&dataApresentacaoFim={HOJE}&ordem=DESC&ordenarPor=id&itens=100", 6)
    out = []
    for p in lista:
        em = norm(p.get("ementa"))
        achou = [t for t in termos if t and t in em]
        if achou:
            out.append({"id": p["id"], "titulo": f"{p['siglaTipo']} {p['numero']}/{p['ano']}", "ementa": p.get("ementa", ""), "termos": sorted(set(achou)),
                        "link": f"https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={p['id']}"})
    return out


# ---------- projetos que você segue ----------
def seguidos():
    out = []
    for s in SEGUIR.get("projetos", []):
        try:
            achados = get(f"{CAMARA}/proposicoes?siglaTipo={s['sigla']}&numero={s['numero']}&ano={s['ano']}").get("dados", [])
            if not achados:
                out.append({"titulo": f"{s['sigla']} {s['numero']}/{s['ano']}", "erro": "não encontrado na Câmara"})
                continue
            pid = achados[0]["id"]
            d = get(f"{CAMARA}/proposicoes/{pid}")["dados"]
            tr = get(f"{CAMARA}/proposicoes/{pid}/tramitacoes").get("dados", [])[-5:][::-1]
            out.append({"id": pid, "titulo": f"{s['sigla']} {s['numero']}/{s['ano']}", "apelido": s.get("apelido", ""), "ementa": d.get("ementa", ""),
                        "situacao": (d.get("statusProposicao") or {}).get("descricaoSituacao") or "",
                        "tramitacoes": [{"data": t.get("dataHora"), "orgao": t.get("siglaOrgao"), "texto": t.get("descricaoTramitacao"), "despacho": (t.get("despacho") or "")[:300]} for t in tr],
                        "link": f"https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={pid}"})
        except Exception as e:
            out.append({"titulo": f"{s.get('sigla')} {s.get('numero')}/{s.get('ano')}", "erro": str(e)[:120]})
    return out


# ---------- discursos com as palavras vigiadas ----------
def discursos(deputados):
    termos = [p for p in CFG.get("vigiar", []) if p]
    ini, fim = HOJE - dt.timedelta(days=3), HOJE

    def de(dep):
        achados = []
        for d in get(f"{CAMARA}/deputados/{dep['id']}/discursos?dataInicio={ini}&dataFim={fim}&ordenarPor=dataHoraInicio&ordem=DESC&itens=20").get("dados", []):
            txt = d.get("transcricao") or ""
            t = norm(txt)
            for p in termos:
                i = t.find(norm(p))
                if i >= 0:
                    achados.append({"deputado": dep["nome"], "partido": dep.get("siglaPartido"), "uf": dep.get("siglaUf"), "data": d.get("dataHoraInicio"),
                                    "palavra": p, "trecho": " ".join(txt[max(0, i - 220): i + 220].split()), "url": d.get("urlTexto") or d.get("urlVideo") or ""})
                    break
        return achados

    with cf.ThreadPoolExecutor(8) as ex:
        res = ex.map(lambda dep: _seguro(de, dep) or [], deputados)
    return sorted([a for r in res for a in r], key=lambda a: a["data"] or "", reverse=True)[:80]


# ---------- economia (Banco Central) ----------
def economia():
    def serie(cod, dias):
        ini = (HOJE - dt.timedelta(days=dias)).strftime("%d/%m/%Y")
        dados = get(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados?formato=json&dataInicial={ini}&dataFinal={HOJE.strftime('%d/%m/%Y')}")
        return [{"data": x["data"], "valor": float(str(x["valor"]).replace(",", "."))} for x in dados]
    out = {}
    for nome, cod, dias in [("dolar", 1, 120), ("selic", 432, 365), ("ipca12m", 13522, 730)]:
        out[nome] = _seguro(serie, cod, dias) or []
    out["atualizado"] = dt.datetime.now(dt.timezone.utc).isoformat()
    return out


def main():
    deputados = etapa("Deputados em exercício", lambda: camara("/deputados?ordem=ASC&ordenarPor=nome&itens=100", 7), [])
    deps_ce = {d["id"] for d in deputados if d.get("siglaUf") == "CE"}
    dados = {"atualizado": dt.datetime.now(dt.timezone.utc).isoformat()}
    dados["bancada_ce"] = [{"id": d["id"], "nome": d["nome"], "partido": d.get("siglaPartido"), "foto": d.get("urlFoto")} for d in deputados if d.get("siglaUf") == "CE"]
    dados["mps"] = etapa("Medidas provisórias", mps, [])
    dados["eventos"] = etapa("Agenda e pauta", eventos, [])
    dados["votacoes"] = etapa("Votações do plenário", lambda: votacoes(deps_ce), [])
    dados["projetos_novos"] = etapa("Projetos novos nos seus temas", projetos_novos, [])
    dados["seguidos"] = etapa("Projetos que você segue", seguidos, [])
    anterior = DATA / "congresso.json"
    if "--discursos" in sys.argv:
        dados["discursos"] = etapa("Discursos com palavras vigiadas", lambda: discursos(deputados), [])
    elif anterior.exists():
        try:
            dados["discursos"] = json.loads(anterior.read_text(encoding="utf-8")).get("discursos", [])
        except Exception:
            dados["discursos"] = []
    etapa("Termômetro (histórico)", lambda: termometro(dados["votacoes"]), 0)
    for v in dados["votacoes"]:
        v.pop("partidos", None)
    dados["status"] = STATUS
    anterior.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    eco = economia()
    STATUS.append({"etapa": "Banco Central", "ok": bool(eco["dolar"] or eco["selic"])})
    (DATA / "economia.json").write_text(json.dumps(eco, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    dados["status"] = STATUS
    anterior.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("; ".join(f"{s['etapa']}: {'ok' if s['ok'] else 'falhou'}" for s in STATUS))


if __name__ == "__main__":
    main()
