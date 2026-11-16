"""Recursos do sistema para o rodapé do app: grava /status/status.json a cada PTW_INTERVALO segundos.

Lê a API do Docker pelo repassador `stats-docker` (só GET em /containers e /system; nada mais),
nunca pelo socket. Só a biblioteca padrão. Formato (v1), bytes e núcleos de CPU:

  {"v": 1, "at": "...Z", "interval": 5,
   "services": [{"name": "db", "state": "running", "health": "healthy",
                 "memory": {"used": 64e6, "limit": 536870912}, "cpu": {"used": 0.02, "limit": 1.0},
                 "image": {"name": "postgres:18.6-alpine", "size": 433e6},
                 "volumes": [{"name": "ptw_pgdata", "size": 69e6}]}],
   "imagesSize": 1.3e9, "volumesSize": 72e6, "disk": {"free": ..., "total": ...}, "sizesAt": "...Z"}

Valor desconhecido é null (sem limite, parado, primeira leitura da CPU, tamanhos ainda não lidos).
"""
import http.client
import json
import os
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

HOST = os.environ.get("PTW_DOCKER_HOST", "stats-docker")
PROJETO = os.environ.get("PTW_PROJETO", "ptw")
INTERVALO = float(os.environ.get("PTW_INTERVALO", "5"))
TAMANHOS_A_CADA = float(os.environ.get("PTW_TAMANHOS_A_CADA", "60"))  # /system/df é caro: um minuto
SAIDA = os.environ.get("PTW_SAIDA", "/status/status.json")


def agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def get(caminho):
    c = http.client.HTTPConnection(HOST, 2375, timeout=20)
    try:
        c.request("GET", caminho)
        r = c.getresponse()
        corpo = r.read()
        if r.status != 200:
            raise RuntimeError(f"{caminho}: HTTP {r.status}")
        return json.loads(corpo)
    finally:
        c.close()


def filtro_projeto():
    return urllib.parse.quote(json.dumps({"label": [f"com.docker.compose.project={PROJETO}"]}))


inspecao = {}   # id -> (limites, imagem, volumes): não mudam enquanto o contêiner existe
anterior = {}   # id -> (cpu total em ns, instante em ns) para a CPU entre duas leituras
tamanhos = {"imagens": {}, "volumes": {}, "at": None, "quando": 0.0}


def inspeciona(cid):
    if cid not in inspecao:
        d = get(f"/containers/{cid}/json")
        hc = d.get("HostConfig") or {}
        vols = [m["Name"] for m in d.get("Mounts") or [] if m.get("Type") == "volume"]
        inspecao[cid] = {
            "mem": hc.get("Memory") or None,
            "cpu": (hc.get("NanoCpus") or 0) / 1e9 or None,
            "imagem": d.get("Config", {}).get("Image"),
            "imagem_id": d.get("Image"),
            "volumes": vols,
        }
    return inspecao[cid]


def leitura(cid):
    s = get(f"/containers/{cid}/stats?stream=false&one-shot=true")
    m = s.get("memory_stats") or {}
    usado = m.get("usage")
    if usado is not None:  # como o `docker stats`: sem o cache de arquivos que o kernel devolve sob pressão
        usado -= (m.get("stats") or {}).get("inactive_file", 0)
    total = ((s.get("cpu_stats") or {}).get("cpu_usage") or {}).get("total_usage")
    t = time.monotonic_ns()
    cpu = None
    if total is not None and cid in anterior:
        dt = t - anterior[cid][1]
        if dt > 0:
            cpu = max(0.0, (total - anterior[cid][0]) / dt)
    if total is not None:
        anterior[cid] = (total, t)
    return usado, cpu


def atualiza_tamanhos():
    df = get("/system/df?type=image&type=volume")
    tamanhos["imagens"] = {i["Id"]: i.get("Size") for i in df.get("Images") or []}
    tamanhos["volumes"] = {
        v["Name"]: ((v.get("UsageData") or {}).get("Size") if (v.get("UsageData") or {}).get("Size", -1) >= 0 else None)
        for v in df.get("Volumes") or []
    }
    tamanhos["at"] = agora()
    tamanhos["quando"] = time.monotonic()


def coleta():
    lista = get(f"/containers/json?all=1&filters={filtro_projeto()}")
    # Imagem ou volume novo (rebuild, serviço novo): lê os tamanhos de novo sem esperar o minuto, no máximo a cada 15 s.
    novo = any(c.get("ImageID") not in tamanhos["imagens"] for c in lista)
    idade = time.monotonic() - tamanhos["quando"]
    if tamanhos["at"] is None or idade >= TAMANHOS_A_CADA or (novo and idade >= 15):
        try:
            atualiza_tamanhos()
        except Exception as e:  # sem tamanhos, o resto continua
            print(f"tamanhos: {e}", file=sys.stderr, flush=True)
    vivos = {c["Id"] for c in lista}
    for cid in list(inspecao):
        if cid not in vivos:
            inspecao.pop(cid, None)
            anterior.pop(cid, None)

    def um(c):
        cid = c["Id"]
        info = inspeciona(cid)
        rodando = c.get("State") == "running"
        usado, cpu = leitura(cid) if rodando else (None, None)
        if not rodando:
            anterior.pop(cid, None)
        status = c.get("Status") or ""
        saude = "healthy" if "(healthy)" in status else "unhealthy" if "(unhealthy)" in status else "starting" if "health: starting" in status else None
        return {
            "name": (c.get("Labels") or {}).get("com.docker.compose.service") or c["Names"][0].lstrip("/"),
            "state": c.get("State"),
            "health": saude,
            "memory": {"used": usado, "limit": info["mem"]},
            "cpu": {"used": cpu, "limit": info["cpu"]},
            "image": {"name": info["imagem"], "size": tamanhos["imagens"].get(info["imagem_id"])},
            "volumes": [{"name": v, "size": tamanhos["volumes"].get(v)} for v in info["volumes"]],
        }

    with ThreadPoolExecutor(max_workers=6) as ex:
        servicos = sorted(ex.map(um, lista), key=lambda s: s["name"])

    imagens = {}
    for c in lista:
        imagens[c.get("ImageID")] = tamanhos["imagens"].get(c.get("ImageID"))
    volumes = {v["name"]: v["size"] for s in servicos for v in s["volumes"]}
    soma = lambda xs: None if not xs or any(x is None for x in xs) else sum(xs)
    st = os.statvfs("/")  # o disco onde o Docker guarda imagens e volumes
    return {
        "v": 1,
        "at": agora(),
        "interval": INTERVALO,
        "services": servicos,
        "imagesSize": soma(list(imagens.values())),
        "volumesSize": soma(list(volumes.values())),
        "disk": {"free": st.f_bavail * st.f_frsize, "total": st.f_blocks * st.f_frsize},
        "sizesAt": tamanhos["at"],
    }


def grava(dados):
    tmp = SAIDA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, 0o644)
    os.replace(tmp, SAIDA)  # troca atômica: o Caddy nunca serve meio arquivo


def main():
    while True:
        inicio = time.monotonic()
        try:
            grava(coleta())
        except Exception as e:
            print(f"coleta: {e}", file=sys.stderr, flush=True)
        time.sleep(max(0.5, INTERVALO - (time.monotonic() - inicio)))


if __name__ == "__main__":
    main()
