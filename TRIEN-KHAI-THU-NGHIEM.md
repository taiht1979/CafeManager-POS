# 🚀 HƯỚNG DẪN TRIỂN KHAI & VẬN HÀNH THỰC TẾ
## Hệ Thống Quản Lý Bán Hàng CafeManager POS (Mô hình B2B Multi-Tenant SaaS)

---

## 📌 1. Tổng Quan Kiến Trúc Đã Hoàn Thiện

Hệ thống **CafeManager POS** đã được tối ưu hóa toàn diện theo đúng yêu cầu phân quyền vai trò vận hành thực tế tại quán cà phê:

```text
CafeManager POS/
│
├── 🚀 KHOI-DONG-TOAN-BO.bat           # File nhấp đúp khởi động toàn bộ hệ thống
├── 📱 mo-order-dien-thoai.bat        # File mở nhanh màn hình Order Điện Thoại (Waiter)
├── ☕ mo-pha-che-barista.bat          # File mở nhanh màn hình Quầy Barista (KDS)
├── 💻 mo-pos.bat                     # File mở nhanh màn hình POS Thu Ngân (Cashier)
├── 🏪 mo-store-admin.bat             # File mở nhanh Cổng Quản Trị Chủ Quán (Store Admin)
├── 👑 mo-super-admin.bat             # File mở nhanh Cổng Nền Tảng Super Admin (SaaS)
├── 📄 TRIEN-KHAI-THU-NGHIEM.md       # Cẩm nang hướng dẫn vận hành chi tiết
│
├── 📁 frontend/                       # Toàn bộ giao diện người dùng (Hoạt động offline độc lập 100%)
│   ├── 📄 index.html                 # Cổng chính & Bảng điều hướng 4 vai trò vận hành
│   ├── 📄 waiter-order.html          # [MỚI] Màn hình điện thoại cho nhân viên phục vụ gọi món tại bàn
│   ├── 📄 barista.html               # [MỚI] Màn hình KDS quầy pha chế (chuông báo, đếm giờ, báo xong)
│   ├── 📄 pos.html                   # Màn hình POS Thu Ngân (Hình món to rõ, thanh toán, khóa quyền hủy đơn)
│   ├── 📄 store-admin-dashboard.html # Màn hình Chủ Quán (Bàn thuần quản lý, Menu đổi ảnh, Nhân viên, Hóa đơn)
│   ├── 📄 super-admin-dashboard.html # Màn hình Chủ Nền Tảng SaaS (Quản lý Quán, Cấp gói Plans)
│   ├── 📁 css/style.css              # Giao diện Dark Cafe sang trọng, responsive
│   └── 📁 js/app.js                  # Đồng bộ Real-time đa tab qua BroadcastChannel
│
└── 📁 backend/                        # Máy chủ API & Nghiệp vụ bảo mật
    ├── 📁 middlewares/
    │   ├── 🛡️ tenant.middleware.js       # Giải mã JWT, cô lập StoreID tuyệt đối
    │   └── 💳 subscription.middleware.js # Chặn ExpiryDate & Kiểm tra cờ tính năng
    ├── ⚙️ server.js                      # API Server Node.js (Tích hợp middleware)
    ├── 🐍 main.py                        # API Server Python / FastAPI
    └── 📄 schema.sql                     # CSDL B2B SaaS (Plans, Stores, RLS, Trigger Quota)
```

---

## 🎯 2. Phân Quyền Vai Trò Rõ Ràng & Độc Lập

Mỗi vị trí công việc chỉ tập trung vào đúng màn hình chuyên biệt của mình:

| Vai Trò | Màn Hình Chuyên Biệt | Chức Năng Cốt Lõi Được Cấp Quyền | Những Giới Hạn Bị Khóa |
| :--- | :--- | :--- | :--- |
| **👑 Chủ Quán / Quản Lý** | [`frontend/store-admin-dashboard.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/store-admin-dashboard.html) | • **Sơ đồ bàn**: Thuần quản lý (Thêm/Sửa Tên, Khu vực, Chỗ ngồi, Trạng thái, Xóa bàn).<br>• **Thực đơn**: Sửa tên, giá bán, danh mục, đổi hình ảnh món (URL/Emoji/Presets).<br>• **Nhân sự**: Thêm/Sửa/Xóa nhân viên, phân quyền vai trò, cấp mã PIN.<br>• **Hóa đơn**: Tab riêng đối soát, Quản lý được phép sửa PTTT và Hủy hóa đơn (ghi sổ kiểm toán). | Không tham gia tính tiền lẻ hay pha chế |
| **💳 Thu Ngân (Cashier)** | [`frontend/pos.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/pos.html) | • Màn hình bán hàng cảm ứng máy tính/tablet ngang.<br>• **Hình ảnh món to rõ ràng** (kích thước lớn, dễ nhìn).<br>• Chuyển/gộp bàn, in tạm tính, in tem dán ly, in hóa đơn K80, thanh toán VietQR động / Tiền mặt.<br>• Quản lý thu - chi két và kết ca bàn giao. | **🔒 KHÔNG ĐƯỢC XÓA/SỬA HÓA ĐƠN ĐÃ XUẤT** (Bắt buộc phải có mã PIN Quản Lý `8888` xác thực mới được hủy). |
| **📱 Nhân Viên Order Tại Bàn** | [`frontend/waiter-order.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/waiter-order.html) | • Thiết kế chuẩn **Mobile-First** cho điện thoại.<br>• Đổi bàn nhanh (hiển thị trạng thái Bàn trống / Có khách).<br>• Thẻ món hình to, chạm để chọn Size, % Đường, % Đá, Toppings, Ghi chú.<br>• Nút **`🚀 BẮN BẾP`** gửi đơn 1-chạm đồng thời sang Quầy Barista và Quầy Thu Ngân POS. | Không có tính tiền, không có in hóa đơn, không được sửa giá hay cấu hình hệ thống. |
| **☕ Nhân Viên Pha Chế (Barista)** | [`frontend/barista.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/barista.html) | • Màn hình KDS 3 cột Kanban trực quan: **1. Chờ Pha Chế ➔ 2. Đang Pha Chế ➔ 3. Đã Xong - Chờ Bưng**.<br>• Chuông báo tự động "Ting Ting" khi có đơn mới từ điện thoại hoặc POS.<br>• Đồng hồ đếm thời gian thực cho từng vé (cảnh báo đỏ nếu quá 10 phút).<br>• Nút 1-chạm báo hoàn thành để gọi phục vụ bưng ra bàn. | Không hiển thị tiền, không có thanh toán, không quản lý bàn/menu. |

---

## 🧪 3. Hướng Dẫn Kịch Bản Thử Nghiệm Thực Tế

### Kịch Bản 1: Phục Vụ Dùng Điện Thoại Gọi Món Tại Bàn ➔ Bắn Sang Quầy Bar
1. Mở file [`mo-order-dien-thoai.bat`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/mo-order-dien-thoai.bat) (hoặc mở [`frontend/waiter-order.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/waiter-order.html) trên trình duyệt, có thể F12 thu nhỏ kích thước như màn hình điện thoại iPhone/Android).
2. Chạm vào nút **`📍 Bàn 01`** ➔ Chọn **Bàn 03 (Sân Vườn)**.
3. Chạm vào món **Cà Phê Muối Kem Béo**:
   - Chọn **Size L (+8k)**
   - Chọn **Đường 70%**
   - Chọn **Topping: Kem Cheese (+12k)**
   - Nhập ghi chú: *"Uống ít sữa"*
   - Bấm **`+ THÊM VÀO ĐƠN`**.
4. Chạm thêm món **Trà Đào Cam Sả** (hoặc bấm nút `+ Thêm` chuẩn).
5. Bấm nút **`🚀 BẮN BẾP`** ở góc dưới cùng:
   - Hệ thống phát âm thanh xác nhận và thông báo bắn đơn thành công.
   - Bàn 03 chuyển sang trạng thái "Có khách" và đơn hàng được lưu vào hệ thống.

---

### Kịch Bản 2: Màn Hình Barista Nhận Đơn & Pha Chế
1. Mở file [`mo-pha-che-barista.bat`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/mo-pha-che-barista.bat) (hoặc [`frontend/barista.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/barista.html)).
2. Màn hình ngay lập tức vang lên tiếng chuông **"Ting Ting"** và xuất hiện vé order mới của **Bàn 03 (Sân Vườn)** ở Cột **1. Chờ Pha Chế**.
3. Barista bấm **`▶️ BẮT ĐẦU PHA CHẾ`** ➔ Vé chuyển sang Cột **2. Đang Pha Chế**.
4. Khi pha xong, bấm **`✅ BÁO ĐÃ PHA XONG`** ➔ Vé chuyển sang Cột **3. Đã Xong - Chờ Bưng**, đồng thời gửi tín hiệu báo cho phục vụ hoặc thu ngân.

---

### Kịch Bản 3: Quầy Thu Ngân POS Bán Hàng & Cơ Chế Khóa Quyền Hủy Hóa Đơn
1. Mở file [`mo-pos.bat`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/mo-pos.bat) (hoặc [`frontend/pos.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/pos.html)).
2. Tại danh sách bàn, chọn **Bàn 03 (Sân Vườn)**: Đơn hàng do nhân viên phục vụ vừa bắn từ điện thoại sẽ tự động hiển thị đầy đủ trong giỏ hàng.
3. Hình ảnh món ăn hiển thị to rõ nét, chữ số đậm nét dễ nhìn.
4. Bấm **`⚡ THANH TOÁN`** ➔ Chọn VietQR Pro hoặc Tiền mặt ➔ Bấm hoàn tất để in hóa đơn K80.
5. **Thử nghiệm bảo mật phân quyền**:
   - Bấm nút **`📜 Đơn đã bán`** bên sidebar trái.
   - Bấm nút **`🔒 Hủy (Cần QL)`** tại hóa đơn vừa thanh toán.
   - Hệ thống hiển thị hộp thoại yêu cầu: Nhập mã PIN Quản Lý (Mặc định: `8888` hoặc PIN của Quản lý quán).
   - Nếu nhập sai hoặc nhân viên thu ngân không có quyền ➔ Hệ thống từ chối ngay lập tức: `⛔ TỪ CHỐI TRUY CẬP: Nhân viên thu ngân không được phép xóa/hủy hóa đơn!`
   - Nếu Quản lý nhập đúng PIN ➔ Nhập lý do hủy ➔ Hóa đơn chuyển sang trạng thái "ĐÃ HỦY" có ghi rõ tên Quản lý duyệt và thời gian hủy.

---

### Kịch Bản 4: Quản Lý Quán (Store Admin) Thuần Quản Trị
1. Mở file [`mo-store-admin.bat`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/mo-store-admin.bat) (hoặc [`frontend/store-admin-dashboard.html`](file:///c:/Users/PC/OneDrive/Nghiencuu/T%E1%BB%B1%20%C4%91%E1%BB%99ng%20h%C3%B3a/CafeManager%20POS/frontend/store-admin-dashboard.html)).
2. **Tab Sơ đồ bàn**:
   - Giao diện thuần quản lý, không hiển thị doanh thu hay nút vào POS.
   - Bấm **`+ Thêm Bàn Mới`** hoặc bấm **`✏️ Sửa`** để đổi tên bàn, số chỗ ngồi, khu vực.
   - Bấm **`🗑️ Xóa`** bàn không còn sử dụng.
3. **Tab Thực đơn món**:
   - Bấm **`✏️ Sửa Món`**: Cho phép đổi Tên món, Giá bán, Danh mục và **Thay đổi hình ảnh món** (Chọn sẵn Preset Cà phê, Trà, Freeze, Bánh hoặc dán link ảnh URL / Emoji tùy ý).
4. **Tab Nhân viên quán**:
   - Bấm **`+ Thêm Nhân Sự`** hoặc **`✏️ Sửa`**: Cập nhật Họ tên, SĐT, Phân quyền vai trò (`Manager`, `Cashier`, `Waiter`, `Barista`) và đổi mã PIN xác thực.
5. **Tab Quản lý hóa đơn**:
   - Nơi Quản lý đối soát toàn bộ hóa đơn đã xuất.
   - Quản lý có toàn quyền: Sửa phương thức thanh toán, hoặc Hủy hóa đơn kèm lý do ghi sổ kiểm toán.

---

## 💡 4. Thông Tin Tài Khoản & Mã PIN Mẫu Để Thử Nghiệm

| Vai Trò | Tên Nhân Viên | Màn Hình Sử Dụng | Mã PIN Xác Thực |
| :--- | :--- | :--- | :--- |
| **Quản Lý Ca (Manager)** | Lê Hữu Nghĩa | `store-admin-dashboard.html` | `8888` |
| **Thu Ngân (Cashier)** | Trần Thu Ngân | `pos.html` | `1234` |
| **Phục Vụ (Waiter)** | Hoàng Nhân (Order) | `waiter-order.html` | `2345` |
| **Pha Chế (Barista)** | Nguyễn Văn Barista | `barista.html` | `3456` |
