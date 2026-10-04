-- =============================================================================
-- CAFEMANAGER POS - KỊCH BẢN NÂNG CẤP CƠ SỞ DỮ LIỆU (DATABASE MIGRATION)
-- Hướng dẫn: Mở Neon Console -> Vào SQL Editor -> Dán toàn bộ mã này và bấm RUN
-- =============================================================================

-- 1. CẬP NHẬT BẢNG NHÂN VIÊN (StaffUsers)
-- Thêm cột Mã PIN 4 số và Mật khẩu, cho phép không bắt buộc Email
ALTER TABLE StaffUsers ADD COLUMN IF NOT EXISTS Pin VARCHAR(10) DEFAULT '1234';
ALTER TABLE StaffUsers ADD COLUMN IF NOT EXISTS Password VARCHAR(255) DEFAULT '1234';
ALTER TABLE StaffUsers ALTER COLUMN Email DROP NOT NULL;
ALTER TABLE StaffUsers DROP CONSTRAINT IF EXISTS UQ_StaffUsers_Store_Email;
ALTER TABLE StaffUsers DROP CONSTRAINT IF EXISTS staffusers_role_check;
ALTER TABLE StaffUsers DROP CONSTRAINT IF EXISTS StaffUsers_Role_check;

-- Mở rộng quyền vai trò bao gồm Waiter, Manager
ALTER TABLE StaffUsers ADD CONSTRAINT staffusers_role_check 
    CHECK (Role IN ('SuperAdmin', 'StoreOwner', 'StoreManager', 'Manager', 'Cashier', 'Waiter', 'Barista'));

-- Đồng bộ tài khoản, mật khẩu chuẩn và mã PIN cho các tài khoản sẵn có
UPDATE StaffUsers SET Pin = '9999', Password = 'SuperAdmin@2026!' WHERE Username = 'superadmin';
UPDATE StaffUsers SET Pin = '8888', Password = 'Manager@2026!', Role = 'StoreOwner' WHERE Username = 'manager' OR Username = 'aroma_owner';
UPDATE StaffUsers SET Pin = '1234', Password = 'Cashier@1234!', Role = 'Cashier' WHERE Username = 'cashier' OR Username = 'aroma_cashier';
UPDATE StaffUsers SET Pin = '2345', Password = 'Waiter@2345!', Role = 'Waiter' WHERE Username = 'waiter';
UPDATE StaffUsers SET Pin = '3456', Password = 'Barista@3456!', Role = 'Barista' WHERE Username = 'barista';

-- Bổ sung tài khoản Phục vụ (Waiter) và Pha chế (Barista) nếu chưa có trong DB
INSERT INTO StaffUsers (StoreID, Username, FullName, Role, Phone, Pin, Password, IsActive)
SELECT 1, 'waiter', 'Hoàng Nhân (Order)', 'Waiter', '0905555666', '2345', 'Waiter@2345!', TRUE
WHERE NOT EXISTS (SELECT 1 FROM StaffUsers WHERE Username = 'waiter');

INSERT INTO StaffUsers (StoreID, Username, FullName, Role, Phone, Pin, Password, IsActive)
SELECT 1, 'barista', 'Nguyễn Văn Barista', 'Barista', '0912333444', '3456', 'Barista@3456!', TRUE
WHERE NOT EXISTS (SELECT 1 FROM StaffUsers WHERE Username = 'barista');


-- 2. CẬP NHẬT BẢNG THỰC ĐƠN (MenuItems)
-- Mở rộng trường ảnh để lưu được Base64 và thêm cấu hình Topping
ALTER TABLE MenuItems ALTER COLUMN ImageUrl TYPE TEXT;
ALTER TABLE MenuItems ADD COLUMN IF NOT EXISTS AllowsTopping BOOLEAN DEFAULT FALSE;
ALTER TABLE MenuItems ADD COLUMN IF NOT EXISTS AvailableToppings TEXT DEFAULT '[]';

-- Bật sẵn topping cho nhóm Trà / Trà Sữa (Cà phê mặc định tắt topping)
UPDATE MenuItems 
SET AllowsTopping = TRUE, AvailableToppings = '["Trân châu đen", "Trân châu trắng", "Thạch đào giòn", "Kem Cheese Macchiato"]'
WHERE CategoryName LIKE '%Trà%' OR ItemName LIKE '%Trà%';


-- 3. TẠO BẢNG TOPPING QUÁN (Toppings) NẾU CHƯA CÓ
CREATE TABLE IF NOT EXISTS Toppings (
    ToppingID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    ToppingName VARCHAR(100) NOT NULL,
    Price NUMERIC(12, 2) NOT NULL DEFAULT 5000,
    IsAvailable BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_Toppings_Store_Name UNIQUE (StoreID, ToppingName)
);

-- Nạp sẵn topping mẫu cho Quán Aroma (StoreID = 1)
INSERT INTO Toppings (StoreID, ToppingName, Price, IsAvailable)
VALUES 
(1, 'Trân châu đen', 5000, TRUE),
(1, 'Trân châu trắng', 7000, TRUE),
(1, 'Thạch đào giòn', 8000, TRUE),
(1, 'Kem Cheese Macchiato', 10000, TRUE),
(1, 'Thạch sương sáo', 5000, TRUE)
ON CONFLICT (StoreID, ToppingName) DO NOTHING;


-- 4. BẢO MẬT & PHÂN QUYỀN TRUY VẤN
-- Tắt RLS để API Serverless truy vấn mượt mà theo StoreID
ALTER TABLE Tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE MenuItems DISABLE ROW LEVEL SECURITY;
ALTER TABLE Orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE OrderDetails DISABLE ROW LEVEL SECURITY;
ALTER TABLE Customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE StaffUsers DISABLE ROW LEVEL SECURITY;
ALTER TABLE Toppings DISABLE ROW LEVEL SECURITY;

SELECT '✓ NÂNG CẤP CƠ SỞ DỮ LIỆU THÀNH CÔNG!' AS KetQua;
