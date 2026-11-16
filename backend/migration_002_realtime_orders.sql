-- =============================================================================
-- MIGRATION 002: ĐƠN HÀNG THỜI GIAN THỰC TRÊN DATABASE
-- Chạy SAU schema.sql và migration_update_db.sql. An toàn khi chạy lại nhiều lần.
-- =============================================================================

-- 1. Đồng bộ sequence (seed trong schema.sql chèn ID cố định nên sequence còn ở 1,
--    khiến INSERT mới bị trùng khóa chính)
SELECT setval(pg_get_serial_sequence('plans', 'planid'),            GREATEST((SELECT COALESCE(MAX(PlanID), 0) FROM Plans), 1));
SELECT setval(pg_get_serial_sequence('stores', 'storeid'),          GREATEST((SELECT COALESCE(MAX(StoreID), 0) FROM Stores), 1));
SELECT setval(pg_get_serial_sequence('staffusers', 'userid'),       GREATEST((SELECT COALESCE(MAX(UserID), 0) FROM StaffUsers), 1));
SELECT setval(pg_get_serial_sequence('tables', 'tableid'),          GREATEST((SELECT COALESCE(MAX(TableID), 0) FROM Tables), 1));
SELECT setval(pg_get_serial_sequence('menuitems', 'itemid'),        GREATEST((SELECT COALESCE(MAX(ItemID), 0) FROM MenuItems), 1));
SELECT setval(pg_get_serial_sequence('toppings', 'toppingid'),      GREATEST((SELECT COALESCE(MAX(ToppingID), 0) FROM Toppings), 1));
SELECT setval(pg_get_serial_sequence('customers', 'customerid'),    GREATEST((SELECT COALESCE(MAX(CustomerID), 0) FROM Customers), 1));

-- 2. Đơn đang mở theo bàn (giỏ hàng chung giữa Waiter, POS)
--    TableKey: ID bàn dạng chuỗi, hoặc 'takeaway' cho đơn mang đi
CREATE TABLE IF NOT EXISTS OpenOrders (
    OpenOrderID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    TableKey VARCHAR(30) NOT NULL,
    Data JSONB NOT NULL,
    Version INT NOT NULL DEFAULT 1,
    UpdatedBy VARCHAR(100),
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_OpenOrders_Store_Table UNIQUE (StoreID, TableKey)
);

-- 3. Vé pha chế (KDS Barista)
CREATE TABLE IF NOT EXISTS KdsTickets (
    TicketID SERIAL PRIMARY KEY,
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    TicketCode VARCHAR(30) NOT NULL,
    TableKey VARCHAR(30) NOT NULL,
    TableName VARCHAR(100) NOT NULL,
    WaiterName VARCHAR(100),
    Items JSONB NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (Status IN ('pending', 'brewing', 'ready', 'served', 'cancelled')),
    CreatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_KdsTickets_Store_Code UNIQUE (StoreID, TicketCode)
);
CREATE INDEX IF NOT EXISTS idx_KdsTickets_Store_Status ON KdsTickets(StoreID, Status);

-- 4. Bộ đếm số thứ tự theo quán + ngày (mã hóa đơn, mã vé tuần tự, không trùng)
CREATE TABLE IF NOT EXISTS DailyCounters (
    StoreID INT NOT NULL REFERENCES Stores(StoreID) ON DELETE CASCADE,
    Kind VARCHAR(20) NOT NULL,
    Day DATE NOT NULL,
    LastValue INT NOT NULL DEFAULT 0,
    PRIMARY KEY (StoreID, Kind, Day)
);

-- 5. Mở rộng Orders để lưu đủ thông tin hóa đơn và nhật ký hủy
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS TableKey VARCHAR(30);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS TableName VARCHAR(100);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS CashierName VARCHAR(100);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS DiscountReason VARCHAR(200);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS ItemsJSON JSONB DEFAULT '[]'::jsonb;
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS CustomerJSON JSONB;
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS CancelReason TEXT;
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS CancelledBy VARCHAR(100);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS CancelledAt TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_Orders_Store_Closed ON Orders(StoreID, ClosedAt);

-- 6. OrderDetails: cho phép món đã bị xóa khỏi menu mà vẫn giữ lịch sử bán
ALTER TABLE OrderDetails ALTER COLUMN ItemID DROP NOT NULL;
ALTER TABLE OrderDetails DROP CONSTRAINT IF EXISTS orderdetails_itemid_fkey;
ALTER TABLE OrderDetails ADD CONSTRAINT orderdetails_itemid_fkey
    FOREIGN KEY (ItemID) REFERENCES MenuItems(ItemID) ON DELETE SET NULL;
ALTER TABLE OrderDetails DROP CONSTRAINT IF EXISTS orderdetails_size_check;
ALTER TABLE OrderDetails ADD COLUMN IF NOT EXISTS NoteText TEXT;

-- 7. Thông tin quán hiển thị trên bill
ALTER TABLE Stores ADD COLUMN IF NOT EXISTS Wifi VARCHAR(100);

-- 8. Tắt RLS cho các bảng mới (API phân quyền theo StoreID trong JWT)
ALTER TABLE OpenOrders DISABLE ROW LEVEL SECURITY;
ALTER TABLE KdsTickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE Toppings DISABLE ROW LEVEL SECURITY;

SELECT '✓ MIGRATION 002 THÀNH CÔNG' AS KetQua;
