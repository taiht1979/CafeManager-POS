# 🌐 HƯỚNG DẪN TRIỂN KHAI CAFEMANAGER POS LÊN VERCEL + NEON POSTGRESQL

> **Mô hình kiến trúc Cloud Production:**
> - **Frontend & Serverless API:** Triển khai trên **Vercel** (Global Edge CDN, tốc độ cao, hỗ trợ HTTPS tự động miễn phí).
> - **Database:** Lưu trữ trên **Neon Serverless PostgreSQL** (Tự động co giãn tài nguyên, sao lưu tự động, tương thích 100% PostgreSQL).

---

## 📋 MỤC LỤC
1. [Kiến Trúc & Chuẩn Bị](#-1-kiến-trúc--chuẩn-bị)
2. [Bước 1: Khởi Tạo Database Trên Neon](#-bước-1-khởi-tạo-database-trên-neon-2-phút)
3. [Bước 2: Nạp Cấu Trúc Bảng & Dữ Liệu Khởi Tạo (Schema SQL)](#-bước-2-nạp-cấu-trúc-bảng--dữ-liệu-khởi-tạo-schema-sql)
4. [Bước 3: Triển Khai Hệ Thống Lên Vercel](#-bước-3-triển-khai-hệ-thống-lên-vercel)
   - [Cách A: Triển khai qua GitHub (Khuyên dùng - Tự động CI/CD)](#cách-a-triển-khai-qua-github-khuyên-dùng---tự-động-cicd)
   - [Cách B: Triển khai trực tiếp bằng Vercel CLI (Dòng lệnh 1 phút)](#cách-b-triển-khai-trực-tiếp-bằng-vercel-cli-dòng-lệnh)
5. [Bước 4: Kiểm Tra Hoạt Động & Trải Nghiệm Thực Tế](#-bước-4-kiểm-tra-hoạt-động--trải-nghiệm-thực-tế)
6. [Xử Lý Lỗi Thường Gặp (Troubleshooting)](#-xử-lý-lỗi-thường-gặp-troubleshooting)

---

## 🏗️ 1. Kiến Trúc & Chuẩn Bị

Dự án đã được cấu hình sẵn sàng:
- **`vercel.json`**: Định tuyến sẵn các phân hệ (`/pos`, `/waiter`, `/barista`, `/store-admin`, `/super-admin`) và chuyển tiếp các lệnh gọi `/api/*` về Serverless function.
- **`api/index.js`**: Backend API Serverless hỗ trợ lấy dữ liệu thật từ Neon DB (kèm chế độ Mock thông minh dự phòng nếu chưa có DB).
- **`api/db.js`**: Module kết nối Neon PostgreSQL với SSL mode `sslmode=require`.
- **`backend/schema.sql`**: Kịch bản CSDL B2B SaaS hoàn chỉnh (Plans, Stores, Tables, Menu, Staff, Orders, Customers).

---

## ⚡ Bước 1: Khởi Tạo Database Trên Neon (2 Phút)

1. Truy cập trang chủ Neon: [https://neon.tech](https://neon.tech).
2. Nhấn **`Sign Up`** hoặc **`Log In`** (Nên chọn đăng nhập bằng tài khoản **GitHub** hoặc **Google**).
3. Tại bảng điều khiển Neon Console, bấm **`Create Project`**:
   - **Project name:** `cafemanager-pos` (hoặc tên tùy thích).
   - **Postgres version:** `16` (hoặc mới nhất).
   - **Region:** Chọn **`Asia Pacific (Singapore - ap-southeast-1)`** để có tốc độ truy cập từ Việt Nam nhanh nhất (độ trễ cực thấp < 30ms).
4. Nhấn nút **`Create Project`**.
5. Sau khi tạo xong, Neon sẽ hiển thị màn hình **Connection Details**:
   - Chọn tab **`Pooled connection`** (hoặc `Direct connection`).
   - Copy toàn bộ chuỗi **Connection String**, có định dạng như sau:
   ```text
   postgresql://neondb_owner:AbCdEf123456@ep-sweet-pond-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   *(Hãy lưu lại chuỗi này để cấu hình ở Bước 3)*.

---

## 💾 Bước 2: Nạp Cấu Trúc Bảng & Dữ Liệu Khởi Tạo (Schema SQL)

1. Vẫn tại trang quản trị Neon của dự án vừa tạo, nhìn vào menu thanh bên trái, chọn tab **`SQL Editor`**.
2. Mở file mã nguồn:
   [`backend/schema.sql`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/backend/schema.sql)
3. Copy **toàn bộ nội dung** trong file `backend/schema.sql` (toàn bộ 395 dòng).
4. Dán toàn bộ vào ô soạn thảo **SQL Editor** trên Neon.
5. Nhấn nút **`Run`** (hoặc bấm tổ hợp phím `Ctrl + Enter`):
   - Neon sẽ khởi tạo toàn bộ các bảng: `Plans`, `Stores`, `StaffUsers`, `Tables`, `MenuItems`, `Orders`, `OrderDetails`, `Customers`.
   - Neon sẽ nạp sẵn dữ liệu hạt giống (Seeds): 3 gói dịch vụ, 2 quán mẫu (Aroma Roastery, Little Bean), danh sách bàn, món ăn mẫu và tài khoản quản trị.
6. **Kiểm tra kết quả:** Bấm sang tab **`Tables`** ở menu trái của Neon, bạn sẽ thấy 8 bảng đã được tạo thành công với đầy đủ dữ liệu.

---

## 🚀 Bước 3: Triển Khai Hệ Thống Lên Vercel

Bạn có thể chọn 1 trong 2 cách sau:

### Cách A: Triển khai qua GitHub (Khuyên dùng - Tự động CI/CD)

Đây là cách chuẩn mực nhất cho môi trường thực tế, mỗi khi bạn sửa code và đẩy lên GitHub, Vercel sẽ tự động cập nhật hệ thống ngay lập tức:

1. **Đưa mã nguồn lên GitHub:**
   - Mở terminal/PowerShell tại thư mục `CafeManager POS`.
   - Khởi tạo Git và đẩy lên repo cá nhân:
     ```bash
     git init
     git add .
     git commit -m "Init CafeManager POS for Vercel and Neon"
     git branch -M main
     git remote add origin https://github.com/<tai-khoan-github-cua-ban>/cafemanager-pos.git
     git push -u origin main
     ```
2. **Kết nối Vercel:**
   - Truy cập: [https://vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
   - Tại trang tổng quan, nhấn nút **`Add New...`** ➔ chọn **`Project`**.
   - Tìm kiếm repository `cafemanager-pos` và bấm nút **`Import`**.
3. **Cấu hình biến môi trường Database (Environment Variables):**
   - Tại màn hình cấu hình dự án trên Vercel, cuộn xuống phần **`Environment Variables`**:
     - **Key:** `DATABASE_URL`
     - **Value:** Dán chuỗi kết nối Neon bạn đã copy ở Bước 1:
       `postgresql://neondb_owner:...@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
     - Bấm **`Add`**.
4. **Bấm `Deploy`:**
   - Nhấn nút **`Deploy`** màu xanh.
   - Chờ Vercel hoàn tất quá trình đóng gói trong khoảng 30-45 giây.
   - Khi hoàn thành, màn hình xuất hiện pháo hoa chúc mừng kèm đường link trang web chính thức (Ví dụ: `https://cafemanager-pos.vercel.app`).

---

### Cách B: Triển khai trực tiếp bằng Vercel CLI (Dòng lệnh)

Nếu bạn không muốn tạo GitHub repository mà muốn deploy trực tiếp từ máy tính:

1. **Cài đặt Vercel CLI toàn cục (nếu chưa có):**
   ```powershell
   npm install -g vercel
   ```
2. **Đăng nhập vào Vercel qua dòng lệnh:**
   ```powershell
   vercel login
   ```
   *(Trình duyệt sẽ mở ra để bạn xác nhận đăng nhập 1-chạm)*.

3. **Cấu hình biến môi trường kết nối Neon:**
   Tại thư mục `CafeManager POS`, chạy lệnh:
   ```powershell
   vercel env add DATABASE_URL
   ```
   - Khi được hỏi giá trị (`value`), dán chuỗi kết nối Neon vào và bấm Enter.
   - Khi được hỏi môi trường, chọn tất cả: `Production`, `Preview`, `Development`.

4. **Triển khai Production:**
   Chạy lệnh:
   ```powershell
   vercel --prod
   ```
   - Nhấn `Enter` để đồng ý với các thiết lập mặc định.
   - Vercel CLI sẽ in ra đường dẫn trang web chính thức ngay trên terminal!

---

## 🎯 Bước 4: Kiểm Tra Hoạt Động & Trải Nghiệm Thực Tế

Sau khi deploy thành công, bạn có thể truy cập các đường dẫn sau trên tên miền Vercel của bạn (ví dụ: `https://cafemanager-pos.vercel.app`):

| Đường Dẫn (Route) | Phân Hệ Vận Hành | Mô Tả Chức Năng |
| :--- | :--- | :--- |
| **`/login`** | **Xác Thực & Đăng Nhập** | Form đăng nhập bàn phím số PIN 4 số hoặc tài khoản, tự động điều hướng đúng vai trò. |
| **`/`** | **Trang Chủ & Cổng Phân Quyền** | Trung tâm điều hướng đến 4 vai trò vận hành chuyên biệt. |
| **`/pos`** | **Quầy Thu Ngân (POS)** | Màn hình cảm ứng bán hàng, hình món to rõ, thanh toán VietQR động, in bill K80, **khóa quyền xóa hóa đơn**. |
| **`/waiter`** (hoặc `/order`) | **Order Điện Thoại Tại Bàn** | Màn hình smartphone cho phục vụ bàn, chọn bàn, tùy biến đường/đá/topping, nút **`🚀 BẮN BẾP`**. |
| **`/barista`** | **Màn Hình Quầy Pha Chế (KDS)** | 3 cột Kanban (Chờ pha ➔ Đang pha ➔ Đã xong), chuông báo âm thanh, đồng hồ bấm giờ cảnh báo trễ. |
| **`/store-admin`** | **Quản Trị Quán (Store Admin)** | Quản lý sơ đồ bàn (thuần quản lý), sửa menu và đổi hình ảnh món, phân quyền nhân sự, duyệt hủy hóa đơn. |
| **`/super-admin`** | **Quản Trị Nền Tảng (Super Admin)** | Dành cho chủ ứng dụng SaaS quản lý các quán đăng ký và tạo gói dịch vụ (Plans). |
| **`/api/health`** | **Kiểm Tra Kết Nối Neon DB** | Trả về JSON trạng thái: `{"status":"online", "neonDatabase":{"connected":true...}}`. |

### 🔑 Danh Sách Tài Khoản, Mật Khẩu Chuẩn & Mã PIN Hệ Thống:

| Vai Trò (Role) | Tên Đăng Nhập | Mật Khẩu Bảo Mật (Password) | Mã PIN 4 Số | Màn Hình Mặc Định |
| :--- | :--- | :--- | :---: | :--- |
| **👑 Super Admin SaaS (Root)** | `superadmin` | `SuperAdmin@2026!` | **`9999`** | `super-admin-dashboard.html` / `admin-dashboard.html` |
| **🏪 Quản Lý / Chủ Quán** | `manager` | `Manager@2026!` | **`8888`** | `store-admin-dashboard.html` |
| **💻 Thu Ngân POS Quầy** | `cashier` | `Cashier@1234!` | **`1234`** | `pos.html` |
| **📱 Phục Vụ / Order Bàn** | `waiter` | `Waiter@2345!` | **`2345`** | `waiter-order.html` |
| **☕ Quầy Pha Chế (Barista)** | `barista` | `Barista@3456!` | **`3456`** | `barista.html` |

---

## 🛠️ Xử Lý Lỗi Thường Gặp (Troubleshooting)

### 1. API báo lỗi "no pg_hba.conf entry for host ... no encryption"
- **Nguyên nhân:** Neon bắt buộc tất cả kết nối phải sử dụng mã hóa SSL.
- **Cách khắc phục:** Đảm bảo cuối chuỗi `DATABASE_URL` có tham số `?sslmode=require`. Trong file `api/db.js`, hệ thống đã được cài đặt sẵn cờ `ssl: { rejectUnauthorized: false }`.

### 2. Muốn chạy thử cục bộ (Localhost) với Database Neon
- Tạo file `.env` tại thư mục gốc của dự án:
  ```env
  DATABASE_URL="postgresql://neondb_owner:your_password@ep-xyz.aws.neon.tech/neondb?sslmode=require"
  PORT=3000
  ```
- Cài đặt thư viện: `npm install`
- Khởi động backend local: `npm start`
- Mở trình duyệt kiểm tra: `http://localhost:3000/api/health`

### 3. Tùy chỉnh Tên Miền Riêng (Custom Domain)
- Vào Vercel Dashboard ➔ Chọn Project `cafemanager-pos` ➔ Tab **`Settings`** ➔ Chọn **`Domains`**.
- Nhập tên miền riêng của bạn (VD: `pos.quanminh.vn` hoặc `poscafe.com`).
- Trỏ bản ghi CNAME theo hướng dẫn của Vercel (chỉ mất 1 phút để kích hoạt SSL tự động miễn phí).

---

> 🎉 **Chúc mừng bạn!** Hệ thống CafeManager POS hiện đã sẵn sàng 100% trên nền tảng đám mây Vercel và Neon PostgreSQL để đưa vào ứng dụng thực tiễn!
