# Chạy thử quán đầu tiên

Tài liệu này mô tả cách cài đặt, kiểm tra trước khi ra quán, và những hạn chế còn lại của bản chạy thử.

## 1. Cách dữ liệu hoạt động (từ bản này)

- Toàn bộ đơn hàng, vé pha chế, hóa đơn, thực đơn, bàn, nhân viên được lưu trên Neon PostgreSQL. Trình duyệt chỉ giữ bộ nhớ đệm.
- Các thiết bị đồng bộ bằng cách hỏi server mỗi 3 giây (không dùng WebSocket). Độ trễ thấy được khoảng 1–3 giây.
- Mất kết nối: màn hình hiện thanh đỏ "MẤT KẾT NỐI MÁY CHỦ". POS không cho thanh toán khi mất mạng. Hệ thống **không còn dữ liệu giả dự phòng**.
- Mọi API (trừ đăng nhập và `/api/health`) cần token đăng nhập có chữ ký. Quán nào chỉ thấy dữ liệu của quán đó.
- Tiền hóa đơn do server tính lại từ giỏ hàng. Mã hóa đơn dạng `HD-YYMMDD-0001`, tăng dần theo quán và theo ngày (giờ Việt Nam).

## 2. Cài đặt (làm một lần)

1. Neon: chạy lần lượt `backend/schema.sql`, `backend/migration_update_db.sql`, `backend/migration_002_realtime_orders.sql`.
2. Sửa và chạy `backend/seed_new_store.sql` để tạo quán thật và tài khoản chủ quán. Đăng nhập thử.
3. Chạy các câu lệnh (đang để dạng chú thích) cuối file đó: vô hiệu hóa tài khoản demo, đổi mật khẩu `superadmin`.
4. Vercel: đặt biến môi trường `DATABASE_URL` và `JWT_SECRET` (`openssl rand -hex 32`), rồi deploy.
5. Mở `/api/health`: phải thấy `"connected": true` và `"jwtConfigured": true`.
6. Đăng nhập bằng chủ quán, vào **Quản trị**: nhập Cài đặt quán, tài khoản ngân hàng nhận VietQR, bàn, thực đơn, topping, nhân viên (mỗi nhân viên một mã PIN khác nhau).
   Chưa nhập tài khoản ngân hàng thì POS không hiện mã QR (cố ý, tránh thu nhầm).

## 3. Kiểm tra trước ngày chạy thử

Kịch bản đủ 4 thiết bị, làm trên đúng thiết bị sẽ dùng tại quán:

| Bước | Thiết bị | Việc làm | Kết quả đúng |
|---|---|---|---|
| 1 | Điện thoại phục vụ | Chọn bàn, thêm 2 món | POS thấy đơn nháp sau tối đa 3 giây |
| 2 | Điện thoại phục vụ | Bấm Bắn bếp | Barista có chuông và vé mới |
| 3 | Điện thoại phục vụ | Bấm Bắn bếp lần nữa | Báo "đã gửi rồi", không có vé trùng |
| 4 | Điện thoại phục vụ | Thêm 1 món, bắn bếp | Vé mới chỉ có món vừa thêm |
| 5 | Barista | Bắt đầu pha, báo xong, bưng ra bàn | Trạng thái đúng ở các lần tải lại |
| 6 | POS | Chọn bàn, thanh toán tiền mặt | Hóa đơn K80 in đúng tên quán, số tiền |
| 7 | POS | Thanh toán VietQR, chuyển khoản thật số nhỏ | Tiền về đúng tài khoản, nội dung chuyển khoản đúng |
| 8 | POS | Rút dây mạng/tắt wifi 1 phút | Thanh đỏ hiện; không thanh toán được; có mạng lại thì tự khỏi |
| 9 | Quản lý | Tab Hóa đơn | Số hóa đơn và doanh thu khớp POS |
| 10 | POS (thu ngân) | Hủy hóa đơn | Bắt buộc PIN quản lý; hóa đơn ghi tên người duyệt |

Kiểm thử tự động (cần Postgres local, KHÔNG chạy trên database thật):

```bash
DATABASE_URL=postgresql://user@localhost:5432/cafe_test JWT_SECRET=test npm test
DATABASE_URL=postgresql://user@localhost:5432/cafe_test JWT_SECRET=test node tests/e2e-multidevice.js
```

## 4. Hạn chế đã biết của bản chạy thử

**Hành vi cần nhân viên biết**
- Hai người cùng sửa một bàn cùng lúc: người lưu sau nhận thông báo "bàn vừa được thay đổi ở thiết bị khác" và đơn được tải lại. Thay đổi của họ cho bàn đó bị mất, cần nhập lại.
- Món thêm từ POS (nút thêm món nhanh) không tự lên vé pha chế. Chỉ nút Bắn bếp của màn hình phục vụ mới tạo vé.
- Chưa có kết ca thật: "Kết ca" và phiếu thu/chi chỉ lưu trong trình duyệt của máy POS, không lên server.
- VAT 8% mặc định bật trên POS. Hãy xác nhận quán có phải xuất VAT không, nếu không thì tắt cho từng hóa đơn.
- Không có chế độ offline: mất mạng thì phải ghi tạm ra giấy.

**Bảo mật còn thiếu (chưa làm trong bản này)**
- Mật khẩu và PIN vẫn lưu dạng chữ thường trong database (chưa băm). Nên băm bằng bcrypt.
- Đăng nhập PIN chưa gắn mã quán và chưa giới hạn số lần thử; PIN 4 số dò được. Chỉ chấp nhận được khi chạy thử một quán.
- Giá và giảm giá thành viên do trình duyệt gửi lên; server chỉ kiểm tra hợp lệ (không âm, số lượng nguyên), chưa đối chiếu với thực đơn. CRM khách quen chưa có nên giảm giá thành viên đang tắt.
- Trang `index.html` (Store Hub) còn số liệu mẫu cứng, không dùng cho vận hành. `/` đã chuyển về trang đăng nhập.
- Thư mục `backend/` (server.js, main.py) là bản cũ không dùng khi deploy Vercel.
