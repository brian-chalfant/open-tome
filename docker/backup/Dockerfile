# postgres:16-alpine includes pg_dump — no extra packages needed.
FROM postgres:16-alpine

# Install busybox crond (the base image uses bash, not ash, so crond is not bundled)
RUN apk add --no-cache busybox-suid gnupg

COPY backup.sh /backup.sh
COPY crontab   /etc/crontabs/root
RUN  sed -i 's/\r$//' /backup.sh /etc/crontabs/root && chmod +x /backup.sh

# crond -f runs in foreground; -l 2 sets log level to NOTICE
CMD ["crond", "-f", "-l", "2"]
