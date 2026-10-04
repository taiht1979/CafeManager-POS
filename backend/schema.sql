-- =============================================================================
-- HỆ THỐNG CAFEMANAGER POS - B2B MULTI-TENANT SAAS DATABASE SCHEMA
-- Hệ quản trị CSDL mục tiêu: PostgreSQL 14+ (Hoàn toàn tương thích MySQL 8.0+)
-- Mô hình kiến trúc: Single Database / Shared Schema with Discriminator (StoreID)
-- Cơ chế bảo mật dữ liệu: Composite Unique Constraints & PostgreSQL Row-Level Security (RLS)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. BẢNG GÓI DỊCH VỤ SAAS (Plans)
-- Quản lý bảng giá, hạn mức tài nguyên (Quotas) và các cờ tính năng (Feature Flags)
-- =============================================================================
CREATE TABLE IF NOT EXISTS Plans (
    PlanID SERIAL PRIMARY KEY,
    PlanCode VARCHAR(30) UNIQUE NOT NULL,         -- 'STARTER', 'PRO', 'ENTERPRISE'
    PlanName VARCHAR(100) NOT NULL,                -- 'Gói Khởi Nghiệp', 'Gói Tiêu Chuẩn', 'Gói Chuỗi Doanh Nghiệp'
    MonthlyPrice NUMERIC(12, 2) NOT NULL,         -- Giá thuê bao hàng tháng (VNĐ)
    AnnualPrice NUMERIC(12, 2) NOT NULL,          -- Giá thuê bao trọn gói 1 năm (VNĐ)
    
    -- HẠN MỨC TÀI NGUYÊN (QUOTAS)
    MaxTables INT NOT NULL,                       -- Số bàn tối đa cho phép tạo (VD: 10, 30, 999)
    MaxStaff INT NOT NULL DEFAULT 5,              -- Số lượng tài khoản nhân viên tối đa
    
    -- CỜ TÍNH NĂNG (FEATURE FLAGS - Bật/Tắt module theo gói trả tiền)
    Feature_CRM BOOLEAN NOT NULL DEFAULT FALSE,   -- Phân hệ Khách hàng thân thiết, tích điểm, hạng thẻ
    Feature_Inventory BOOLEAN NOT NULL DEFAULT FALSE, -- Phân hệ Quản lý định lượng nguyên vật liệu & tồn kho
    Feature_QR_Order BOOLEAN NOT NULL DEFAULT TRUE,  -- Gọi món tự phục vụ qua mã QR tại bàn
    Feature_KDS BOOLEAN NOT NULL DEFAULT TRUE,       -- Màn hình điều phối chế biến Barista
    Feature_MultiBranch BOOLEAN NOT NULL DEFAULT FALSE, -- Quản lý đa chi nhánh trong cùng 1 tập đoàn
    
    Description TEXT,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 2. BẢNG CỬA HÀNG / CHI NHÁNH (Stores - Tenant Entity)
-- Mỗi khách hàng doanh nghiệp (Chủ quán) đăng ký sẽ là 1 bản ghi Store độc lập
-- =============================================================================
CREATE TABLE IF NOT EXISTS Stores (
    StoreID SERIAL PRIMARY KEY,
    StoreCode VARCHAR(50) UNIQUE NOT NULL,        -- Định danh nội bộ duy nhất (VD: 'STORE-HCM-01')
    StoreName VARCHAR(150) NOT NULL,              -- Tên thương hiệu (VD: 'Aroma Coffee Roastery')
    Subdomain VARCHAR(50) UNIQUE NOT NULL,        -- Tên miền định danh QR (VD: 'aroma-roastery')
    
    -- LIÊN KẾT GÓI SAAS & NGÀY HẾT HẠN THUÊ BAO
    PlanID INT NOT NULL REFERENCES Plans(PlanID) ON DELETE RESTRICT,
    ExpiryDate TIMESTAMP WITH TIME ZONE NOT NULL, -- Ngày hết hạn gói dịch vụ SaaS
    
    SubscriptionStatus VARCHAR(20) DEFAULT 'Active' CHECK (
        SubscriptionStatus IN ('Active', 'Trial', 'Suspended', 'Expired')
    ),
    
    -- THÔNG TIN LIÊN HỆ & CẤU HÌNH QUÁN
    Phone VARCHAR(20) NOT NULL,
    Email VARCHAR(100),
    Address TEXT,
    
    -- CẤU HÌNH THỤ HƯỞNG THANH TOÁN VIETQR RIÊNG CỦA TỪNG QUÁN
    BankCode VARCHAR(20) DEFAULT 'MB',            -- Ngân hàng thụ hưởng (MB, VCB, TCB, VPB...)
    BankAccountNumber VARCHAR(50),               -- Số tài khoản nhận tiền thanh toán POS
    BankAccountName VARCHAR(100),                -- Tên chủ tài khoản
    
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_Stores_Status ON Stores(SubscriptionStatus);
CREATE INDEX idx_Stores_Expiry ON Stores(ExpiryDate);
CREATE INDEX idx_Stores_Plan ON Stores(PlanID);

-- =============================================================================
-- 3. BẢNG NHÂN SỰ & TÀI KHOẢN NGƯỜI DÙNG (StaffUsers)
-- Bắt buộc gắn StoreID. Riêng SuperAdmin hệ thống có StoreID = NULL
-- =============================================================================
CREATE TABLE IF NOT EXISTS StaffUsers (
    UserID SERIAL PRIMARY KEY,
    
    -- StoreID khóa ngoại bắt buộc phân quyền
    StoreID INT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    
    Username VARCHAR(50) NOT NULL,
    Email VARCHAR(100) NULL,
    Password VARCHAR(255) DEFAULT '1234',
    PasswordHash VARCHAR(255) NULL,
    FullName VARCHAR(100) NOT NULL,
    Phone VARCHAR(20),
    Pin VARCHAR(10) DEFAULT '1234',
    
    Role VARCHAR(30) NOT NULL CHECK (
        Role IN ('SuperAdmin', 'StoreOwner', 'StoreManager', 'Manager', 'Cashier', 'Waiter', 'Barista')
    ),
    IsActive BOOLEAN DEFAULT TRUE,
    LastLoginAt TIMESTAMP WITH TIME ZONE,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- RÀNG BUỘC CÔ LẬP: Username là duy nhất trong phạm vi từng quán
    CONSTRAINT UQ_StaffUsers_Store_Username UNIQUE (StoreID, Username)
);

CREATE INDEX idx_StaffUsers_Store_Role ON StaffUsers(StoreID, Role);

-- =============================================================================
-- 4. BẢNG BÀN (Tables) - Gắn StoreID & Kiểm soát hạn mức MaxTables
-- =============================================================================
CREATE TABLE IF NOT EXISTS Tables (
    TableID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    TableName VARCHAR(50) NOT NULL,               -- 'Bàn 01', 'Bàn 02', 'Bàn VIP 01'
    AreaName VARCHAR(50) DEFAULT 'Tầng 1',        -- 'Tầng 1', 'Sân Vườn', 'Phòng Lạnh'
    Capacity INT DEFAULT 4,
    
    Status VARCHAR(20) DEFAULT 'Available' CHECK (
        Status IN ('Available', 'Occupied', 'Billing', 'Reserved', 'Merged', 'Maintenance')
    ),
    
    -- NGHIỆP VỤ GỘP BÀN / TÁCH BÀN TRONG CÙNG 1 STORE
    MergedIntoTableID INT NULL REFERENCES Tables(TableID) ON DELETE SET NULL,
    MergeGroupCode VARCHAR(50) NULL,
    IsVirtualSplit BOOLEAN DEFAULT FALSE,
    ParentSplitTableID INT NULL REFERENCES Tables(TableID) ON DELETE CASCADE,
    
    QRToken VARCHAR(100) UNIQUE NOT NULL,         -- Token độc nhất cho phép khách quét QR
    
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- RÀNG BUỘC: Mỗi quán có bộ tên bàn riêng biệt không trùng nhau
    CONSTRAINT UQ_Tables_Store_TableName UNIQUE (StoreID, TableName)
);

CREATE INDEX idx_Tables_Store_Status ON Tables(StoreID, Status);
CREATE INDEX idx_Tables_Store_Area ON Tables(StoreID, AreaName);
CREATE INDEX idx_Tables_Merge ON Tables(MergedIntoTableID);

-- =============================================================================
-- 5. BẢNG THỰC ĐƠN (MenuItems) - Gắn StoreID
-- =============================================================================
CREATE TABLE IF NOT EXISTS MenuItems (
    ItemID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    CategoryName VARCHAR(100) NOT NULL,           -- 'Cà Phê', 'Trà & Macchiato', 'Bánh'
    ItemName VARCHAR(150) NOT NULL,               -- 'Cà Phê Muối Đặc Biệt'
    SKU VARCHAR(50) NOT NULL,                     -- Mã món nội bộ (có thể trùng giữa các Store khác nhau)
    BasePrice NUMERIC(12, 2) NOT NULL CHECK (BasePrice >= 0),
    CostPrice NUMERIC(12, 2) DEFAULT 0,           -- Giá vốn phục vụ tính lợi nhuận
    ImageUrl TEXT,                                -- URL ảnh hoặc Base64 nén (<35KB)
    Description TEXT,
    
    AllowsSizeChange BOOLEAN DEFAULT TRUE,
    AllowsSugarIce BOOLEAN DEFAULT TRUE,
    AllowsTopping BOOLEAN DEFAULT FALSE,          -- Cho phép hiển thị chọn topping
    AvailableToppings TEXT DEFAULT '[]',          -- Danh sách topping áp dụng cho món (JSON mảng)
    IsAvailable BOOLEAN DEFAULT TRUE,
    
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- RÀNG BUỘC: Mã món SKU chỉ duy nhất trong nội bộ từng quán
    CONSTRAINT UQ_MenuItems_Store_SKU UNIQUE (StoreID, SKU)
);

CREATE INDEX idx_MenuItems_Store_Cat ON MenuItems(StoreID, CategoryName, IsAvailable);

-- =============================================================================
-- 5.1. BẢNG TOPPING QUÁN (Toppings) - Gắn StoreID
-- =============================================================================
CREATE TABLE IF NOT EXISTS Toppings (
    ToppingID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    ToppingName VARCHAR(100) NOT NULL,
    Price NUMERIC(12, 2) NOT NULL DEFAULT 5000,
    IsAvailable BOOLEAN DEFAULT TRUE,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_Toppings_Store_Name UNIQUE (StoreID, ToppingName)
);

-- =============================================================================
-- 6. BẢNG KHÁCH HÀNG CRM (Customers) - Gắn StoreID
-- Bảo mật tuyệt đối: Khách quen của Quán A không thể bị xem bởi Quán B
-- =============================================================================
CREATE TABLE IF NOT EXISTS Customers (
    CustomerID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    FullName VARCHAR(100) NOT NULL,
    Phone VARCHAR(20) NOT NULL,                   -- Số điện thoại khách hàng tại quán
    Email VARCHAR(100),
    Birthday DATE,
    
    MembershipTier VARCHAR(20) DEFAULT 'Standard' CHECK (
        MembershipTier IN ('Standard', 'Silver', 'Gold', 'Diamond')
    ),
    LoyaltyPoints INT DEFAULT 0 CHECK (LoyaltyPoints >= 0),
    TotalSpent NUMERIC(14, 2) DEFAULT 0,
    
    LastVisitAt TIMESTAMP WITH TIME ZONE,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- RÀNG BUỘC: Số điện thoại khách hàng là duy nhất trong phạm vi từng quán
    CONSTRAINT UQ_Customers_Store_Phone UNIQUE (StoreID, Phone)
);

CREATE INDEX idx_Customers_Store_Phone ON Customers(StoreID, Phone);

-- =============================================================================
-- 7. BẢNG ĐƠN HÀNG (Orders) - Gắn StoreID
-- =============================================================================
CREATE TABLE IF NOT EXISTS Orders (
    OrderID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    OrderCode VARCHAR(50) NOT NULL,               -- 'ORD-20260926-0001'
    TableID INT NULL REFERENCES Tables(TableID) ON DELETE SET NULL,
    CustomerID INT NULL REFERENCES Customers(CustomerID) ON DELETE SET NULL,
    CashierUserID INT NULL REFERENCES StaffUsers(UserID) ON DELETE SET NULL,
    
    OrderType VARCHAR(20) DEFAULT 'DineIn' CHECK (
        OrderType IN ('DineIn', 'TakeAway', 'QROrder')
    ),
    OrderStatus VARCHAR(20) DEFAULT 'Pending' CHECK (
        OrderStatus IN ('Pending', 'Processing', 'Ready', 'Completed', 'Cancelled')
    ),
    PaymentStatus VARCHAR(20) DEFAULT 'Unpaid' CHECK (
        PaymentStatus IN ('Unpaid', 'Paid', 'Refunded')
    ),
    PaymentMethod VARCHAR(20) CHECK (
        PaymentMethod IN ('Cash', 'VietQR', 'Card', 'Momo', 'ZaloPay', 'LoyaltyPoints')
    ),
    
    -- TÍNH TOÁN TÀI CHÍNH HÓA ĐƠN
    Subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    DiscountAmount NUMERIC(12, 2) DEFAULT 0,
    TaxAmount NUMERIC(12, 2) DEFAULT 0,
    TotalAmount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    PointsEarned INT DEFAULT 0,
    
    -- TÁCH HÓA ĐƠN TRONG CÙNG 1 QUÁN
    ParentOrderID INT NULL REFERENCES Orders(OrderID) ON DELETE SET NULL,
    IsSplitBill BOOLEAN DEFAULT FALSE,
    
    CashierNote TEXT,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ClosedAt TIMESTAMP WITH TIME ZONE,
    
    -- RÀNG BUỘC: Mã hóa đơn là duy nhất trong từng quán
    CONSTRAINT UQ_Orders_Store_Code UNIQUE (StoreID, OrderCode)
);

CREATE INDEX idx_Orders_Store_Status ON Orders(StoreID, OrderStatus);
CREATE INDEX idx_Orders_Store_Created ON Orders(StoreID, CreatedAt);
CREATE INDEX idx_Orders_Store_Customer ON Orders(StoreID, CustomerID);

-- =============================================================================
-- 8. BẢNG CHI TIẾT ĐƠN HÀNG (OrderDetails) - Gắn StoreID Trực Tiếp
-- =============================================================================
CREATE TABLE IF NOT EXISTS OrderDetails (
    OrderDetailID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    OrderID INT NOT NULL REFERENCES Orders(OrderID) ON DELETE CASCADE,
    ItemID INT NOT NULL REFERENCES MenuItems(ItemID) ON DELETE RESTRICT,
    
    ItemNameSnapshot VARCHAR(150) NOT NULL,       -- Bảo lưu tên món tại thời điểm bán
    UnitPrice NUMERIC(12, 2) NOT NULL CHECK (UnitPrice >= 0),
    Quantity INT NOT NULL CHECK (Quantity > 0),
    
    -- TÙY CHỌN PHA CHẾ
    Size VARCHAR(10) DEFAULT 'M' CHECK (Size IN ('S', 'M', 'L')),
    SugarLevel VARCHAR(20) DEFAULT '100%',
    IceLevel VARCHAR(20) DEFAULT '100%',
    ToppingsJSON JSONB DEFAULT '[]'::jsonb,
    ToppingTotalPrice NUMERIC(12, 2) DEFAULT 0,
    TotalLineAmount NUMERIC(12, 2) NOT NULL,
    
    -- TRẠNG THÁI PHA CHẾ MÀN HÌNH BARISTA (KDS)
    BaristaStatus VARCHAR(20) DEFAULT 'Pending' CHECK (
        BaristaStatus IN ('Pending', 'Brewing', 'Ready', 'Served', 'Cancelled')
    ),
    CustomerNote TEXT,
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_OrderDetails_Store_Barista ON OrderDetails(StoreID, BaristaStatus);
CREATE INDEX idx_OrderDetails_Order ON OrderDetails(OrderID);

-- =============================================================================
-- 9. RÀNG BUỘC KIỂM TRA HẠN MỨC GÓI SAAS (Trigger Quota Enforcement)
-- Tự động ngăn chặn tạo số lượng Bàn vượt quá MaxTables quy định trong gói Plans
-- =============================================================================
CREATE OR REPLACE FUNCTION check_store_max_tables_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_max_tables INT;
    v_current_tables_count INT;
BEGIN
    -- Lấy hạn mức MaxTables từ gói Plans mà Store đang đăng ký
    SELECT p.MaxTables INTO v_max_tables
    FROM Stores s
    JOIN Plans p ON s.PlanID = p.PlanID
    WHERE s.StoreID = NEW.StoreID;

    -- Đếm số bàn hiện tại của Store (không tính các bàn đã xóa)
    SELECT COUNT(*) INTO v_current_tables_count
    FROM Tables
    WHERE StoreID = NEW.StoreID;

    -- Kiểm tra vượt ngưỡng
    IF v_current_tables_count >= v_max_tables THEN
        RAISE EXCEPTION 'Vượt quá hạn mức số bàn cho phép (%) của gói dịch vụ! Vui lòng nâng cấp gói SaaS.', v_max_tables;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_max_tables ON Tables;
CREATE TRIGGER trg_check_max_tables
BEFORE INSERT ON Tables
FOR EACH ROW
EXECUTE FUNCTION check_store_max_tables_quota();

-- =============================================================================
-- 10. BẢO MẬT DỮ LIỆU CẤP ĐỘ HÀNG (PostgreSQL Row-Level Security - RLS)
-- Đảm bảo ở tầng CSDL: Một quán không thể SELECT/UPDATE/DELETE dữ liệu quán khác
-- =============================================================================

-- Kích hoạt RLS trên tất cả các bảng lõi
ALTER TABLE Tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE MenuItems ENABLE ROW LEVEL SECURITY;
ALTER TABLE Orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE OrderDetails ENABLE ROW LEVEL SECURITY;
ALTER TABLE Customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE StaffUsers ENABLE ROW LEVEL SECURITY;

-- Tạo chính sách phân lập dữ liệu (Chỉ áp dụng các dòng có StoreID = phiên làm việc)
-- Ứng dụng Backend khi kết nối CSDL sẽ chạy: SET LOCAL app.current_store_id = 1;
DROP POLICY IF EXISTS tenant_isolation_tables ON Tables;
CREATE POLICY tenant_isolation_tables ON Tables
FOR ALL USING (
    StoreID = NULLIF(current_setting('app.current_store_id', true), '')::INT
);

DROP POLICY IF EXISTS tenant_isolation_menu ON MenuItems;
CREATE POLICY tenant_isolation_menu ON MenuItems
FOR ALL USING (
    StoreID = NULLIF(current_setting('app.current_store_id', true), '')::INT
);

DROP POLICY IF EXISTS tenant_isolation_orders ON Orders;
CREATE POLICY tenant_isolation_orders ON Orders
FOR ALL USING (
    StoreID = NULLIF(current_setting('app.current_store_id', true), '')::INT
);

DROP POLICY IF EXISTS tenant_isolation_order_details ON OrderDetails;
CREATE POLICY tenant_isolation_order_details ON OrderDetails
FOR ALL USING (
    StoreID = NULLIF(current_setting('app.current_store_id', true), '')::INT
);

DROP POLICY IF EXISTS tenant_isolation_customers ON Customers;
CREATE POLICY tenant_isolation_customers ON Customers
FOR ALL USING (
    StoreID = NULLIF(current_setting('app.current_store_id', true), '')::INT
);

-- =============================================================================
-- 11. DỮ LIỆU MẪU KHỞI TẠO (B2B SaaS Seeds)
-- =============================================================================

-- 1. Khởi tạo 3 Gói Dịch Vụ SaaS (Plans)
INSERT INTO Plans (PlanID, PlanCode, PlanName, MonthlyPrice, AnnualPrice, MaxTables, MaxStaff, Feature_CRM, Feature_Inventory, Feature_QR_Order, Feature_KDS, Feature_MultiBranch)
VALUES 
(1, 'STARTER',    'Gói Khởi Nghiệp (Starter)',    299000,   2990000,  10, 3,  FALSE, FALSE, TRUE, TRUE, FALSE),
(2, 'PRO',        'Gói Tiêu Chuẩn (Pro)',         699000,   6990000,  30, 10, TRUE,  FALSE, TRUE, TRUE, FALSE),
(3, 'ENTERPRISE', 'Gói Doanh Nghiệp (Enterprise)', 1499000, 14990000, 999, 50, TRUE,  TRUE,  TRUE, TRUE, TRUE);

-- 2. Khởi tạo Cửa hàng mẫu (Stores) có liên kết Plans và ExpiryDate
INSERT INTO Stores (StoreID, StoreCode, StoreName, Subdomain, PlanID, ExpiryDate, SubscriptionStatus, Phone, Address, BankCode, BankAccountNumber, BankAccountName)
VALUES 
(1, 'STORE-HCM-01', 'Aroma Coffee Roastery', 'aroma-roastery', 3, CURRENT_TIMESTAMP + INTERVAL '1 year',  'Active', '0901112222', '120 Nguyễn Huệ, Quận 1, TP.HCM', 'MB',  '99998888',     'AROMA COFFEE ROASTERY'),
(2, 'STORE-HN-02',  'La Vie En Rose Tea',     'lavie-rose',     2, CURRENT_TIMESTAMP + INTERVAL '6 months', 'Active', '0903334444', '45 Tràng Tiền, Hoàn Kiếm, HN',    'VCB', '001100223344', 'LA VIE EN ROSE CO');

-- 3. Khởi tạo Tài khoản Nhân sự Chuẩn (StaffUsers)
INSERT INTO StaffUsers (UserID, StoreID, Username, Email, Password, Pin, FullName, Role, Phone) VALUES
(1, NULL, 'superadmin', 'saas.admin@cafemanager.io', 'SuperAdmin@2026!', '9999', 'Root SaaS Administrator', 'SuperAdmin', '0900000999'),
(2, 1,    'manager',    'owner@aromacoffee.vn',      'Manager@2026!',    '8888', 'Lê Hữu Nghĩa (Chủ Quán Aroma)', 'StoreOwner', '0901112222'),
(3, 1,    'cashier',    'cashier@aromacoffee.vn',    'Cashier@1234!',    '1234', 'Trần Thu Ngân (Aroma POS)',       'Cashier',    '0908888777'),
(4, 1,    'waiter',     'waiter@aromacoffee.vn',     'Waiter@2345!',     '2345', 'Hoàng Nhân (Order Bàn)',        'Waiter',     '0905555666'),
(5, 1,    'barista',    'barista@aromacoffee.vn',    'Barista@3456!',    '3456', 'Nguyễn Văn Barista',            'Barista',    '0912333444');

-- 4. Khởi tạo Bàn (Tables)
INSERT INTO Tables (TableID, StoreID, TableName, AreaName, Capacity, Status, QRToken) VALUES
(1, 1, 'Bàn 01', 'Tầng 1', 4, 'Occupied',  'QR-AROMA-01'),
(2, 1, 'Bàn 02', 'Tầng 1', 4, 'Available', 'QR-AROMA-02'),
(3, 1, 'Bàn VIP 01', 'Phòng Lạnh', 8, 'Occupied', 'QR-AROMA-VIP'),
(4, 2, 'Bàn Trà 01', 'Sảnh Hoàng Gia', 4, 'Available', 'QR-ROSE-01');

-- 5. Khởi tạo Thực đơn (MenuItems)
INSERT INTO MenuItems (ItemID, StoreID, CategoryName, ItemName, SKU, BasePrice, AllowsTopping, AvailableToppings) VALUES
(1, 1, 'Cà Phê', 'Cà Phê Muối Đặc Biệt', 'CF-SALT', 35000, FALSE, '[]'),
(2, 1, 'Cà Phê', 'Cà Phê Sữa Đá Sài Gòn', 'CF-MILK', 29000, FALSE, '[]'),
(3, 1, 'Trà & Macchiato', 'Trà Đào Cam Sả Tươi', 'TEA-PEACH', 42000, TRUE, '["Trân châu đen", "Trân châu trắng", "Thạch đào giòn"]'),
(4, 1, 'Đá Xay - Freeze', 'Matcha Đá Xay Hạnh Nhân', 'ICE-MATCHA', 48000, TRUE, '["Kem Cheese Macchiato", "Trân châu đen"]'),
(5, 1, 'Bánh Ngọt', 'Bánh Tiramisu Truyền Thống', 'CAKE-TIRA', 40000, FALSE, '[]');

-- 6. Khởi tạo Topping Quán (Toppings)
INSERT INTO Toppings (ToppingID, StoreID, ToppingName, Price, IsAvailable) VALUES
(1, 1, 'Trân châu đen', 5000, TRUE),
(2, 1, 'Trân châu trắng', 7000, TRUE),
(3, 1, 'Thạch đào giòn', 8000, TRUE),
(4, 1, 'Kem Cheese Macchiato', 10000, TRUE),
(5, 1, 'Thạch sương sáo', 5000, TRUE);

-- 7. Khởi tạo Khách hàng CRM (Customers)
INSERT INTO Customers (CustomerID, StoreID, FullName, Phone, MembershipTier, LoyaltyPoints, TotalSpent) VALUES
(1, 1, 'Nguyễn Văn An', '0901234567', 'Gold', 450, 4500000),
(2, 2, 'Vũ Hoàng Yến',  '0901234567', 'Diamond', 1200, 15000000);
