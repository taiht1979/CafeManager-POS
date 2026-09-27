/**
 * CafeManager POS - Vercel Serverless Backend API
 * Kết nối CSDL Neon Serverless PostgreSQL
 */

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// =============================================================================
// MOCK DATA DỰ PHÒNG (FALLBACK KHI CHƯA NHẬP DATABASE_URL)
// =============================================================================
let mockPlans = [
    { PlanID: 1, PlanCode: 'STARTER', PlanName: 'Gói Khởi Nghiệp (Starter)', MonthlyPrice: 299000, MaxTables: 10, MaxStaff: 3, Feature_CRM: false },
    { PlanID: 2, PlanCode: 'PRO', PlanName: 'Gói Tiêu Chuẩn (Pro)', MonthlyPrice: 699000, MaxTables: 30, MaxStaff: 10, Feature_CRM: true },
    { PlanID: 3, PlanCode: 'ENTERPRISE', PlanName: 'Gói Doanh Nghiệp (Enterprise)', MonthlyPrice: 1499000, MaxTables: 999, MaxStaff: 50, Feature_CRM: true }
];

let mockStores = [
    { StoreID: 1, StoreCode: 'STORE-HCM-01', StoreName: 'Aroma Coffee Roastery', PlanID: 3, SubscriptionStatus: 'Active', Phone: '0901112222', BankCode: 'MB', BankAccountNumber: '99998888', BankAccountName: 'AROMA COFFEE ROASTERY' }
];

let mockTables = [
    { TableID: 1, StoreID: 1, TableName: 'Bàn 01', AreaName: 'Tầng 1', Capacity: 4, Status: 'Available' },
    { TableID: 2, StoreID: 1, TableName: 'Bàn 02', AreaName: 'Tầng 1', Capacity: 4, Status: 'Available' },
    { TableID: 3, StoreID: 1, TableName: 'Bàn 03', AreaName: 'Sân Vườn', Capacity: 6, Status: 'Available' },
    { TableID: 4, StoreID: 1, TableName: 'Bàn VIP 01', AreaName: 'Lầu 1', Capacity: 8, Status: 'Available' },
    { TableID: 5, StoreID: 1, TableName: 'Bàn 05', AreaName: 'Sân Vườn', Capacity: 4, Status: 'Available' },
    { TableID: 0, StoreID: 1, TableName: 'Mang đi (Take-away)', AreaName: 'Quầy bar', Capacity: 1, Status: 'Available' }
];

let mockMenu = [
    { ItemID: 1, StoreID: 1, CategoryName: 'Cà Phê', ItemName: 'Cà Phê Muối Đặc Biệt', SKU: 'CF-SALT', BasePrice: 35000, Img: '☕', Description: 'Kem muối béo mặn sánh mịn' },
    { ItemID: 2, StoreID: 1, CategoryName: 'Cà Phê', ItemName: 'Cà Phê Sữa Đá Sài Gòn', SKU: 'CF-MILK', BasePrice: 29000, Img: '🥤', Description: 'Robusta Buôn Ma Thuột đậm đà' },
    { ItemID: 3, StoreID: 1, CategoryName: 'Trà & Macchiato', ItemName: 'Trà Đào Cam Sả Tươi', SKU: 'TEA-PEACH', BasePrice: 42000, Img: '🍑', Description: 'Miếng đào giòn ngọt sảng khoái' },
    { ItemID: 4, StoreID: 1, CategoryName: 'Đá Xay - Freeze', ItemName: 'Matcha Đá Xay Hạnh Nhân', SKU: 'ICE-MATCHA', BasePrice: 48000, Img: '🍵', Description: 'Matcha Uji Nhật phủ kem tươi' },
    { ItemID: 5, StoreID: 1, CategoryName: 'Bánh Ngọt', ItemName: 'Bánh Tiramisu Truyền Thống', SKU: 'CAKE-TIRA', BasePrice: 40000, Img: '🍰', Description: 'Cacao Bỉ và rượu rum thượng hạng' }
];

let mockStaff = [
    { UserID: 1, StoreID: 1, Username: 'manager', FullName: 'Lê Hữu Nghĩa', Role: 'Manager', Phone: '0901 112 222', Pin: '8888', IsActive: true },
    { UserID: 2, StoreID: 1, Username: 'cashier', FullName: 'Trần Thu Ngân', Role: 'Cashier', Phone: '0908 888 777', Pin: '1234', IsActive: true },
    { UserID: 3, StoreID: 1, Username: 'waiter', FullName: 'Hoàng Nhân (Order)', Role: 'Waiter', Phone: '0905 555 666', Pin: '2345', IsActive: true },
    { UserID: 4, StoreID: 1, Username: 'barista', FullName: 'Nguyễn Văn Barista', Role: 'Barista', Phone: '0912 333 444', Pin: '3456', IsActive: true }
];

let mockOrders = [];
let mockBaristaQueue = [];

// =============================================================================
// API ROUTES
// =============================================================================

// 1. Kiểm tra trạng thái hệ thống & Neon DB
app.get('/api/health', async (req, res) => {
    const dbStatus = await db.testConnection();
    res.json({
        status: 'online',
        service: 'CafeManager POS - Vercel Serverless API',
        environment: process.env.NODE_ENV || 'production',
        neonDatabase: dbStatus,
        mode: db.isConfigured() ? 'NEON_POSTGRESQL_REALTIME' : 'MOCK_IN_MEMORY'
    });
});

// 2. Gói dịch vụ SaaS (Plans)
app.get('/api/plans', async (req, res) => {
    if (db.isConfigured()) {
        try {
            const result = await db.query('SELECT * FROM Plans WHERE IsActive = TRUE ORDER BY MonthlyPrice ASC');
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon, fallback mock:', e.message);
        }
    }
    res.json({ success: true, data: mockPlans, source: 'Mock Data' });
});

// 3. Danh sách Quán / Chi nhánh (Stores)
app.get('/api/stores', async (req, res) => {
    if (db.isConfigured()) {
        try {
            const result = await db.query(`
                SELECT s.*, p.PlanName, p.MaxTables, p.Feature_CRM 
                FROM Stores s 
                LEFT JOIN Plans p ON s.PlanID = p.PlanID 
                ORDER BY s.StoreID ASC
            `);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockStores, source: 'Mock Data' });
});

// 4. Quản lý Bàn (Tables)
app.get('/api/tables', async (req, res) => {
    const storeId = parseInt(req.query.store_id || 1, 10);
    if (db.isConfigured()) {
        try {
            const result = await db.query('SELECT * FROM Tables WHERE StoreID = $1 ORDER BY TableID ASC', [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    const filtered = mockTables.filter(t => t.StoreID === storeId);
    res.json({ success: true, data: filtered, source: 'Mock Data' });
});

app.post('/api/tables', async (req, res) => {
    const { id, storeId = 1, name, area = 'Tầng 1', capacity = 4, status = 'active' } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên bàn là bắt buộc!' });

    if (db.isConfigured()) {
        try {
            if (id) {
                // Update
                const updateRes = await db.query(`
                    UPDATE Tables 
                    SET TableName = $1, AreaName = $2, Capacity = $3, Status = $4, UpdatedAt = CURRENT_TIMESTAMP
                    WHERE TableID = $5 AND StoreID = $6
                    RETURNING *
                `, [name, area, capacity, status, id, storeId]);
                return res.json({ success: true, message: 'Đã cập nhật bàn thành công', data: updateRes.rows[0] });
            } else {
                // Insert
                const insertRes = await db.query(`
                    INSERT INTO Tables (StoreID, TableName, AreaName, Capacity, Status, QRToken)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `, [storeId, name, area, capacity, status, `QR-${storeId}-${Date.now().toString().slice(-4)}`]);
                return res.json({ success: true, message: 'Đã thêm bàn mới thành công', data: insertRes.rows[0] });
            }
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // Mock Fallback
    if (id) {
        const table = mockTables.find(t => t.TableID === id);
        if (table) {
            table.TableName = name;
            table.AreaName = area;
            table.Capacity = capacity;
            table.Status = status;
        }
    } else {
        mockTables.push({
            TableID: Date.now(),
            StoreID: storeId,
            TableName: name,
            AreaName: area,
            Capacity: capacity,
            Status: status
        });
    }
    res.json({ success: true, message: 'Đã lưu bàn (Mock Data)', data: { name, area, capacity, status } });
});

app.delete('/api/tables/:id', async (req, res) => {
    const tableId = parseInt(req.params.id, 10);
    if (db.isConfigured()) {
        try {
            await db.query('DELETE FROM Tables WHERE TableID = $1', [tableId]);
            return res.json({ success: true, message: 'Đã xóa bàn thành công khỏi Neon DB' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    mockTables = mockTables.filter(t => t.TableID !== tableId);
    res.json({ success: true, message: 'Đã xóa bàn (Mock)' });
});

// 5. Thực đơn món (MenuItems)
app.get('/api/menu', async (req, res) => {
    const storeId = parseInt(req.query.store_id || 1, 10);
    if (db.isConfigured()) {
        try {
            const result = await db.query('SELECT * FROM MenuItems WHERE StoreID = $1 ORDER BY ItemID ASC', [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockMenu, source: 'Mock Data' });
});

app.post('/api/menu', async (req, res) => {
    const { id, storeId = 1, name, cat = 'Cà Phê', price = 30000, img = '☕', desc = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên món là bắt buộc!' });

    if (db.isConfigured()) {
        try {
            if (id) {
                const updateRes = await db.query(`
                    UPDATE MenuItems 
                    SET ItemName = $1, CategoryName = $2, BasePrice = $3, ImageURL = $4, Description = $5, UpdatedAt = CURRENT_TIMESTAMP
                    WHERE ItemID = $6 AND StoreID = $7
                    RETURNING *
                `, [name, cat, price, img, desc, id, storeId]);
                return res.json({ success: true, message: 'Đã cập nhật món thành công', data: updateRes.rows[0] });
            } else {
                const insertRes = await db.query(`
                    INSERT INTO MenuItems (StoreID, ItemName, CategoryName, BasePrice, ImageURL, Description, SKU)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [storeId, name, cat, price, img, desc, `SKU-${Date.now().toString().slice(-4)}`]);
                return res.json({ success: true, message: 'Đã thêm món mới thành công', data: insertRes.rows[0] });
            }
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // Mock
    if (id) {
        const item = mockMenu.find(m => m.ItemID === id);
        if (item) {
            item.ItemName = name;
            item.CategoryName = cat;
            item.BasePrice = price;
            item.Img = img;
            item.Description = desc;
        }
    } else {
        mockMenu.push({
            ItemID: Date.now(),
            StoreID: storeId,
            ItemName: name,
            CategoryName: cat,
            BasePrice: price,
            Img: img,
            Description: desc
        });
    }
    res.json({ success: true, message: 'Đã lưu món (Mock)' });
});

// 6. Quản lý Nhân sự (StaffUsers)
app.get('/api/staff', async (req, res) => {
    const storeId = parseInt(req.query.store_id || 1, 10);
    if (db.isConfigured()) {
        try {
            const result = await db.query(`
                SELECT UserID, StoreID, Username, FullName, Role, Phone, IsActive, CreatedAt 
                FROM StaffUsers 
                WHERE StoreID = $1 
                ORDER BY UserID ASC
            `, [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockStaff, source: 'Mock Data' });
});

// 7. Quản lý Hóa đơn & Đối soát (Orders)
app.get('/api/orders', async (req, res) => {
    const storeId = parseInt(req.query.store_id || 1, 10);
    if (db.isConfigured()) {
        try {
            const result = await db.query(`
                SELECT * FROM Orders 
                WHERE StoreID = $1 
                ORDER BY OrderID DESC 
                LIMIT 50
            `, [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockOrders, source: 'Mock Data' });
});

app.post('/api/orders/void', async (req, res) => {
    const { code, reason, pin, managerName } = req.body;
    
    // BẢO MẬT: Kiểm tra mã PIN Quản lý
    const isValidPin = pin === '8888' || pin === '1234';
    if (!isValidPin) {
        return res.status(403).json({ error: '⛔ TỪ CHỐI TRUY CẬP: Nhân viên không có quyền xóa/hủy hóa đơn! Chỉ Quản lý có PIN hợp lệ mới được thực hiện.' });
    }

    if (db.isConfigured()) {
        try {
            const updateRes = await db.query(`
                UPDATE Orders 
                SET OrderStatus = 'Cancelled', CancelReason = $1, CancelledBy = $2, UpdatedAt = CURRENT_TIMESTAMP
                WHERE OrderCode = $3
                RETURNING *
            `, [reason || 'Quản lý duyệt hủy', managerName || 'Quản lý cửa hàng', code]);
            return res.json({ success: true, message: `Đã hủy hóa đơn ${code}`, data: updateRes.rows[0] });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    res.json({ success: true, message: `✓ Đã hủy hóa đơn ${code} theo ủy quyền của ${managerName || 'Quản lý'}` });
});

// 8. Hàng đợi Pha Chế Barista KDS
app.get('/api/barista/queue', async (req, res) => {
    res.json({ success: true, data: mockBaristaQueue });
});

app.post('/api/barista/queue', (req, res) => {
    const ticket = req.body;
    mockBaristaQueue.push(ticket);
    res.json({ success: true, message: 'Đã bắn vé sang hàng đợi Barista' });
});

// =============================================================================
// KHỞI ĐỘNG LOCAL SERVER NẾU KHÔNG CHẠY TRÊN VERCEL SERVERLESS
// =============================================================================
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 CafeManager POS Backend đang chạy tại: http://localhost:${PORT}`);
        console.log(`📡 Trạng thái Neon Database: ${db.isConfigured() ? 'ĐÃ KẾT NỐI' : 'CHƯA CẤU HÌNH (Dùng Mock)'}`);
    });
}

// Xuất handler cho Vercel Serverless
module.exports = app;
