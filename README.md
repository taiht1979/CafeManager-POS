# ☕ CafeManager POS

> **Hệ thống Quản lý Bán hàng & Vận hành Quán Cà phê Toàn diện (Smart Cafe Point of Sale & Order System)**

---

## 📖 1. Giới thiệu Tổng quan (Overview)

**CafeManager POS** là giải pháp phần mềm quản trị và bán hàng hiện đại được tối ưu hóa chuyên biệt cho mô hình quán cà phê, trà sữa và chuỗi F&B. Hệ thống kết nối liền mạch giữa **Khách hàng** (tự phục vụ qua QR Order), **Thu ngân** (POS bán hàng & tính tiền tốc độ cao), **Quầy Barista** (Màn hình điều phối chế biến KDS) và **Chủ quán / Quản lý** (CRM khách hàng & Báo cáo doanh thu thời gian thực).

> 🌐 **TRIỂN KHAI PRODUCTION LÊN CLOUD:**
> - Hệ thống đã cấu hình sẵn sàng 100% để triển khai trên **Frontend Vercel (Edge CDN & Serverless API)** + **Backend Neon Serverless PostgreSQL**.
> - Xem ngay hướng dẫn từng bước chi tiết tại: [**`HUONG-DAN-DEPLOY-VERCEL-NEON.md`**](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/HUONG-DAN-DEPLOY-VERCEL-NEON.md)

---

## 🏗️ 2. Cấu trúc Thư mục Dự án (Project Structure)

```text
CafeManager POS/
├── 📁 frontend/               # Giao diện người dùng Web App (HTML5 / Vanilla CSS / JavaScript)
│   ├── 📁 css/               # Thiết kế giao diện hiện đại, glassmorphism, responsive
│   ├── 📁 js/                # Logic xử lý tương tác UI, gọi API, WebSockets
│   ├── 📁 assets/            # Hình ảnh menu, icon bàn, âm thanh thông báo quầy bar
│   └── index.html            # Trang chính điều hướng các phân hệ
│
├── 📁 backend/                # Dịch vụ API & Nghiệp vụ hệ thống (API / Business Logic)
│   ├── 📁 routes/            # Định tuyến API (orders, tables, menu, customers, analytics)
│   ├── 📁 controllers/       # Xử lý logic nghiệp vụ chi tiết
│   ├── 📁 models/            # Lược đồ dữ liệu (Database Schema / In-Memory Mock)
│   ├── server.js             # Entrypoint khởi chạy máy chủ backend
│   └── package.json          # Quản lý dependencies & scripts khởi chạy
│
└── 📄 README.md              # Tài liệu mô tả dự án và hướng dẫn vận hành
```

---

## 🚀 3. Các Tính Năng Cốt Lõi (Core Features)

### 🎯 1. Phân Quyền Vai Trò Vận Hành Chuyên Biệt
Hệ thống thiết kế theo nguyên tắc: **Mỗi vai trò chỉ tập trung vào đúng 1 màn hình chuyên biệt**, tránh chồng chéo chức năng và đảm bảo an toàn dữ liệu:
- **👑 Quản Lý / Chủ Quán (`store-admin-dashboard.html`):** Sơ đồ bàn (thuần quản lý), Thực đơn món (sửa giá, đổi ảnh món trực quan), Nhân viên (phân quyền vai trò, cấp mã PIN), Quản lý hóa đơn (sửa PTTT và hủy hóa đơn đối soát).
- **💻 Thu Ngân POS (`pos.html`):** Màn hình bán hàng cảm ứng tablet/máy tính, **hình ảnh món to rõ**, thanh toán VietQR động/Tiền mặt, in bill K80, in tem ly. **🔒 Khóa chặt quyền: Nhân viên thu ngân KHÔNG được tự ý sửa/hủy hóa đơn** (cần xác thực mã PIN Quản Lý `8888`).
- **📱 Nhân Viên Phục Vụ Tại Bàn (`waiter-order.html`):** Giao diện Mobile-first tối ưu cho điện thoại, chạm chọn bàn, lướt món hình to, tùy biến đường/đá/topping/ghi chú và bắn đơn 1-chạm sang Barista & POS.
- **☕ Quầy Pha Chế Barista (`barista.html`):** Màn hình KDS 3 cột Kanban (Chờ pha -> Đang pha -> Đã xong), chuông báo tự động, đồng hồ đếm thời gian thực, nút báo xong trả khách.

### 🪑 2. Quản lý Sơ Đồ Bàn (Thuần Quản Trị)
- **Thuần quản lý:** Tập trung vào tổ chức không gian (Tầng 1, Tầng 2, Sân vườn, Phòng VIP), thêm bàn mới, chỉnh sửa sức chứa, tạm khóa bảo trì và xóa bàn không dùng.
- Không hiển thị tiền bạc hay nút vào POS tại trang quản lý để tách bạch rõ rệt giữa Quản trị và Bán hàng.

### 🍽️ 3. Thực Đơn Món & Đổi Hình Ảnh Món
- Thêm mới, chỉnh sửa món ăn, giá tiền, danh mục.
- **Thay đổi hình ảnh món linh hoạt:** Chọn sẵn thư viện Preset (Cà phê, Trà, Đá xay, Bánh...) hoặc dán URL hình ảnh từ internet, Emoji trực quan.
- Chế độ "Báo hết món" nhanh khi hết nguyên liệu.

### 📱 4. Order Điện Thoại Tại Bàn (Mobile Waiter Order)
- Dành riêng cho nhân viên đi bàn ghi món cho khách bằng smartphone.
- Giao diện ngón tay cái dễ bấm, hình ảnh món to rõ ràng.
- Tùy biến % đường (0%, 50%, 70%, 100%), % đá (Nóng, Ít đá, 50%, 100%), Topping gọi thêm.
- Nút **`🚀 BẮN BẾP`** gửi đơn ngay tức thì tới Quầy Barista và Quầy Thu Ngân.

### 💻 5. POS Thu Ngân (Cashier Point of Sale)
- Giao diện bán hàng cảm ứng chuyên nghiệp, hình ảnh món to rõ.
- Thanh toán đa kênh: VietQR Pro sinh mã động Napas chuẩn xác, Tiền mặt gợi ý tiền thừa, Thẻ POS.
- In hóa đơn nhiệt K80 và in tem dán ly 50x30mm chuẩn F&B.
- **Bảo mật hóa đơn:** Thu ngân không thể tự tiện xóa đơn; mọi thao tác hủy đều yêu cầu PIN Quản lý phê duyệt.

### 🍹 4. Màn hình Barista (KDS - Kitchen/Bar Display System)
- **Điều phối chế biến thời gian thực:** Đơn gọi món xuất hiện ngay lập tức trên màn hình quầy bar theo thứ tự thời gian vào đơn.
- **Phân loại trạng thái pha chế:**
  - ⏳ *Chờ tiếp nhận (Pending)*
  - 👨‍🍳 *Đang pha chế (In Progress)*
  - ✅ *Đã hoàn tất / Sẵn sàng phục vụ (Ready)*
- **Cảnh báo trễ đơn:** Đổi màu cảnh báo (Xanh -> Vàng -> Đỏ) và phát âm thanh thông báo khi thời gian chờ vượt ngưỡng thiết lập (ví dụ >10 phút).
- **Bộ lọc thông minh:** Gom nhóm theo món để nhân viên pha chế thực hiện hàng loạt (ví dụ: pha cùng lúc 4 ly Trà sen vàng).

### 👥 5. CRM Khách Quen & Thân Thiết (Customer Relationship Management)
- **Hồ sơ khách hàng:** Nhận diện khách qua Số điện thoại, lưu lại họ tên, ngày sinh, tổng chi tiêu và sở thích gọi món.
- **Chính sách tích điểm & Hạng thẻ thành viên:**
  - Phân hạng bậc thành viên: *Đồng -> Bạc -> Vàng -> Kim Cương*.
  - Tự động tích lũy điểm thưởng và quy đổi thành tiền trừ trực tiếp trên hóa đơn.
- **Chăm sóc tự động:** Tặng mã ưu đãi giảm giá nhân dịp sinh nhật, tin nhắn ưu đãi vào các dịp lễ hoặc tri ân khách hàng quay lại.

### 📊 6. Báo cáo Doanh thu & Phân tích (Analytics & Reports)
- **Doanh thu trực quan (Real-time Dashboard):** Cập nhật doanh thu tổng, số lượng đơn hàng, giá trị trung bình/đơn theo từng giờ, ngày, tuần, tháng.
- **Phân tích món bán chạy (Top Best-Sellers):** Đánh giá các món đem lại doanh thu cao nhất, phân tích món tồn kho nguyên liệu.
- **Phân tích khung giờ cao điểm (Peak Hours):** Giúp chủ quán chủ động sắp xếp ca làm việc cho nhân viên và chuẩn bị nguyên vật liệu.
- **Quản lý ca thu ngân:** Kiểm kê chênh lệch tiền mặt đầu ca - kết ca, báo cáo phương thức thanh toán chi tiết.
- **Xuất dữ liệu:** Hỗ trợ xuất file báo cáo định dạng Excel / PDF phục vụ kế toán.

---

## 🛠️ 4. Công nghệ Định hướng (Tech Stack)

- **Frontend:** HTML5, Modern Vanilla CSS (CSS Grid/Flexbox, Glassmorphism UI, Dark/Light mode), JavaScript (ES6+ Modules, Fetch API, WebSocket client).
- **Backend:** Node.js (Express framework) hoặc Python (FastAPI), RESTful API, WebSocket (Socket.io) phục vụ đồng bộ dữ liệu thời gian thực.
- **Database:** SQLite / PostgreSQL / MongoDB phù hợp cho mở rộng chuỗi cửa hàng.

---

## ⚡ 5. Hướng dẫn Khởi chạy Nhanh (Getting Started)

1. **Khởi động Giao diện Frontend:**
   - Mở file `frontend/index.html` trực tiếp trên trình duyệt hoặc sử dụng Live Server (`http://localhost:5500`).
2. **Khởi động Dịch vụ Backend:**
   - Di chuyển vào thư mục `/backend`:
     ```bash
     cd backend
     npm install
     npm run dev
     ```
   - API Server sẽ lắng nghe tại `http://localhost:3000`.

---
*Dự án CafeManager POS - Phát triển hướng tới trải nghiệm vận hành quán F&B tối ưu, ổn định và chuyên nghiệp.*
