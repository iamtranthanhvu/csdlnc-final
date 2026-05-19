#!/bin/bash
# TODO: script cấu hình PostgreSQL Streaming Replication
# Chạy sau khi pg-master và pg-slave đã start

# Bước 1: Cấu hình pg-master cho phép replication
# Bước 2: Tạo replication user trên master
# Bước 3: pg_basebackup từ master sang slave
# Bước 4: Cấu hình recovery.conf trên slave
# Bước 5: Restart slave và kiểm tra replication lag

echo "TODO: implement replication setup"
