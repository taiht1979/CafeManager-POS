-- =============================================================================
-- TẠO QUÁN THẬT ĐẦU TIÊN (thay cho dữ liệu demo "Aroma Coffee Roastery")
-- Cách dùng: sửa các giá trị trong khối DECLARE bên dưới, rồi chạy trong Neon SQL Editor.
-- Chạy SAU schema.sql, migration_update_db.sql và migration_002_realtime_orders.sql.
-- =============================================================================

DO $$
DECLARE
    -- ====== SỬA CÁC GIÁ TRỊ NÀY ======
    v_store_name   TEXT := 'TÊN QUÁN CỦA BẠN';
    v_address      TEXT := 'Địa chỉ quán';
    v_phone        TEXT := '0900000000';
    v_wifi         TEXT := 'Mật khẩu wifi (để trống nếu không in)';
    v_bank_code    TEXT := 'MB';                    -- Mã ngân hàng theo VietQR: MB, VCB, TCB, ACB, VPB...
    v_bank_acc     TEXT := 'SỐ TÀI KHOẢN NHẬN TIỀN';
    v_bank_name    TEXT := 'TEN CHU TAI KHOAN KHONG DAU';
    v_owner_user   TEXT := 'chuquan';
    v_owner_pass   TEXT := 'ĐẶT-MẬT-KHẨU-DÀI-VÀ-KHÓ-ĐOÁN';
    v_owner_pin    TEXT := '4821';                  -- 4 chữ số, không dùng 1234, 8888, 0000
    v_owner_name   TEXT := 'Họ tên chủ quán';
    -- =================================
    v_store INT;
BEGIN
    IF v_owner_pass LIKE 'ĐẶT-%' OR v_store_name LIKE 'TÊN QUÁN%' OR v_bank_acc LIKE 'SỐ TÀI%' THEN
        RAISE EXCEPTION 'Hãy thay các giá trị mẫu trong khối DECLARE trước khi chạy!';
    END IF;
    IF v_owner_pin !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'PIN phải gồm đúng 4 chữ số';
    END IF;

    INSERT INTO Stores (StoreCode, StoreName, Subdomain, PlanID, ExpiryDate, SubscriptionStatus,
                        Phone, Address, Wifi, BankCode, BankAccountNumber, BankAccountName)
    VALUES ('STORE-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || floor(random() * 900 + 100)::int,
            v_store_name, 'q' || floor(random() * 900000 + 100000)::int,
            2, CURRENT_TIMESTAMP + INTERVAL '3 months', 'Active',
            v_phone, v_address, NULLIF(v_wifi, ''), v_bank_code, v_bank_acc, v_bank_name)
    RETURNING StoreID INTO v_store;

    INSERT INTO StaffUsers (StoreID, Username, Password, Pin, FullName, Role, Phone)
    VALUES (v_store, lower(v_owner_user), v_owner_pass, v_owner_pin, v_owner_name, 'StoreOwner', v_phone);

    RAISE NOTICE 'Đã tạo quán StoreID=% . Đăng nhập bằng tài khoản "%".', v_store, v_owner_user;
    RAISE NOTICE 'Bước tiếp theo: đăng nhập, vào Quản trị để tạo bàn, thực đơn, nhân viên.';
END $$;

-- =============================================================================
-- VÔ HIỆU HÓA TÀI KHOẢN DEMO (mật khẩu của chúng nằm công khai trong repo).
-- Chỉ chạy sau khi đã đăng nhập thử bằng tài khoản chủ quán mới ở trên.
-- Quán demo (StoreID 1, 2) có thể giữ lại để thử nghiệm riêng hoặc xóa.
-- =============================================================================
-- UPDATE StaffUsers SET IsActive = FALSE
--   WHERE Username IN ('manager', 'cashier', 'waiter', 'barista');
--
-- Tài khoản SuperAdmin: ĐỔI mật khẩu và PIN thay vì vô hiệu hóa:
-- UPDATE StaffUsers SET Password = 'MẬT-KHẨU-MỚI-RẤT-DÀI', Pin = '7391' WHERE Username = 'superadmin';
