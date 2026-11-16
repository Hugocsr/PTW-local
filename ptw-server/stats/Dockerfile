# Coletor de recursos do rodapé do app: Python só com a biblioteca padrão, sem root.
FROM python:3.13.9-alpine3.22
# /status vira o volume "status"; o dono (1002) vem daqui quando o volume é criado.
RUN addgroup -S -g 1002 stats && adduser -S -u 1002 -G stats stats \
 && mkdir /status && chown stats:stats /status
COPY coletor.py /ptw/coletor.py
USER stats
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "-I", "/ptw/coletor.py"]
