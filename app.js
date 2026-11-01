(function(){
"use strict";
/* ============ utilidades ============ */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;$("#toastRoot").append(t);setTimeout(()=>t.remove(),2400)}
async function copiar(txt){try{await navigator.clipboard.writeText(txt);toast("Copiado")}catch(e){toast("Não foi possível copiar")}}
function baixar(nome,texto,tipo){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([texto],{type:tipo}));a.download=nome;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
const ago=iso=>{if(!iso)return"—";const m=Math.round((Date.now()-new Date(iso))/6e4);if(m<1)return"agora";if(m<60)return`há ${m} min`;const h=Math.round(m/60);if(h<24)return`há ${h} h`;const d=Math.round(h/24);return d===1?"ontem":`há ${d} dias`};
const parseD=s=>{s=String(s||"");const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3]):new Date(s)};
const dstr=s=>s?parseD(s).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}).replace(/ de /g," ").replace(".",""):"—";
const dhora=s=>s?new Date(s).toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).replace(/ de /g," ").replace(/\./g,""):"—";
const dias=s=>{const a=parseD(s);a.setHours(0,0,0,0);const h=new Date();h.setHours(0,0,0,0);return Math.round((a-h)/864e5)};
const urg=n=>n<=3?"u-crit":n<=7?"u-warn":"u-ok";
const emDias=n=>n<=0?"hoje":n===1?"amanhã":`em ${n} dias`;
const GCOR={"Grande imprensa":"var(--teal-soft)","Pública":"var(--sun-soft)","Ceará":"var(--accent-soft)","Esquerda declarada":"var(--rose-soft)","Direita declarada":"#E3E7FA","Comentário político":"var(--surface-2)","Checagem":"var(--surface-2)","Outros":"transparent"};
const STOP=new Set("para pela pelo pelos pelas como mais menos sobre entre apos antes contra diz dizem sera esta este essa esse isso aqui onde quando porque com sem que dos das nos nas num numa uma uns umas por ate ser sao tem vai vao foi era sua seu suas seus ele ela eles elas".split(" "));

/* ============ dados ============ */
const D={};
async function j(url){const r=await fetch(url+"?t="+Date.now());if(!r.ok)throw new Error(url+": HTTP "+r.status);return r.json()}
async function carregar(){const pares=[["agencias","data/agencias.json"],["noticias","data/noticias.json"],["status","data/status.json"],["cong","data/congresso.json"],["termo","data/termometro.json"],["eco","data/economia.json"],["resumo","data/resumo.json"],["cfg","config/fontes.json"]];
  await Promise.all(pares.map(async([k,u])=>{try{D[k]=await j(u)}catch(e){D[k]=null}}));
  if(!D.noticias)D.noticias={noticias:[],atualizado:null};D.cong=D.cong||{};D.cfg=D.cfg||{temas:{},vigiar:[]};
  $("#upd").textContent=D.noticias.atualizado?"Notícias "+ago(D.noticias.atualizado)+" · Congresso "+ago(D.cong.atualizado):"Ainda sem dados: rode a coleta no GitHub";
  const falhas=(D.status?.buscas||[]).some(b=>!b.ok)||(D.cong.status||[]).some(s=>!s.ok);$("#healthDot").className="hdot "+(D.noticias.atualizado?(falhas?"bad":"ok"):"")}

/* ============ estado ============ */
const st={periodo:store.get("rd_periodo",24),tema:"",grupo:"",q:"",naoLidas:false,lidas:new Set(store.get("rd_lidas",[])),salvas:store.get("rd_salvas",[]),extras:store.get("rd_vigiar",[]),calmo:store.get("rd_calmo",false),visita:store.get("rd_visita",null)};
const saveLidas=()=>store.set("rd_lidas",[...st.lidas].slice(-4000));
const vigiadas=()=>[...new Set([...(D.cfg.vigiar||[]),...st.extras])];
const hits=n=>{const t=norm(n.titulo);return [...new Set([...(n.vigiar||[]),...st.extras.filter(p=>t.includes(norm(p)))])]};

/* ============ notícias: agrupamento ============ */
function filtradas(extra=()=>true,horas=st.periodo){const lim=Date.now()-horas*3600e3,q=norm(st.q);
  return (D.noticias.noticias||[]).filter(n=>new Date(n.publicado)>=lim&&(!st.tema||(n.temas||[]).includes(st.tema))&&(!st.grupo||n.grupo===st.grupo)&&(!q||norm(n.titulo+" "+n.fonte).includes(q))&&(!st.naoLidas||!st.lidas.has(n.id))&&extra(n))}
const tokens=t=>new Set(norm(t).replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>3&&!STOP.has(w)));
function agrupar(lista){const gs=[];for(const n of lista.slice(0,1500)){const tk=tokens(n.titulo);let alvo=null;
    for(const g of gs){let i=0;tk.forEach(w=>{if(g.tk.has(w))i++});const u=tk.size+g.tk.size-i;if(i>=3||(u&&i/u>=0.34)){alvo=g;break}}
    if(alvo){alvo.itens.push(n);tk.forEach(w=>alvo.tk.add(w))}else gs.push({tk,itens:[n]})}
  gs.forEach(g=>{g.fontes=[...new Set(g.itens.map(i=>i.fonte))];g.mais=g.itens[0];g.temas=[...new Set(g.itens.flatMap(i=>i.temas||[]))];g.hits=[...new Set(g.itens.flatMap(hits))];
    g.grupos={};g.fontes.forEach(f=>{const gr=(g.itens.find(i=>i.fonte===f)||{}).grupo||"Outros";g.grupos[gr]=(g.grupos[gr]||0)+1})});
  return gs.sort((a,b)=>(b.hits.length>0)-(a.hits.length>0)||b.fontes.length-a.fontes.length||new Date(b.mais.publicado)-new Date(a.mais.publicado))}
let GRUPOS=[];
function cardGrupo(g,idx,compacto){const livre=g.itens.find(i=>i.texto_livre),n=g.mais,lido=g.itens.every(i=>st.lidas.has(i.id)),salvo=st.salvas.some(s=>s.id===n.id);
  const grupos=Object.entries(g.grupos).map(([k,v])=>`<span class="pill" style="background:${GCOR[k]||"transparent"};border:1.5px solid var(--line);color:var(--ink-2)">${esc(k)} · ${v}</span>`).join("");
  const umLado=Object.keys(g.grupos).length===1&&g.fontes.length>1?`<span class="small muted">Só um grupo de veículos cobriu</span>`:"";
  return `<article class="card stack" style="${lido?"opacity:.6":""}">
   <div class="row between"><div class="row">${g.hits.map(h=>`<span class="pill t-mp">Vigiando: ${esc(h)}</span>`).join("")}${g.temas.slice(0,3).map(t=>`<span class="pill lvl">${esc(t)}</span>`).join("")}</div><span class="small muted">${ago(n.publicado)}</span></div>
   <h3><a href="${esc(n.link)}" target="_blank" rel="noopener" data-read="${n.id}" style="color:inherit;text-decoration:none">${esc(n.titulo)}</a></h3>
   <div class="row small"><b class="${g.fontes.length>=5?"u-crit":g.fontes.length>=2?"u-warn":"muted"}">${g.fontes.length} ${g.fontes.length===1?"veículo":"veículos"}</b>${grupos}${umLado}</div>
   ${!compacto&&g.itens.length>1?`<details><summary class="small" style="cursor:pointer;font-weight:800">Como cada veículo deu (${g.itens.length})</summary><ul class="small" style="margin:8px 0 0;padding-left:1.1em;display:grid;gap:6px">${g.itens.map(i=>`<li><a href="${esc(i.link)}" target="_blank" rel="noopener" data-read="${i.id}">${esc(i.titulo)}</a> <span class="muted">· ${esc(i.fonte)} · ${ago(i.publicado)}</span></li>`).join("")}</ul></details>`:""}
   ${compacto?"":`<div class="row"><button class="btn sm ghost" data-salvar="${n.id}" aria-pressed="${salvo}">${salvo?"Salva":"Salvar"}</button><button class="btn sm ghost" data-lido="${idx}">${lido?"Marcar como não lida":"Marcar como lida"}</button>${livre?`<button class="btn sm" data-lerurl="${esc(livre.link)}">Ler texto completo (${esc(livre.fonte)})</button>`:`<a class="btn sm ghost" href="#leitura" data-ler="${esc(n.link)}">Abrir no modo leitura</a>`}</div>`}</article>`}

/* ============ HOJE ============ */
function viewHoje(){const desde=st.visita?new Date(st.visita):new Date(Date.now()-864e5);
  const novas=(D.noticias.noticias||[]).filter(n=>new Date(n.coletado||n.publicado)>desde);
  const gs=agrupar(filtradas(()=>true,24));const al=gs.filter(g=>g.hits.length);
  const mps=(D.cong.mps||[]).filter(m=>dias(m.prazo)<=7);const ontem=(D.cong.votacoes||[]).filter(v=>Date.now()-new Date(v.data)<2*864e5);
  const segNovos=(D.cong.seguidos||[]).filter(s=>(s.tramitacoes||[]).some(t=>new Date(t.data)>desde));
  const gov=termoSerie().slice(-10);const govMed=gov.length?gov.reduce((a,v)=>a+v.g,0)/gov.length:null;
  const e=D.eco||{};const ult=k=>(e[k]||[]).at(-1);
  const r=D.resumo;
  return `<section class="view">
   <div class="view-head"><span class="eyebrow">${new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</span>
   <h1>Desde a sua última visita</h1><p class="lede">${novas.length} notícias novas, ${segNovos.length} movimentações em projetos que você segue e ${al.length} assuntos com palavras vigiadas.</p></div>
   <div class="stats"><div class="stat ${mps.length?"hot":""}"><span class="small">MPs vencendo em 7 dias</span><b>${mps.length}</b></div><div class="stat"><span class="small">Votações nas últimas 48 h</span><b>${ontem.length}</b></div><div class="stat"><span class="small">Projetos novos nos seus temas</span><b>${(D.cong.projetos_novos||[]).length}</b></div><div class="stat"><span class="small">Governismo (últimas 10)</span><b>${govMed==null?"—":Math.round(govMed*100)+"%"}</b></div></div>
   <div class="two"><div class="main">
     ${r?`<section class="card stack"><div class="row between"><h2>Resumo do dia</h2><span class="pill t-consulta">${dhora(r.gerado)}</span></div>
       ${r.temas_em_alta?.length?`<p><b>Em alta:</b> ${r.temas_em_alta.map(([t,n])=>`${esc(t)} (${n})`).join(", ")}</p>`:""}
       ${r.votacoes_recentes?.length?`<p><b>Votações recentes:</b> ${r.votacoes_recentes.map(v=>`${esc(v.proposicao||v.descricao.slice(0,60))}, ${v.aprovacao==1?"aprovado":v.aprovacao==0?"rejeitado":"—"}${v.derrota_governo?" (governo derrotado)":""}`).join("; ")}.</p>`:""}
       ${r.prazos_7_dias?.length?`<p><b>Prazos da semana:</b> ${r.prazos_7_dias.map(m=>`${esc(m.titulo)} (${dstr(m.prazo)})`).join("; ")}.</p>`:""}</section>`:""}
     <section class="stack"><div class="row between"><h2>Assuntos do dia</h2><a href="#noticias"><b>Todas as notícias</b></a></div>${gs.length?gs.slice(0,st.calmo?3:6).map((g,i)=>cardGrupo(g,i,true)).join(""):`<div class="empty">Sem notícias nas últimas 24 horas.</div>`}</section>
   </div><aside class="side">
     ${al.length||(D.cong.projetos_novos||[]).length||(D.cong.discursos||[]).length?`<section class="card stack" style="background:var(--accent-soft);border-color:var(--accent-soft);box-shadow:none"><h2>Alertas</h2>
       ${al.slice(0,4).map(g=>`<div><b>“${esc(g.hits[0])}” nas notícias</b><br><span class="small">${esc(g.mais.titulo)}</span></div>`).join("")}
       ${(D.cong.projetos_novos||[]).slice(0,3).map(p=>`<div><b>${esc(p.titulo)}</b> · “${esc(p.termos[0])}”<br><span class="small">${esc(p.ementa.slice(0,110))}…</span></div>`).join("")}
       ${(D.cong.discursos||[]).length?`<div><b>${D.cong.discursos.length} discursos com suas palavras</b><br><a class="small" href="#congresso">Ver trechos</a></div>`:""}</section>`:""}
     <section class="card stack"><div class="row between"><h2>Prazos</h2><a class="small" href="#congresso"><b>Todos</b></a></div>${(D.cong.mps||[]).slice(0,4).map(m=>`<div class="rowline"><span><span class="pill t-mp">MP</span> <b>${esc(m.titulo)}</b></span><b class="${urg(dias(m.prazo))}" style="white-space:nowrap">${emDias(dias(m.prazo))}</b></div>`).join("")||`<p class="small muted">Nenhuma MP correndo prazo, ou a coleta ainda não rodou.</p>`}</section>
     ${(D.cong.seguidos||[]).filter(s=>!s.erro).length?`<section class="card stack"><h2>Projetos que você segue</h2>${D.cong.seguidos.filter(s=>!s.erro).slice(0,4).map(s=>{const t=(s.tramitacoes||[])[0]||{};return `<div class="rowline" style="display:block"><b>${esc(s.titulo)}</b>${s.apelido?` · ${esc(s.apelido)}`:""}<br><span class="small muted">${dstr(t.data)}: ${esc(t.texto||s.situacao)}</span></div>`}).join("")}</section>`:""}
     ${st.calmo?"":`<section class="card stack"><h2>Economia</h2>${[["Dólar","dolar","R$ ",2],["Selic","selic","",2],["IPCA 12 meses","ipca12m","",2]].map(([l,k,u,c])=>{const s=(e[k]||[]).slice(-40);return `<div class="rowline"><span>${l}</span>${spark(s)}<b>${ult(k)?u+ult(k).valor.toFixed(c).replace(".",",")+(u?"":"%"):"—"}</b></div>`}).join("")}</section>`}
   </aside></div></section>`}
function spark(s){if(!s||s.length<2)return"";const v=s.map(x=>x.valor),mn=Math.min(...v),mx=Math.max(...v);return `<svg width="110" height="28" viewBox="0 0 110 28" aria-hidden="true"><polyline points="${v.map((y,i)=>`${(i*108/(v.length-1)+1).toFixed(1)},${(26-(y-mn)/((mx-mn)||1)*24).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--teal)" stroke-width="2.2"/></svg>`}

/* ============ NOTÍCIAS ============ */
function viewNoticias(){const temas=Object.keys(D.cfg.temas||{}),grupos=[...new Set((D.noticias.noticias||[]).map(n=>n.grupo))].sort();
  return `<section class="view"><div class="view-head"><span class="eyebrow">Notícias</span><h1>O que está acontecendo</h1><p class="lede">Agrupadas por assunto. Abra "Como cada veículo deu" para comparar enquadramentos.</p></div>
   <div class="panel filters"><div class="row"><span class="flabel">Período</span>${[[6,"6 h"],[24,"24 h"],[72,"3 dias"],[168,"7 dias"],[336,"14 dias"]].map(([h,l])=>`<button class="chip" data-per="${h}" aria-pressed="${st.periodo===h}">${l}</button>`).join("")}<span style="flex:1"></span><label class="row small" for="soNL"><input id="soNL" type="checkbox" ${st.naoLidas?"checked":""}> Só não lidas</label></div>
    <div class="row"><span class="flabel">Tema</span><button class="chip" data-tema="" aria-pressed="${!st.tema}">Todos</button>${temas.map(t=>`<button class="chip" data-tema="${esc(t)}" aria-pressed="${st.tema===t}">${esc(t)}</button>`).join("")}</div>
    <div class="row"><span class="flabel">Fonte</span><label class="vh" for="fGrupo">Grupo de veículos</label><select id="fGrupo"><option value="">Todos os grupos</option>${grupos.map(g=>`<option ${g===st.grupo?"selected":""}>${esc(g)}</option>`).join("")}</select></div></div>
   <div class="two"><div class="main"><b id="cnt"></b><div class="stack" id="lista" style="gap:14px"></div></div>
   <aside class="side"><section class="card stack"><h2>O que você leu em 7 dias</h2><p class="small muted">Para perceber se está lendo só um lado.</p><div id="equil"></div></section>
    <section class="card stack"><h2>Vigiando</h2><div class="row" id="chips"></div><form id="addF" class="row"><label class="vh" for="addW">Nova palavra</label><input id="addW" type="text" placeholder="Nova palavra" style="flex:1;min-width:0"><button class="btn primary sm" type="submit">Adicionar</button></form><span class="tiny muted">As palavras do arquivo de configuração valem também para projetos e discursos. As que você adiciona aqui valem só nos títulos, neste navegador.</span></section></aside></div></section>`}
function renderNoticias(){GRUPOS=agrupar(filtradas());$("#cnt").textContent=`${GRUPOS.length} assuntos${st.q?` para "${st.q}"`:""}`;
  $("#lista").innerHTML=GRUPOS.length?GRUPOS.slice(0,120).map((g,i)=>cardGrupo(g,i)).join(""):`<div class="empty">Nada neste período com esses filtros.</div>`;
  const lidas=(D.noticias.noticias||[]).filter(n=>st.lidas.has(n.id)),cont={};lidas.forEach(n=>cont[n.grupo]=(cont[n.grupo]||0)+1);const tot=lidas.length||1;
  $("#equil").innerHTML=lidas.length?`<div class="hbars">${Object.entries(cont).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="hbar"><span class="small">${esc(k)}</span><span class="track"><i style="width:${v/tot*100}%;background:var(--teal)"></i></span><b class="num small">${Math.round(v/tot*100)}%</b></div>`).join("")}</div>`:`<p class="small muted">Abra algumas notícias para ver o equilíbrio.</p>`;
  $("#chips").innerHTML=vigiadas().map(p=>`<span class="pill lvl">${esc(p)}${st.extras.includes(p)?` <button class="x" style="width:22px;height:22px;font-size:14px" data-rm="${esc(p)}" aria-label="Remover ${esc(p)}">×</button>`:""}</span>`).join("")}
function bindNoticias(){renderNoticias();
  $$("[data-per]").forEach(b=>b.onclick=()=>{st.periodo=+b.dataset.per;store.set("rd_periodo",st.periodo);$$("[data-per]").forEach(x=>x.setAttribute("aria-pressed",x===b));renderNoticias()});
  $$("[data-tema]").forEach(b=>b.onclick=()=>{st.tema=b.dataset.tema;$$("[data-tema]").forEach(x=>x.setAttribute("aria-pressed",x===b));renderNoticias()});
  $("#fGrupo").onchange=e=>{st.grupo=e.target.value;renderNoticias()};$("#soNL").onchange=e=>{st.naoLidas=e.target.checked;renderNoticias()};
  $("#addF").onsubmit=e=>{e.preventDefault();const w=$("#addW").value.trim();if(w&&!st.extras.includes(w)){st.extras.push(w);store.set("rd_vigiar",st.extras)}$("#addW").value="";renderNoticias()}}

/* ============ CONGRESSO ============ */
function viewCongresso(){const c=D.cong;
  const pauta=(c.eventos||[]).filter(e=>e.pauta?.length),agenda=(c.eventos||[]).slice(0,12);
  return `<section class="view"><div class="view-head"><span class="eyebrow">Congresso · Câmara dos Deputados</span><h1>O que está em decisão e quem votou como</h1><p class="lede">Atualizado ${ago(c.atualizado)}. Fonte: API de Dados Abertos da Câmara.</p></div>
   <div class="grid g3">
    <section class="card stack"><h2>Medidas provisórias</h2>${(c.mps||[]).map(m=>`<div class="rowline" style="display:block"><b>${esc(m.titulo)}</b> <span class="small">${esc(m.ementa.slice(0,120))}${m.ementa.length>120?"…":""}</span><br><span class="small"><b class="${urg(dias(m.prazo))}">Perde a validade ${emDias(dias(m.prazo))}</b> (${dstr(m.prazo)}, estimado)${dias(m.tranca)<=0?" · tranca a pauta":""}</span> · <a class="small" href="${esc(m.link)}" target="_blank" rel="noopener">tramitação</a></div>`).join("")||`<p class="small muted">Nenhuma MP correndo prazo.</p>`}</section>
    <section class="card stack"><h2>Pauta do plenário</h2>${pauta.map(e=>`<div class="rowline" style="display:block"><b>${dhora(e.inicio)}</b><ul class="small" style="margin:4px 0 0;padding-left:1.1em">${e.pauta.slice(0,8).map(p=>`<li><b>${esc(p.titulo)}</b> ${esc((p.ementa||"").slice(0,90))}</li>`).join("")}</ul></div>`).join("")||`<p class="small muted">Sem pauta publicada para os próximos dias.</p>`}</section>
    <section class="card stack" style="background:var(--accent-soft);border-color:var(--accent-soft);box-shadow:none"><h2>Projetos novos nos seus temas</h2><p class="tiny muted">Últimos 7 dias. Palavras em config/fontes.json (temas_projetos e vigiar).</p>${(c.projetos_novos||[]).slice(0,10).map(p=>`<div class="rowline" style="display:block"><a href="${esc(p.link)}" target="_blank" rel="noopener"><b>${esc(p.titulo)}</b></a> · <span class="small">“${esc(p.termos.join("”, “"))}”</span><br><span class="small">${esc(p.ementa.slice(0,160))}</span></div>`).join("")||`<p class="small muted">Nenhum projeto novo com suas palavras.</p>`}</section></div>
   <section class="card stack"><div class="row between"><h2>Votações nominais no plenário · 30 dias</h2><span class="small muted">Coluna Ceará: votos da bancada do estado</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Data</th><th>O que foi votado</th><th>Resultado</th><th>Governo</th><th class="r">Sim</th><th class="r">Não</th><th>Ceará</th></tr></thead><tbody>
    ${(c.votacoes||[]).map((v,i)=>{const ce=v.ceara||[],s=ce.filter(x=>x.voto==="Sim").length,n=ce.filter(x=>x.voto==="Não").length,o=ce.length-s-n,t=ce.length||1;
      return `<tr><td class="num">${dstr(v.data)}</td><td>${v.proposicao?`<b>${esc(v.proposicao)}</b><br>`:""}<span class="small">${esc(v.descricao.slice(0,170))}</span></td><td>${v.aprovacao==1?'<span class="pill t-consulta">Aprovado</span>':v.aprovacao==0?'<span class="pill t-mp">Rejeitado</span>':"—"}</td><td>${esc(v.governo||"—")}${v.derrota?' · <b class="u-crit">derrota</b>':""}</td><td class="r">${v.sim}</td><td class="r">${v.nao}</td>
      <td><details><summary class="small" style="cursor:pointer"><span class="cebar"><i style="width:${s/t*100}%;background:var(--teal)"></i><i style="width:${n/t*100}%;background:var(--accent)"></i><i style="width:${o/t*100}%;background:var(--line)"></i></span> ${s} sim · ${n} não</summary><ul class="small" style="margin:6px 0 0;padding-left:1em">${ce.map(x=>`<li>${esc(x.nome)} (${esc(x.partido)}): <b>${esc(x.voto)}</b></li>`).join("")}</ul></details></td></tr>`}).join("")||`<tr><td colspan="7" class="muted">Sem votações nominais no período.</td></tr>`}</tbody></table></div></section>
   <div class="two"><div class="main"><section class="card stack"><h2>Discursos com suas palavras · 3 dias</h2>${(c.discursos||[]).slice(0,25).map(d=>`<div class="rowline" style="display:block"><span class="small muted">${esc(d.deputado)} (${esc(d.partido)}-${esc(d.uf)}) · ${dhora(d.data)} · “${esc(d.palavra)}”</span><p style="margin:4px 0">…${esc(d.trecho)}…</p>${d.url?`<a class="small" href="${esc(d.url)}" target="_blank" rel="noopener"><b>Discurso completo</b></a>`:""}</div>`).join("")||`<p class="small muted">Nenhum discurso com suas palavras nos últimos 3 dias. A busca roda uma vez por dia.</p>`}</section></div>
   <aside class="side"><section class="card stack"><h2>Projetos que você segue</h2>${(c.seguidos||[]).map(s=>s.erro?`<div class="rowline"><b>${esc(s.titulo)}</b><span class="small u-warn">${esc(s.erro)}</span></div>`:`<div class="rowline" style="display:block"><a href="${esc(s.link)}" target="_blank" rel="noopener"><b>${esc(s.titulo)}</b></a>${s.apelido?` · ${esc(s.apelido)}`:""}<br><span class="small">${esc(s.situacao)}</span><ol class="timeline" style="margin-top:6px">${(s.tramitacoes||[]).map((t,i)=>`<li class="${i===0?"now":""}"><span class="small muted">${dstr(t.data)}</span><span class="small"><b>${esc(t.orgao||"")}</b> ${esc(t.texto||"")}</span></li>`).join("")}</ol></div>`).join("")||""}<p class="tiny muted">Para seguir um projeto, edite config/seguir.json no GitHub.</p></section>
    <section class="card stack"><h2>Agenda dos próximos dias</h2>${agenda.map(e=>`<div class="rowline" style="display:block"><b>${dhora(e.inicio)}</b> · <span class="small">${esc(e.tipo)} · ${esc(e.orgao)}</span><br><a class="small" href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.descricao.slice(0,140))}</a></div>`).join("")||`<p class="small muted">Sem eventos.</p>`}</section></aside></div></section>`}

/* ============ TERMÔMETRO ============ */
function termoSerie(){const v=Object.values(D.termo?.votacoes||{}).filter(x=>x.governismo!=null).sort((a,b)=>new Date(a.data)-new Date(b.data));return v.map(x=>({...x,g:x.governismo}))}
function viewTermometro(){const s=termoSerie();
  if(!s.length)return `<section class="view"><div class="view-head"><span class="eyebrow">Termômetro</span><h1>Governo × Câmara</h1></div><div class="empty">O termômetro começa a encher depois da primeira coleta do Congresso, e a série cresce a cada dia.</div></section>`;
  const sem={};s.forEach(x=>{const d=new Date(x.data),k=new Date(d.getFullYear(),d.getMonth(),d.getDate()-d.getDay()).toISOString().slice(0,10);(sem[k]=sem[k]||[]).push(x)});
  const pts=Object.entries(sem).sort().map(([k,a])=>({k,g:a.reduce((t,x)=>t+x.g,0)/a.length,der:a.filter(x=>x.derrota).length,n:a.length}));
  const ult90=s.filter(x=>Date.now()-new Date(x.data)<90*864e5),par={};ult90.forEach(x=>Object.entries(x.partidos||{}).forEach(([p,[a,t]])=>{par[p]=par[p]||[0,0];par[p][0]+=a;par[p][1]+=t}));
  const partes=Object.entries(par).filter(([,v])=>v[1]>=20).map(([p,v])=>[p,v[0]/v[1]]).sort((a,b)=>b[1]-a[1]);
  const w=760,h=240,pl=44,pr=16,pt=14,pb=30,sx=i=>pl+(pts.length<2?(w-pl-pr)/2:i*(w-pl-pr)/(pts.length-1)),sy=v=>pt+(1-v)*(h-pt-pb);
  let g="";for(let v=0;v<=1.001;v+=.25)g+=`<line class="gl" x1="${pl}" x2="${w-pr}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${pl-8}" y="${sy(v)+4}" text-anchor="end">${Math.round(v*100)}%</text>`;
  g+=`<polyline points="${pts.map((p,i)=>`${sx(i)},${sy(p.g)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>`;
  pts.forEach((p,i)=>{g+=`<circle cx="${sx(i)}" cy="${sy(p.g)}" r="${p.der?7:4.5}" fill="${p.der?"var(--crit)":"var(--accent)"}"><title>Semana de ${dstr(p.k)}: ${Math.round(p.g*100)}% · ${p.n} votações${p.der?` · ${p.der} derrota(s)`:""}</title></circle>`});
  g+=`<text x="${pl}" y="${h-6}">${dstr(pts[0].k)}</text><text x="${w-pr}" y="${h-6}" text-anchor="end">${dstr(pts.at(-1).k)}</text>`;
  const ult10=s.slice(-10),der30=s.filter(x=>x.derrota&&Date.now()-new Date(x.data)<30*864e5).length;
  return `<section class="view"><div class="view-head"><span class="eyebrow">Termômetro Governo × Câmara</span><h1>Quanto a Câmara vota com o governo</h1><p class="lede">Percentual de votos Sim/Não iguais à orientação da liderança do governo, em votações nominais do plenário. Série guardada desde a primeira coleta (${s.length} votações).</p></div>
   <div class="stats"><div class="stat"><span class="small">Governismo nas últimas 10</span><b>${Math.round(ult10.reduce((a,x)=>a+x.g,0)/ult10.length*100)}%</b></div><div class="stat ${der30?"hot":""}"><span class="small">Derrotas do governo em 30 dias</span><b>${der30}</b></div><div class="stat"><span class="small">Votações na série</span><b>${s.length}</b></div><div class="stat"><span class="small">Desde</span><b style="font-size:20px">${dstr(s[0].data)}</b></div></div>
   <div class="card stack"><h3>Semana a semana</h3><div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${w} ${h}" style="min-width:520px" role="img" aria-label="Governismo semana a semana">${g}</svg></div><div class="legend"><span><i style="background:var(--accent)"></i>média da semana</span><span><i style="background:var(--crit)"></i>semana com derrota do governo</span></div></div>
   <div class="card stack"><h3>Governismo por partido · 90 dias</h3><div class="hbars">${partes.map(([p,v])=>`<div class="hbar"><span>${esc(p)}</span><span class="track"><i style="width:${v*100}%;background:${v>=.7?"var(--teal)":v>=.4?"var(--sun)":"var(--accent)"}"></i></span><b class="num">${Math.round(v*100)}%</b></div>`).join("")}</div><span class="tiny muted">Partidos com pelo menos 20 votos no período. "Derrota" compara o resultado com a orientação do governo.</span></div></section>`}

/* ============ LEITURA (modo leitura acessível) ============ */
const RUIDO=/(^|[-_\s])(ad|ads|adv|advert|advertising|publicidade|anuncio|banner|cookie|cookies|consent|lgpd|gdpr|modal|popup|pop-up|overlay|newsletter|share|sharing|compartilh|social|comment|comments|comentario|related|relacionad|recommend|recomend|leia-tambem|veja-tambem|mais-lidas|promo|sidebar|menu|breadcrumb|tags|toolbar|player-ad|outbrain|taboola)([-_\s]|$)/i;
const PAYWALL=/(paywall|subscription-gate|subscriber-only|regwall|premium-wall|conteudo-exclusivo|exclusive-content|assinante)/i;
function lerPagina(html,origem){const doc=new DOMParser().parseFromString(html,"text/html");
  const meta=(sel,attr="content")=>{const e=doc.querySelector(sel);return e?(e.getAttribute(attr)||"").trim():""};
  let ldFechado=false;doc.querySelectorAll('script[type="application/ld+json"]').forEach(s=>{if(/"isAccessibleForFree"\s*:\s*("?false"?|"False")/i.test(s.textContent))ldFechado=true});
  const blocoPaywall=[...doc.querySelectorAll("[class],[id]")].some(e=>PAYWALL.test((e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)+" "+e.id)&&e.textContent.trim().length>20);
  if(ldFechado||blocoPaywall)return {bloqueado:true,titulo:meta('meta[property="og:title"]')||((doc.querySelector("h1")||{}).textContent||"").trim()||doc.title};
  doc.querySelectorAll("script,style,noscript,template,iframe,svg,canvas,form,button,input,select,textarea,dialog,[hidden],[aria-hidden='true'],[role='navigation'],[role='banner'],[role='contentinfo'],[role='complementary'],[role='dialog'],[aria-modal='true'],nav,footer,aside").forEach(e=>e.remove());
  doc.querySelectorAll("header").forEach(h=>{if(!h.closest("article")&&!h.querySelector("h1"))h.remove()});
  [...doc.querySelectorAll("body *")].forEach(e=>{if(!e.isConnected||/^(ARTICLE|MAIN|BODY|H1|P)$/.test(e.tagName)||e.querySelector("h1"))return;const cls=(typeof e.className==="string"?e.className:"")+" "+(e.id||"");if(RUIDO.test(cls))e.remove();else{const s=(e.getAttribute("style")||"").replace(/\s/g,"");if(/position:(fixed|sticky)/i.test(s)||/filter:blur/i.test(s))e.remove()}});
  const pontua=el=>[...el.querySelectorAll("p")].reduce((a,p)=>a+p.textContent.trim().length,0);
  let nucleo=doc.querySelector("[itemprop='articleBody']");
  if(!nucleo){const arts=[...doc.querySelectorAll("article")];if(arts.length)nucleo=arts.sort((a,b)=>pontua(b)-pontua(a))[0]}
  if(!nucleo||pontua(nucleo)<200){const cands=[doc.querySelector("main"),...doc.querySelectorAll("div,section")].filter(Boolean);let melhor=null,mp=0;cands.forEach(c=>{const direto=[...c.children].filter(x=>x.tagName==="P").reduce((a,p)=>a+p.textContent.trim().length,0);if(direto>mp){mp=direto;melhor=c}});if(melhor&&(!nucleo||mp>pontua(nucleo)*0.6))nucleo=melhor}
  if(!nucleo)nucleo=doc.body;
  const limpa=t=>t.replace(/\s+/g," ").trim();
  const titulo=limpa((nucleo.querySelector("h1")||doc.querySelector("h1")||{}).textContent||"")||meta('meta[property="og:title"]')||limpa(doc.title);
  const subEl=doc.querySelector("[class*='subtitle' i],[class*='linha-fina' i],[class*='linhafina' i],[class*='standfirst' i],[class*='dek' i],[class*='chamada' i],[class*='summary' i]");
  const subtitulo=limpa(subEl?subEl.textContent:"")||meta('meta[name="description"]')||meta('meta[property="og:description"]');
  const autEl=doc.querySelector("[rel='author'],[itemprop='author'],[class*='author' i],[class*='byline' i],[class*='autor' i]");
  let autor=meta('meta[name="author"]')||limpa(autEl?autEl.textContent:"");if(autor.length>120)autor=autor.slice(0,120);
  const tEl=doc.querySelector("time[datetime]");const dataBruta=meta('meta[property="article:published_time"]')||(tEl?tEl.getAttribute("datetime"):"");
  const data=dataBruta?new Date(dataBruta).toLocaleString("pt-BR",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}):"";
  const blocos=[];const vistos=new Set([norm(titulo),norm(subtitulo)]);
  nucleo.querySelectorAll("h2,h3,h4,h5,h6,p,blockquote,li,figcaption,pre").forEach(el=>{
    if(el.tagName!=="BLOCKQUOTE"&&el.parentElement&&el.parentElement.closest("blockquote,figcaption,li"))return;
    if(el.tagName==="LI"&&el.closest("p"))return;
    const t=limpa(el.textContent);if(t.length<2||vistos.has(norm(t)))return;vistos.add(norm(t));
    const tag=el.tagName;
    if(/^H[2-6]$/.test(tag))blocos.push("#".repeat(Math.min(6,+tag[1]))+" "+t);
    else if(tag==="BLOCKQUOTE")blocos.push("> "+t);
    else if(tag==="LI")blocos.push("- "+t);
    else if(tag==="FIGCAPTION")blocos.push("*"+t+"*");
    else if(tag==="PRE")blocos.push("```\n"+el.textContent.trim()+"\n```");
    else blocos.push(t)});
  const md=[`# ${titulo}`];if(subtitulo)md.push(`## ${subtitulo}`);const linha=[autor,data].filter(Boolean).join(" · ");if(linha)md.push(`*${linha}*`);
  return {bloqueado:false,titulo,markdown:md.concat(blocos).join("\n\n"),palavras:blocos.join(" ").split(/\s+/).length,origem}}
function mdParaDom(md,alvo){alvo.textContent="";md.split(/\n{2,}/).forEach(b=>{let el;
  if(/^```/.test(b)){el=document.createElement("pre");el.textContent=b.replace(/^```\n?|\n?```$/g,"")}
  else if(/^#{1,6} /.test(b)){const n=b.match(/^#+/)[0].length;el=document.createElement("h"+n);el.textContent=b.slice(n+1)}
  else if(/^> /.test(b)){el=document.createElement("blockquote");el.textContent=b.slice(2)}
  else if(/^- /.test(b)){el=document.createElement("p");el.textContent="• "+b.slice(2)}
  else if(/^\*.*\*$/.test(b)){el=document.createElement("p");el.className="meta";el.textContent=b.slice(1,-1)}
  else{el=document.createElement("p");el.textContent=b}alvo.append(el)})}
let LEITURA=null;
function viewLeitura(){return `<section class="view"><div class="view-head"><span class="eyebrow">Modo leitura</span><h1>Ler uma notícia sem distração</h1><p class="lede">Tira menus, anúncios, avisos de cookies e pop-ups, e entrega o texto íntegro em Markdown, bom para leitor de tela e celular. Nada é resumido nem reescrito, e nada sai do seu navegador.</p></div>
  <div class="card stack"><div class="tabs" role="tablist"><button class="chip" data-modo="url" aria-pressed="true">Endereço</button><button class="chip" data-modo="colar" aria-pressed="false">Colar o código da página</button><button class="chip" data-modo="arquivo" aria-pressed="false">Arquivo salvo (.html)</button></div>
   <div data-painel="url" class="stack"><label class="f" for="lUrl">Endereço da notícia<input id="lUrl" type="text" placeholder="https://…" value="${esc(store.get("rd_ler_url",""))}"></label><div class="row"><button class="btn primary" id="lIr">Abrir no modo leitura</button><span class="small muted">${leitorCfg().url?"Usando o seu leitor":"Sem leitor configurado: só funciona com sites que liberam acesso"}</span></div>
    <details><summary class="small" style="cursor:pointer;font-weight:800">Configurar o seu leitor (para abrir qualquer endereço)</summary><div class="stack" style="margin-top:8px"><p class="small">Cole o endereço e a chave do seu leitor na Cloudflare (passo a passo no LEIA-ME). Ficam só neste navegador.</p><label class="f" for="lPx">Endereço do leitor<input id="lPx" type="text" placeholder="https://meu-leitor.SEU-NOME.workers.dev" value="${esc(leitorCfg().url)}"></label><label class="f" for="lCh">Chave<input id="lCh" type="password" value="${esc(leitorCfg().chave)}"></label><div><button class="btn sm" id="lSalvaPx">Salvar</button></div></div></details></div>
   <div data-painel="colar" class="stack" hidden><label class="f" for="lHtml">Código HTML da página<textarea id="lHtml" rows="6" placeholder="Cole aqui o código-fonte (Ctrl+U, Ctrl+A, Ctrl+C)"></textarea></label><div><button class="btn primary" id="lColar">Limpar e ler</button></div></div>
   <div data-painel="arquivo" class="stack" hidden><label class="dropzone" for="lArq"><b>Escolher a página salva (.html)</b><input id="lArq" type="file" accept=".html,.htm,text/html" hidden></label></div>
   <p class="tiny muted">O modo leitura não remove bloqueios de assinatura. Se a notícia for só para assinantes, abra no site do jornal com a sua conta e salve a página já logada.</p></div>
  <div id="lSaida"></div>
  <section class="card stack"><div class="row between"><div><span class="eyebrow">Texto integral, reprodução permitida</span><h2>Agências públicas</h2></div><span class="small muted">${D.agencias?"Atualizado "+ago(D.agencias.atualizado):"Ainda não coletado"}</span></div>
   <p class="small muted">Matérias da Agência Brasil, da Agência Câmara e da Agência Senado, com texto completo, crédito e link do original.</p>
   <div class="row"><button class="chip" data-ag="" aria-pressed="true">Todas</button>${[...new Set((D.agencias?.materias||[]).map(m=>m.agencia))].map(a=>`<button class="chip" data-ag="${esc(a)}" aria-pressed="false">${esc(a)}</button>`).join("")}<label class="vh" for="agQ">Buscar nas agências</label><input id="agQ" type="text" placeholder="Buscar nas agências" style="flex:1;min-width:180px"></div>
   <div id="agLista" class="stack"></div></section></section>`}
function renderAgencias(filtro,q){const box=$("#agLista");if(!box)return;q=norm(q||"");
  const ms=(D.agencias?.materias||[]).filter(m=>(!filtro||m.agencia===filtro)&&(!q||norm(m.titulo+" "+m.markdown).includes(q)));
  box.innerHTML=ms.length?ms.slice(0,60).map(m=>`<div class="rowline"><span style="min-width:0"><button class="btn ghost sm" style="text-align:left;padding:4px 0;box-shadow:none;border:0;font-weight:800" data-agler="${m.id}">${esc(m.titulo)}</button><br><span class="small muted">${esc(m.agencia)} · ${dhora(m.publicado)} · ${m.palavras} palavras</span></span></div>`).join(""):`<p class="small muted">${D.agencias?"Nada encontrado.":"A coleta das agências roda a cada 3 horas. Rode a automação no GitHub para preencher agora."}</p>`}
const leitorCfg=()=>store.get("rd_leitor",{url:"",chave:""});
function agenciasHtml(){const ag=(D.noticias?.noticias||[]).filter(n=>n.texto_livre).slice(0,12);if(!ag.length)return"";
  return `<div class="card stack"><h2>Agências públicas · texto completo</h2><p class="small muted">Agência Brasil (Creative Commons), Agência Câmara e Agência Senado permitem reproduzir o texto citando a fonte.</p>${ag.map(n=>`<div class="rowline"><span><b>${esc(n.titulo)}</b><br><span class="small muted">${esc(n.fonte)} · ${ago(n.publicado)}</span></span><button class="btn sm" data-lerurl="${esc(n.link)}">Ler aqui</button></div>`).join("")}</div>`}
async function baixarPagina(u){const cfg=leitorCfg();
  if(cfg.url){const r=await fetch(cfg.url+"/?url="+encodeURIComponent(u),{headers:{"X-Chave":cfg.chave}});if(r.status===401)throw new Error("Chave do leitor incorreta. Confira em “Configurar o seu leitor”.");if(!r.ok)throw new Error("O leitor não conseguiu abrir a página ("+r.status+": "+(await r.text()).slice(0,80)+").");return r.text()}
  try{const r=await fetch(u);if(!r.ok)throw new Error();return await r.text()}catch(e){throw new Error("Este site não deixa a página ser lida direto daqui. Configure o seu leitor (abaixo do endereço), ou salve a página (Ctrl+S) e use “Arquivo salvo”.")}}
function mostrarLeitura(r){const box=$("#lSaida");if(!box)return;LEITURA=r;
  if(r.erro){box.innerHTML=`<div class="empty"><b>${esc(r.erro)}</b></div>`;return}
  if(r.bloqueado){box.innerHTML=`<div class="card stack" style="background:var(--sun-soft)"><h2>Conteúdo exclusivo para assinantes</h2><p>${r.titulo?`“${esc(r.titulo)}” `:""}é marcado pelo jornal como restrito a assinantes. O modo leitura não remove esse bloqueio. Se você assina, abra no site com a sua conta, salve a página e carregue o arquivo aqui.</p></div>`;return}
  const tam=store.get("rd_ler_tam",19),hc=store.get("rd_ler_hc",false);
  box.innerHTML=`<div class="card stack"><div class="row between"><span class="small muted">${r.palavras} palavras · cerca de ${Math.max(1,Math.round(r.palavras/200))} min${r.origem?` · <a href="${esc(r.origem)}" target="_blank" rel="noopener">original</a>`:""}${r.credito?`<br><span class="tiny">Fonte: ${esc(r.credito)}</span>`:""}</span>
   <div class="row"><button class="btn sm" id="lMenos" aria-label="Diminuir texto">A−</button><button class="btn sm" id="lMais" aria-label="Aumentar texto">A+</button><button class="btn sm" id="lHc" aria-pressed="${hc}">Alto contraste</button><button class="btn sm" id="lVoz">Ler em voz alta</button><button class="btn sm" id="lCopiar">Copiar Markdown</button><button class="btn sm" id="lBaixar">Baixar .md</button></div></div>
   <div class="tabs"><button class="chip" data-ver="ler" aria-pressed="true">Leitura</button><button class="chip" data-ver="md" aria-pressed="false">Markdown</button></div>
   <article class="reader ${hc?"hc":""}" id="lTexto" style="--rd-size:${tam}px" lang="pt-BR"></article><label class="vh" for="lMd">Markdown</label><textarea id="lMd" class="copybox" rows="18" readonly hidden></textarea></div>`;
  mdParaDom(r.markdown,$("#lTexto"));$("#lMd").value=r.markdown;
  $$("[data-ver]").forEach(b=>b.onclick=()=>{$$("[data-ver]").forEach(x=>x.setAttribute("aria-pressed",x===b));$("#lTexto").hidden=b.dataset.ver!=="ler";$("#lMd").hidden=b.dataset.ver!=="md"});
  const tamanho=d=>{const t=Math.min(30,Math.max(14,store.get("rd_ler_tam",19)+d));store.set("rd_ler_tam",t);$("#lTexto").style.setProperty("--rd-size",t+"px")};
  $("#lMenos").onclick=()=>tamanho(-2);$("#lMais").onclick=()=>tamanho(2);
  $("#lHc").onclick=e=>{const v=!store.get("rd_ler_hc",false);store.set("rd_ler_hc",v);e.target.setAttribute("aria-pressed",v);$("#lTexto").classList.toggle("hc",v)};
  $("#lVoz").onclick=e=>{if(!("speechSynthesis" in window))return toast("Seu navegador não lê em voz alta");if(speechSynthesis.speaking){speechSynthesis.cancel();e.target.textContent="Ler em voz alta";return}const u=new SpeechSynthesisUtterance($("#lTexto").innerText);u.lang="pt-BR";u.onend=()=>{e.target.textContent="Ler em voz alta"};speechSynthesis.speak(u);e.target.textContent="Parar leitura"};
  const comCredito=r.markdown+(r.credito?`\n\n---\n\n*Fonte: ${r.credito} Original: ${r.origem}*`:"");$("#lMd").value=comCredito;$("#lCopiar").onclick=()=>copiar(comCredito);$("#lBaixar").onclick=()=>baixar((r.titulo||"noticia").slice(0,60).replace(/[^\wÀ-ú -]/g,"").trim().replace(/\s+/g,"-")+".md",comCredito,"text/markdown")}
function bindLeitura(){$$("[data-modo]").forEach(b=>b.onclick=()=>{$$("[data-modo]").forEach(x=>x.setAttribute("aria-pressed",x===b));$$("[data-painel]").forEach(p=>p.hidden=p.dataset.painel!==b.dataset.modo)});
  $("#lIr").onclick=async()=>{const u=$("#lUrl").value.trim();if(!/^https?:\/\//.test(u))return toast("Cole um endereço que comece com https://");store.set("rd_ler_url",u);$("#lSaida").innerHTML=`<div class="empty"><span class="spin"></span> Abrindo…</div>`;
    try{mostrarLeitura(lerPagina(await baixarPagina(u),u))}catch(e){mostrarLeitura({erro:e.message||"Não foi possível abrir."})}};
  const sp=$("#lSalvaPx");if(sp)sp.onclick=()=>{store.set("rd_leitor",{url:$("#lPx").value.trim().replace(/\/$/,""),chave:$("#lCh").value});toast("Leitor salvo neste navegador");rota()};
  $("#lColar").onclick=()=>{const h=$("#lHtml").value;if(h.trim().length<50)return toast("Cole o código completo da página");mostrarLeitura(lerPagina(h,""))};
  $("#lArq").onchange=async e=>{const f=e.target.files[0];if(f)mostrarLeitura(lerPagina(await f.text(),""))};
  let agF="",agQ="";renderAgencias(agF,agQ);
  $$("[data-ag]").forEach(x=>x.onclick=()=>{agF=x.dataset.ag;$$("[data-ag]").forEach(y=>y.setAttribute("aria-pressed",y===x));renderAgencias(agF,agQ)});
  $("#agQ").oninput=e=>{agQ=e.target.value;renderAgencias(agF,agQ)};
  $("#agLista").onclick=e=>{const b=e.target.closest("[data-agler]");if(!b)return;const m=(D.agencias?.materias||[]).find(x=>x.id===b.dataset.agler);if(m){mostrarLeitura({bloqueado:false,titulo:m.titulo,markdown:m.markdown,palavras:m.palavras,origem:m.link,credito:m.credito});$("#lSaida").scrollIntoView({behavior:"smooth",block:"start"})}};
  const agp=sessionStorage.getItem("rd_ler_ag");if(agp){sessionStorage.removeItem("rd_ler_ag");const m=(D.agencias?.materias||[]).find(x=>x.id===agp);if(m)mostrarLeitura({bloqueado:false,titulo:m.titulo,markdown:m.markdown,palavras:m.palavras,origem:m.link,credito:m.credito})}
  const pend=sessionStorage.getItem("rd_ler_pend");if(pend){sessionStorage.removeItem("rd_ler_pend");$("#lUrl").value=pend;$("#lIr").click()}}

/* ============ SALVAS ============ */
function viewSalvas(){return `<section class="view"><div class="view-head"><span class="eyebrow">Salvas</span><h1>Para ler e usar depois</h1><p class="lede">Ficam neste navegador. "Arquivar" abre o Internet Archive para guardar uma cópia datada da página, útil se ela for apagada. Funciona melhor com o endereço final do jornal: abra a notícia e copie o endereço da barra.</p></div>
  ${st.salvas.length?`<div class="row"><button class="btn" id="cpS">Copiar lista com links</button></div><div class="stack">${st.salvas.slice().reverse().map(n=>`<div class="card row between"><span style="min-width:0"><a href="${esc(n.link)}" target="_blank" rel="noopener"><b>${esc(n.titulo)}</b></a><br><span class="small muted">${esc(n.fonte)} · ${dhora(n.publicado)}</span></span><span class="row"><a class="btn sm" href="https://web.archive.org/save/${esc(n.link)}" target="_blank" rel="noopener">Arquivar</a><button class="btn sm ghost" data-salvar="${n.id}">Remover</button></span></div>`).join("")}</div>`:`<div class="empty">Nada salvo ainda. Use "Salvar" nas notícias.</div>`}</section>`}

/* ============ FONTES ============ */
function viewFontes(){const ns=D.noticias.noticias||[],porG={};ns.forEach(n=>porG[n.grupo]=(porG[n.grupo]||0)+1);const tot=ns.length||1;
  return `<section class="view"><div class="view-head"><span class="eyebrow">Fontes</span><h1>De onde vêm os dados</h1><p class="lede">Notícias: Google Notícias, de hora em hora. Congresso: API da Câmara, a cada 3 horas. Discursos e resumo: uma vez por dia. Economia: Banco Central.</p></div>
  <div class="grid g2"><div class="card stack"><h3>Notícias por grupo de veículo</h3><div class="hbars">${Object.entries(porG).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="hbar"><span class="small">${esc(k)}</span><span class="track"><i style="width:${v/tot*100}%;background:var(--teal)"></i></span><b class="num small">${v}</b></div>`).join("")}</div><span class="tiny muted">Os grupos estão em config/fontes.json e podem ser mudados.</span></div>
   <div class="card stack"><h3>Congresso · última coleta ${ago(D.cong.atualizado)}</h3>${(D.cong.status||[]).map(s=>`<div class="rowline"><span>${esc(s.etapa)}</span>${s.ok?'<span class="pill t-consulta">OK</span>':`<span class="pill t-mp" title="${esc(s.erro||"")}">Falhou</span>`}</div>`).join("")||`<p class="small muted">Ainda não rodou.</p>`}</div></div>
  <div class="card stack"><h3>Agências públicas · ${D.agencias?"última coleta "+ago(D.agencias.atualizado):"ainda não coletado"}</h3>${(D.agencias?.status||[]).map(s=>`<div class="rowline"><span>${esc(s.agencia)}</span>${s.ok?`<span class="pill t-consulta">OK · ${s.novas} novas</span>`:`<span class="pill t-mp" title="${esc(s.erro||"")}">Falhou</span>`}</div>`).join("")}</div>
  ${D.status?`<div class="card stack"><h3>Notícias · última coleta ${ago(D.status.atualizado)}, ${D.status.novas} novas</h3><div class="tbl-wrap"><table><thead><tr><th>Busca</th><th>Estado</th><th class="r">Itens</th></tr></thead><tbody>${D.status.buscas.map(b=>`<tr><td>${esc(b.busca)}</td><td>${b.ok?'<span class="pill t-consulta">OK</span>':`<span class="pill t-mp">Falhou</span> <span class="tiny muted">${esc(b.erro||"")}</span>`}</td><td class="r">${b.itens??"—"}</td></tr>`).join("")}</tbody></table></div></div>`:""}</section>`}

/* ============ rotas, modo calmo e eventos ============ */
const VIEWS={hoje:[viewHoje],noticias:[viewNoticias,bindNoticias],congresso:[viewCongresso],termometro:[viewTermometro],leitura:[viewLeitura,bindLeitura],salvas:[viewSalvas,()=>{const b=$("#cpS");if(b)b.onclick=()=>copiar(st.salvas.map(n=>`${n.titulo} (${n.fonte})\n${n.link}`).join("\n\n"))}],fontes:[viewFontes]};
let atual="hoje",pronto=false;
function rota(){const h=(location.hash||"#hoje").slice(1);atual=VIEWS[h]?h:"hoje";if(st.calmo&&!["hoje","leitura","salvas"].includes(atual))atual="hoje";
  $$(".nav a").forEach(a=>a.getAttribute("href")==="#"+atual?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current"));
  if(!pronto&&atual!=="leitura")return;$("#app").innerHTML=VIEWS[atual][0]();VIEWS[atual][1]&&VIEWS[atual][1]();window.scrollTo(0,0)}
function aplicarCalmo(){document.body.classList.toggle("calm",st.calmo);$("#calmo").setAttribute("aria-pressed",st.calmo)}
function findN(id){return (D.noticias.noticias||[]).find(n=>n.id===id)||st.salvas.find(n=>n.id===id)}
document.addEventListener("click",e=>{const rm=e.target.closest("[data-rm]");if(rm){st.extras=st.extras.filter(x=>x!==rm.dataset.rm);store.set("rd_vigiar",st.extras);if(atual==="noticias")renderNoticias();return}
  const r=e.target.closest("[data-read]");if(r){st.lidas.add(r.dataset.read);saveLidas()}
  const l=e.target.closest("[data-ler]");if(l){sessionStorage.setItem("rd_ler_pend",l.dataset.ler)}
  const lu=e.target.closest("[data-lerurl]");if(lu){const m=(D.agencias?.materias||[]).find(x=>x.link===lu.dataset.lerurl);if(m){if(atual!=="leitura"){sessionStorage.setItem("rd_ler_ag",m.id);location.hash="leitura"}else{mostrarLeitura({bloqueado:false,titulo:m.titulo,markdown:m.markdown,palavras:m.palavras,origem:m.link,credito:m.credito});$("#lSaida").scrollIntoView({behavior:"smooth"})}return}if(atual==="leitura"){$("#lUrl").value=lu.dataset.lerurl;$("#lIr").click();$("#lSaida").scrollIntoView({behavior:"smooth"})}else{sessionStorage.setItem("rd_ler_pend",lu.dataset.lerurl);location.hash="leitura"}}
  const s=e.target.closest("[data-salvar]");if(s){const id=s.dataset.salvar,i=st.salvas.findIndex(x=>x.id===id);if(i>=0)st.salvas.splice(i,1);else{const n=findN(id);if(n)st.salvas.push({id:n.id,titulo:n.titulo,link:n.link,fonte:n.fonte,publicado:n.publicado})}store.set("rd_salvas",st.salvas);toast(i>=0?"Removida":"Salva");rota()}
  const d=e.target.closest("[data-lido]");if(d){const g=GRUPOS[+d.dataset.lido];if(g){const todas=g.itens.every(i=>st.lidas.has(i.id));g.itens.forEach(i=>todas?st.lidas.delete(i.id):st.lidas.add(i.id));saveLidas();renderNoticias()}}});
$("#calmo").onclick=()=>{st.calmo=!st.calmo;store.set("rd_calmo",st.calmo);aplicarCalmo();toast(st.calmo?"Modo calmo: só o resumo, os alertas e a leitura":"Painel completo");rota()};
$("#q").addEventListener("input",e=>{st.q=e.target.value;if(atual!=="noticias"&&!st.calmo)location.hash="noticias";else if(atual==="noticias")renderNoticias()});
window.addEventListener("hashchange",rota);
window.addEventListener("pagehide",()=>store.set("rd_visita",new Date().toISOString()));
aplicarCalmo();rota();
carregar().then(()=>{pronto=true;rota()});
setInterval(()=>carregar().then(()=>{if(["hoje","noticias"].includes(atual))rota()}),20*60e3);
})();
