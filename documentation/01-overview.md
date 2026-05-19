# Tổng quan dự án — Hệ thống phân tán bán đồ điện tử

## Bối cảnh

Nhu cầu mua sắm thiết bị điện tử (laptop, smartphone, camera) ngày càng tăng cao với nhiều thương hiệu, nhà cung cấp và mức giá khác nhau. Dự án xây dựng một nền tảng thương mại điện tử tập trung, cho phép khách hàng tìm kiếm, so sánh và đặt hàng thiết bị điện tử từ nhiều nhà cung cấp khác nhau.

## Mục tiêu

- Minh họa kiến trúc cơ sở dữ liệu phân tán hybrid SQL + NoSQL
- Áp dụng các kỹ thuật quan trọng: transaction, row-level locking, trigger, function, cursor
- Xây dựng hệ thống xử lý đồng thời (concurrent requests) an toàn qua message queue
- Thể hiện mô hình Master-Slave replication với read/write splitting

## Stack công nghệ

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend API | Node.js + TypeScript + Fastify | API Server chính |
| Background Worker | Node.js + TypeScript | Sync Worker tách biệt |
| SQL Database | PostgreSQL 16 | Master (HCM) + Slave (HN) |
| NoSQL Database | MongoDB 7 | Product specs |
| Message Queue | RabbitMQ 3.13 | Điều tiết lưu lượng |
| SQL ORM | Prisma | 2 client riêng cho master/slave |
| NoSQL ODM | Mongoose | Product document schema |
| Authentication | JWT (`@fastify/jwt`) | Access token + Refresh token |
| Email | Nodemailer | Gửi email thông báo sub-order cho vendor |
| Validation | Zod | Schema validation |
| Containerization | Docker + Docker Compose | Môi trường dev/prod tách riêng |

## Phạm vi hệ thống (scope)

### Người dùng

| Role | Quyền |
|---|---|
| Customer | Xem sản phẩm, đặt hàng, xem đơn hàng của mình |
| Admin | Toàn quyền: quản lý giá, tồn kho, xem báo cáo doanh thu |

> Lưu ý: Vendor không trực tiếp login vào hệ thống. Admin nhận thông tin cập nhật từ vendor và tự thay đổi giá/thông tin sản phẩm.

### 3 module chính

1. **Quản lý khách hàng** — CRUD, phân quyền, xác thực
2. **Quản lý sản phẩm** — Hybrid SQL (giá, tồn kho) + MongoDB (specs kỹ thuật)
3. **Quản lý đơn hàng** — Transaction, sub-order, rollback, message queue

