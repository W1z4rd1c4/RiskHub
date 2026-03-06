FROM redis:7-alpine

RUN addgroup -S -g 10001 riskhub && adduser -S -D -u 10001 -G riskhub riskhub
COPY --chmod=755 entrypoint.sh /usr/local/bin/riskhub-redis-entrypoint.sh
RUN mkdir -p /run/riskhub /data && chown -R 10001:10001 /run/riskhub /data

USER 10001:10001

ENTRYPOINT ["/usr/local/bin/riskhub-redis-entrypoint.sh"]
