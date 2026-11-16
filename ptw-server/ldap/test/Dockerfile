FROM alpine:3.22
RUN apk add --no-cache openldap openldap-back-mdb openldap-clients openssl && mkdir /certs && chown 1000:1000 /certs
COPY start.sh directory.ldif /fixture/
USER 1000:1000
ENTRYPOINT ["sh","/fixture/start.sh"]
