#!/bin/sh
set -eu
mkdir -p /tmp/ldap
if [ ! -s /certs/ca.crt ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/ca.key -out /certs/ca.crt -days 30 -subj /CN=PTW-Test-CA >/dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -keyout /certs/server.key -out /tmp/server.csr -subj /CN=ldap-test >/dev/null 2>&1
  printf 'subjectAltName=DNS:ldap-test\nextendedKeyUsage=serverAuth\n' > /tmp/ext
  openssl x509 -req -in /tmp/server.csr -CA /certs/ca.crt -CAkey /tmp/ca.key -CAcreateserial -out /certs/server.crt -days 30 -extfile /tmp/ext >/dev/null 2>&1
  chmod 600 /certs/server.key
fi
cat > /tmp/slapd.conf <<'EOF'
include /etc/openldap/schema/core.schema
include /etc/openldap/schema/cosine.schema
include /etc/openldap/schema/inetorgperson.schema
pidfile /tmp/slapd.pid
argsfile /tmp/slapd.args
modulepath /usr/lib/openldap
moduleload back_mdb.so
TLSCACertificateFile /certs/ca.crt
TLSCertificateFile /certs/server.crt
TLSCertificateKeyFile /certs/server.key
security simple_bind=128
database mdb
maxsize 10485760
suffix "dc=ptw,dc=test"
rootdn "cn=reader,dc=ptw,dc=test"
rootpw Somente-teste-local
directory /tmp/ldap
access to attrs=userPassword by anonymous auth by self write by * none
access to * by dn.exact="cn=reader,dc=ptw,dc=test" read by * none
EOF
slapadd -f /tmp/slapd.conf -l /fixture/directory.ldif
exec slapd -f /tmp/slapd.conf -h 'ldaps://0.0.0.0:1636 ldap://0.0.0.0:1389' -d 256
