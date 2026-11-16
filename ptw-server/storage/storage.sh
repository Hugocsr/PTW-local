#!/bin/sh
# Sobe o SeaweedFS num processo só (master + volume + filer + gateway S3) e garante o bucket.
# As credenciais vêm dos segredos do Docker; o arquivo de identidades vive só em /tmp (tmpfs).
set -eu
BUCKET=ptw-arquivos
KEY=$(cat /run/secrets/s3_api_key)
SECRET=$(cat /run/secrets/s3_api_secret)

# A API só lê, grava e lista neste bucket. Sem Admin: não cria nem apaga buckets.
umask 077
cat > /tmp/s3.json <<EOF
{ "identities": [
  { "name": "ptw_api",
    "credentials": [{ "accessKey": "$KEY", "secretKey": "$SECRET" }],
    "actions": ["Read:$BUCKET", "Write:$BUCKET", "List:$BUCKET"] }
] }
EOF

/usr/bin/weed -logtostderr=true server \
  -dir=/data -ip=127.0.0.1 -ip.bind=0.0.0.0 \
  -master.volumeSizeLimitMB=1024 -master.defaultReplication=000 \
  -volume.max=0 -volume.index=leveldb \
  -filer -filer.encryptVolumeData \
  -s3 -s3.port=8333 -s3.config=/tmp/s3.json &
PID=$!
trap 'kill -TERM $PID; wait $PID' TERM INT

until wget -q -O /dev/null http://127.0.0.1:8333/healthz 2>/dev/null; do sleep 1; done
echo "s3.bucket.create -name $BUCKET" | /usr/bin/weed shell -master=127.0.0.1:9333 -filer=127.0.0.1:8888 >/dev/null 2>&1 || true
echo "armazenamento pronto: bucket $BUCKET"
wait $PID
