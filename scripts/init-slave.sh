#!/bin/bash
set -e

PGDATA=/var/lib/postgresql/data
MASTER_HOST="${PG_MASTER_HOST:-csdl_db_master}"
REPLICATION_PASS="${PG_REPLICATION_PASSWORD:-replicatorpass}"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[slave] PGDATA is empty — starting base backup from $MASTER_HOST..."

    # Chờ master sẵn sàng VÀ replication user đã được tạo
    until PGPASSWORD="$REPLICATION_PASS" pg_isready -h "$MASTER_HOST" -p 5432 -U replicator 2>/dev/null; do
        echo "[slave] Waiting for replication user on master..."
        sleep 3
    done

    # Thử pg_basebackup — retry nếu fail (master chưa xong init script)
    until PGPASSWORD="$REPLICATION_PASS" pg_basebackup \
        -h "$MASTER_HOST" \
        -p 5432 \
        -U replicator \
        -D "$PGDATA" \
        -P -Xs -R \
        --checkpoint=fast; do
        echo "[slave] pg_basebackup failed, retrying in 5s..."
        rm -rf "${PGDATA:?}"/*
        sleep 5
    done

    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    echo "[slave] Base backup complete — slave is ready as hot standby."
fi

exec /usr/local/bin/docker-entrypoint.sh postgres "$@"
