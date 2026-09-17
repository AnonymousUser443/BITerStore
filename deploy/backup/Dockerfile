FROM postgres:17-alpine
RUN apk add --no-cache gnupg
COPY backup.sh restore-drill.sh backup-health.sh /usr/local/bin/
RUN chmod 0555 /usr/local/bin/backup.sh /usr/local/bin/restore-drill.sh /usr/local/bin/backup-health.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
