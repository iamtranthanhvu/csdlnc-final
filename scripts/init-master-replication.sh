#!/bin/bash
set -e

# Tạo replication user trên master
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
  CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD '${PG_REPLICATION_PASSWORD:-replicatorpass}';
EOSQL

# Cho phép slave kết nối replication
echo "host replication replicator all md5" >> "$PGDATA/pg_hba.conf"

# Reload để pg_hba.conf có hiệu lực ngay
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();"

echo "[master] Replication user and pg_hba.conf configured."
