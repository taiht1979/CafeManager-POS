/**
 * CafeManager POS - Vercel Serverless Backend API
 * Kết nối CSDL Neon Serverless PostgreSQL
 *
 * Bảo mật: mọi endpoint dữ liệu quán yêu cầu JWT (xem api/auth.js). StoreID lấy từ token.
 */

const express = require('express');
const cors = require('cors');
const db = require('./db');
const auth = require('./auth');

const app = express();
app.set('trust proxy', 1);

// CORS: production chỉ cho các origin khai báo trong ALLOWED_ORIGINS (frontend cùng domain không cần CORS)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || (!isProd && allowedOrigins.length === 0))
}));
app.use(express.json({ limit: '1mb' }));

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
    { UserID: 1, StoreID: 1, Username: 'manager', Password: 'Manager@2026!', FullName: 'Lê Hữu Nghĩa (Chủ Quán)', Role: 'StoreOwner', Phone: '0901 112 222', Pin: '8888', IsActive: true },
    { UserID: 2, StoreID: 1, Username: 'cashier', Password: 'Cashier@1234!', FullName: 'Trần Thu Ngân', Role: 'Cashier', Phone: '0908 888 777', Pin: '1234', IsActive: true },
    { UserID: 3, StoreID: 1, Username: 'waiter', Password: 'Waiter@2345!', FullName: 'Hoàng Nhân (Order)', Role: 'Waiter', Phone: '0905 555 666', Pin: '2345', IsActive: true },
    { UserID: 4, StoreID: 1, Username: 'barista', Password: 'Barista@3456!', FullName: 'Nguyễn Văn Barista', Role: 'Barista', Phone: '0912 333 444', Pin: '3456', IsActive: true },
    { UserID: 5, StoreID: null, Username: 'superadmin', Password: 'SuperAdmin@2026!', FullName: 'Quản Trị Viên SaaS (Root)', Role: 'SuperAdmin', Phone: '0900 000 999', Pin: '9999', IsActive: true }
];

function getDefaultScreenForRole(role) {
    const r = (role || '').toLowerCase();
    if (r === 'waiter' || r === 'order') return 'waiter-order.html';
    if (r === 'cashier') return 'pos.html';
    if (r === 'barista') return 'barista.html';
    if (r === 'superadmin') return 'super-admin-dashboard.html';
    return 'store-admin-dashboard.html';
}

let mockOrders = [];
let mockBaristaQueue = [];


const { requireAuth, MANAGER_ROLES, STORE_ROLES } = auth;
const ALL_STAFF_ROLES = ['StoreOwner', 'StoreManager', 'Manager', 'Cashier', 'Waiter', 'Barista'];
const STAFF_ROLE_ALIASES = { order: 'Waiter' };
const ROLE_NAMES = {
    SuperAdmin: 'Super Admin SaaS', StoreOwner: 'Quản Lý / Chủ Quán', StoreManager: 'Quản Lý / Chủ Quán',
    Manager: 'Quản Lý / Chủ Quán', Cashier: 'Thu Ngân POS', Waiter: 'Nhân Viên Order', Barista: 'Quầy Pha Chế'
};

// Mật khẩu mock được băm 1 lần khi khởi động (chỉ dùng khi chưa cấu hình DATABASE_URL)
mockStaff.forEach(s => { s.Password = auth.hashPassword(s.Password); });

// =============================================================================
// AUTH
// =============================================================================

// Trả về { user } | { error, status }. Khi đã cấu hình DB thì CHỈ dùng DB (không fallback sang tài khoản mock).
async function findUser({ username, pin }) {
    const loginUser = (username || '').toLowerCase().trim();
    if (db.isConfigured()) {
        try {
            let r;
            if (pin) r = await db.query('SELECT * FROM StaffUsers WHERE Pin = $1 AND IsActive = TRUE LIMIT 1', [pin]);
            else r = await db.query('SELECT * FROM StaffUsers WHERE (LOWER(Username) = $1 OR Phone = $1) AND IsActive = TRUE LIMIT 1', [loginUser]);
            return { user: r.rows[0] || null };
        } catch (e) {
            console.error('Lỗi đọc StaffUsers:', e.message);
            return { error: 'Không kết nối được cơ sở dữ liệu, vui lòng thử lại!', status: 503 };
        }
    }
    const user = pin
        ? mockStaff.find(s => s.Pin === pin && s.IsActive !== false)
        : mockStaff.find(s => (s.Username.toLowerCase() === loginUser || s.Phone === loginUser) && s.IsActive !== false);
    return { user: user || null };
}

async function getStoreName(storeId) {
    if (db.isConfigured() && storeId) {
        try {
            const r = await db.query('SELECT StoreName FROM Stores WHERE StoreID = $1', [storeId]);
            if (r.rows[0]) return r.rows[0].StoreName;
        } catch (e) { /* bỏ qua */ }
    }
    const st = mockStores.find(s => s.StoreID === storeId);
    return st ? st.StoreName : '';
}

async function issueSession(user, message) {
    let token;
    try { token = auth.signToken(user); }
    catch (e) { return { status: 500, body: { success: false, error: e.message } }; }
    return {
        status: 200,
        body: {
            success: true,
            message: `${message} ${user.FullName}`,
            token,
            user: {
                id: user.UserID,
                username: user.Username,
                fullName: user.FullName,
                role: user.Role,
                roleName: ROLE_NAMES[user.Role] || user.Role,
                storeId: user.StoreID,
                storeName: await getStoreName(user.StoreID),
                defaultScreen: getDefaultScreenForRole(user.Role)
            }
        }
    };
}

app.post('/api/auth/login', auth.loginRateLimit, async (req, res) => {
    const { username, password, pin } = req.body || {};
    const loginUser = (username || '').toString().toLowerCase().trim();
    const cleanPin = pin ? String(pin).trim() : null;

    if (!cleanPin && !loginUser) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập tên đăng nhập hoặc mã PIN!' });
    }

    const found = await findUser({ username: loginUser, pin: cleanPin });
    if (found.error) return res.status(found.status).json({ success: false, error: found.error });
    const user = found.user;

    if (cleanPin) {
        if (!user) {
            auth.recordLoginFailure(req.loginKey);
            return res.status(401).json({ success: false, error: 'Mã PIN không chính xác! Vui lòng kiểm tra lại.' });
        }
    } else {
        if (!user) {
            auth.recordLoginFailure(req.loginKey);
            return res.status(401).json({ success: false, error: 'Tài khoản không tồn tại trong hệ thống!' });
        }
        // Chỉ chấp nhận đúng mật khẩu (không còn chấp nhận PIN thay mật khẩu)
        if (!auth.verifyPassword(password, user.Password)) {
            auth.recordLoginFailure(req.loginKey);
            return res.status(401).json({ success: false, error: 'Mật khẩu không chính xác! Vui lòng kiểm tra lại.' });
        }
        // Tự động băm lại mật khẩu plaintext cũ
        if (db.isConfigured() && !auth.isHashed(user.Password)) {
            db.query('UPDATE StaffUsers SET Password = $1 WHERE UserID = $2', [auth.hashPassword(password), user.UserID]).catch(() => {});
        }
    }

    auth.clearLoginFailures(req.loginKey);
    const out = await issueSession(user, 'Đăng nhập thành công! Chào mừng');
    res.status(out.status).json(out.body);
});

app.post('/api/auth/pin', auth.loginRateLimit, async (req, res) => {
    const cleanPin = String((req.body || {}).pin || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ success: false, error: 'Mã PIN phải gồm đúng 4 chữ số!' });
    }
    const found = await findUser({ pin: cleanPin });
    if (found.error) return res.status(found.status).json({ success: false, error: found.error });
    if (!found.user) {
        auth.recordLoginFailure(req.loginKey);
        return res.status(401).json({ success: false, error: 'Mã PIN không chính xác!' });
    }
    auth.clearLoginFailures(req.loginKey);
    const out = await issueSession(found.user, 'Xác thực PIN thành công! Chào mừng');
    res.status(out.status).json(out.body);
});

// =============================================================================
// PUBLIC: health & plans
// =============================================================================
app.get('/api/health', async (req, res) => {
    const dbStatus = await db.testConnection();
    res.json({
        status: 'online',
        service: 'CafeManager POS - Vercel Serverless API',
        neonDatabase: { connected: !!dbStatus.connected },
        mode: db.isConfigured() ? 'NEON_POSTGRESQL_REALTIME' : 'MOCK_IN_MEMORY'
    });
});

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

// Danh sách toàn bộ quán: chỉ SuperAdmin
app.get('/api/stores', auth.requireSuperAdmin, async (req, res) => {
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

// =============================================================================
// TABLES (đọc: mọi vai trò của quán; ghi: quản lý)
// =============================================================================
const TABLE_STATUS_MAP = {
    active: 'Available', available: 'Available', occupied: 'Occupied', billing: 'Billing',
    reserved: 'Reserved', merged: 'Merged', maintenance: 'Maintenance'
};

app.get('/api/tables', requireAuth(...STORE_ROLES), async (req, res) => {
    const storeId = req.storeId;
    if (db.isConfigured()) {
        try {
            const result = await db.query('SELECT * FROM Tables WHERE StoreID = $1 ORDER BY TableID ASC', [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockTables.filter(t => t.StoreID === storeId), source: 'Mock Data' });
});

app.post('/api/tables', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const { id, name, area = 'Tầng 1', capacity = 4 } = req.body || {};
    const storeId = req.storeId;
    const status = TABLE_STATUS_MAP[String((req.body || {}).status || 'active').toLowerCase()];
    if (!name) return res.status(400).json({ error: 'Tên bàn là bắt buộc!' });
    if (!status) return res.status(400).json({ error: 'Trạng thái bàn không hợp lệ!' });

    if (db.isConfigured()) {
        try {
            if (id) {
                const updateRes = await db.query(`
                    UPDATE Tables 
                    SET TableName = $1, AreaName = $2, Capacity = $3, Status = $4, UpdatedAt = CURRENT_TIMESTAMP
                    WHERE TableID = $5 AND StoreID = $6
                    RETURNING *
                `, [name, area, capacity, status, id, storeId]);
                if (!updateRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy bàn!' });
                return res.json({ success: true, message: 'Đã cập nhật bàn thành công', data: updateRes.rows[0] });
            }
            const insertRes = await db.query(`
                INSERT INTO Tables (StoreID, TableName, AreaName, Capacity, Status, QRToken)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [storeId, name, area, capacity, status, `QR-${storeId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`]);
            return res.json({ success: true, message: 'Đã thêm bàn mới thành công', data: insertRes.rows[0] });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (id) {
        const table = mockTables.find(t => t.TableID === id && t.StoreID === storeId);
        if (!table) return res.status(404).json({ error: 'Không tìm thấy bàn!' });
        Object.assign(table, { TableName: name, AreaName: area, Capacity: capacity, Status: status });
    } else {
        mockTables.push({ TableID: Date.now(), StoreID: storeId, TableName: name, AreaName: area, Capacity: capacity, Status: status });
    }
    res.json({ success: true, message: 'Đã lưu bàn (Mock Data)', data: { name, area, capacity, status } });
});

app.delete('/api/tables/:id', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const tableId = parseInt(req.params.id, 10);
    if (db.isConfigured()) {
        try {
            await db.query('DELETE FROM Tables WHERE TableID = $1 AND StoreID = $2', [tableId, req.storeId]);
            return res.json({ success: true, message: 'Đã xóa bàn thành công khỏi Neon DB' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    mockTables = mockTables.filter(t => !(t.TableID === tableId && t.StoreID === req.storeId));
    res.json({ success: true, message: 'Đã xóa bàn (Mock)' });
});

// =============================================================================
// MENU
// =============================================================================
app.get('/api/menu', requireAuth(...STORE_ROLES), async (req, res) => {
    const storeId = req.storeId;
    if (db.isConfigured()) {
        try {
            const result = await db.query('SELECT * FROM MenuItems WHERE StoreID = $1 ORDER BY ItemID ASC', [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockMenu.filter(m => m.StoreID === storeId), source: 'Mock Data' });
});

app.post('/api/menu', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const { id, name, cat = 'Cà Phê', price = 30000, img = '☕', desc = '', sku, allowTopping = false, allowedToppings = [] } = req.body || {};
    const storeId = req.storeId;
    if (!name) return res.status(400).json({ error: 'Tên món là bắt buộc!' });
    if (!Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'Giá món không hợp lệ!' });

    const finalSku = (sku || `SKU-${Date.now().toString().slice(-6)}`).toUpperCase().trim();
    const isClientTimestamp = id && Number(id) > 1000000000;
    const dbItemId = (!id || isClientTimestamp) ? null : parseInt(id, 10);

    if (db.isConfigured()) {
        try {
            if (dbItemId) {
                const updateRes = await db.query(`
                    UPDATE MenuItems 
                    SET ItemName = $1, CategoryName = $2, BasePrice = $3, ImageUrl = $4, Description = $5, AllowsTopping = $6, AvailableToppings = $7, SKU = COALESCE($8, SKU), UpdatedAt = CURRENT_TIMESTAMP
                    WHERE ItemID = $9 AND StoreID = $10
                    RETURNING *
                `, [name, cat, price, img, desc, allowTopping, JSON.stringify(allowedToppings), finalSku, dbItemId, storeId]);
                if (updateRes.rows.length > 0) {
                    return res.json({ success: true, message: 'Đã cập nhật món thành công trên Neon DB', data: updateRes.rows[0] });
                }
            }
            const insertRes = await db.query(`
                INSERT INTO MenuItems (StoreID, ItemName, CategoryName, BasePrice, ImageUrl, Description, SKU, AllowsTopping, AvailableToppings)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (StoreID, SKU) DO UPDATE SET
                    ItemName = EXCLUDED.ItemName,
                    CategoryName = EXCLUDED.CategoryName,
                    BasePrice = EXCLUDED.BasePrice,
                    ImageUrl = EXCLUDED.ImageUrl,
                    Description = EXCLUDED.Description,
                    AllowsTopping = EXCLUDED.AllowsTopping,
                    AvailableToppings = EXCLUDED.AvailableToppings,
                    UpdatedAt = CURRENT_TIMESTAMP
                RETURNING *
            `, [storeId, name, cat, price, img, desc, finalSku, allowTopping, JSON.stringify(allowedToppings)]);
            return res.json({ success: true, message: 'Đã lưu món thành công vào Neon DB', data: insertRes.rows[0] });
        } catch (e) {
            console.error('Lỗi lưu MenuItems vào Neon:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    if (dbItemId) {
        const item = mockMenu.find(m => m.ItemID === dbItemId && m.StoreID === storeId);
        if (item) {
            Object.assign(item, { ItemName: name, CategoryName: cat, BasePrice: price, Img: img, Description: desc, AllowTopping: allowTopping, AllowedToppings: allowedToppings });
        }
    } else {
        mockMenu.push({
            ItemID: Date.now(), StoreID: storeId, ItemName: name, CategoryName: cat, BasePrice: price,
            Img: img, Description: desc, AllowTopping: allowTopping, AllowedToppings: allowedToppings
        });
    }
    res.json({ success: true, message: 'Đã lưu món (Mock)' });
});

app.delete('/api/menu/:id', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    if (db.isConfigured()) {
        try {
            await db.query('DELETE FROM MenuItems WHERE ItemID = $1 AND StoreID = $2', [itemId, req.storeId]);
            return res.json({ success: true, message: 'Đã xóa món khỏi Neon DB' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    mockMenu = mockMenu.filter(m => !(m.ItemID === itemId && m.StoreID === req.storeId));
    res.json({ success: true, message: 'Đã xóa món (Mock)' });
});

// =============================================================================
// STAFF (chỉ quản lý). Không bao giờ trả mật khẩu; PIN chỉ trả cho quản lý để cấp lại cho nhân viên.
// =============================================================================
function publicStaff(s) {
    const { Password, PasswordHash, ...rest } = s;
    return rest;
}

async function pinTakenByOther(pin, exceptUserId) {
    if (db.isConfigured()) {
        const r = await db.query('SELECT 1 FROM StaffUsers WHERE Pin = $1 AND UserID <> $2 LIMIT 1', [pin, exceptUserId || 0]);
        return r.rows.length > 0;
    }
    return mockStaff.some(s => s.Pin === pin && s.UserID !== exceptUserId);
}

app.get('/api/staff', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const storeId = req.storeId;
    if (db.isConfigured()) {
        try {
            const result = await db.query(`
                SELECT UserID, StoreID, Username, FullName, Role, Phone, Pin, IsActive, CreatedAt 
                FROM StaffUsers 
                WHERE StoreID = $1 
                ORDER BY UserID ASC
            `, [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockStaff.filter(s => s.StoreID === storeId).map(publicStaff), source: 'Mock Data' });
});

app.post('/api/staff', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const { id, username, password, fullName, name, phone, isActive = true } = req.body || {};
    const storeId = req.storeId;
    const finalName = fullName || name;
    const finalUser = (username || phone || ('nv_' + Date.now().toString().slice(-4))).toString().toLowerCase().trim();
    const finalPin = req.body.pin ? String(req.body.pin).trim() : '1234';
    const rawRole = String(req.body.role || 'Waiter');
    const role = STAFF_ROLE_ALIASES[rawRole.toLowerCase()] || rawRole;

    if (!finalName) return res.status(400).json({ error: 'Tên nhân viên là bắt buộc!' });
    if (!ALL_STAFF_ROLES.includes(role)) return res.status(400).json({ error: 'Vai trò không hợp lệ!' });
    if (!/^\d{4}$/.test(finalPin)) return res.status(400).json({ error: 'Mã PIN phải gồm đúng 4 chữ số!' });

    const isClientTimestamp = id && Number(id) > 1000000000;
    const dbUserId = (!id || isClientTimestamp) ? null : parseInt(id, 10);

    try {
        if (await pinTakenByOther(finalPin, dbUserId)) {
            return res.status(409).json({ error: 'Mã PIN này đã được nhân viên khác sử dụng. Vui lòng chọn PIN khác!' });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }

    // Mật khẩu: nếu không nhập khi tạo mới thì mặc định = PIN (băm). Khi sửa chỉ đổi nếu có nhập.
    const newPassHash = password ? auth.hashPassword(password) : null;

    if (db.isConfigured()) {
        try {
            if (dbUserId) {
                const updateRes = await db.query(`
                    UPDATE StaffUsers 
                    SET FullName = $1, Role = $2, Phone = $3, Pin = $4, Username = $5, IsActive = $6,
                        Password = COALESCE($9, Password), UpdatedAt = CURRENT_TIMESTAMP
                    WHERE UserID = $7 AND StoreID = $8
                    RETURNING UserID, StoreID, Username, FullName, Role, Phone, Pin, IsActive
                `, [finalName, role, phone, finalPin, finalUser, isActive, dbUserId, storeId, newPassHash]);
                if (updateRes.rows.length > 0) {
                    return res.json({ success: true, message: 'Đã cập nhật nhân viên trên Neon DB', data: updateRes.rows[0] });
                }
            }
            const insertRes = await db.query(`
                INSERT INTO StaffUsers (StoreID, Username, Password, Pin, FullName, Role, Phone, IsActive)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (StoreID, Username) DO UPDATE SET
                    FullName = EXCLUDED.FullName,
                    Role = EXCLUDED.Role,
                    Phone = EXCLUDED.Phone,
                    Pin = EXCLUDED.Pin,
                    Password = EXCLUDED.Password,
                    IsActive = EXCLUDED.IsActive,
                    UpdatedAt = CURRENT_TIMESTAMP
                RETURNING UserID, StoreID, Username, FullName, Role, Phone, Pin, IsActive
            `, [storeId, finalUser, newPassHash || auth.hashPassword(finalPin), finalPin, finalName, role, phone, isActive]);
            return res.json({ success: true, message: 'Đã lưu nhân viên thành công vào Neon DB', data: insertRes.rows[0] });
        } catch (e) {
            console.error('Lỗi lưu StaffUsers vào Neon:', e.message);
            return res.status(500).json({ error: e.message });
        }
    }

    if (dbUserId) {
        const staff = mockStaff.find(s => s.UserID === dbUserId && s.StoreID === storeId);
        if (staff) {
            Object.assign(staff, { FullName: finalName, Role: role, Phone: phone, Pin: finalPin, Username: finalUser, IsActive: isActive });
            if (newPassHash) staff.Password = newPassHash;
        }
    } else {
        mockStaff.push({
            UserID: Date.now(), StoreID: storeId, Username: finalUser, Password: newPassHash || auth.hashPassword(finalPin),
            FullName: finalName, Role: role, Phone: phone, Pin: finalPin, IsActive: isActive
        });
    }
    res.json({ success: true, message: 'Lưu nhân viên thành công' });
});

app.delete('/api/staff/:id', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (id === req.auth.uid) return res.status(400).json({ error: 'Không thể tự xóa tài khoản đang đăng nhập!' });

    if (db.isConfigured()) {
        try {
            await db.query('DELETE FROM StaffUsers WHERE UserID = $1 AND StoreID = $2', [id, req.storeId]);
            return res.json({ success: true, message: 'Đã xóa nhân viên' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    mockStaff = mockStaff.filter(s => !(s.UserID === id && s.StoreID === req.storeId));
    res.json({ success: true, message: 'Đã xóa nhân viên' });
});

// =============================================================================
// ORDERS
// =============================================================================
app.get('/api/orders', requireAuth(...MANAGER_ROLES, 'Cashier'), async (req, res) => {
    const storeId = req.storeId;
    if (db.isConfigured()) {
        try {
            const result = await db.query('SELECT * FROM Orders WHERE StoreID = $1 ORDER BY OrderID DESC LIMIT 50', [storeId]);
            return res.json({ success: true, data: result.rows, source: 'Neon DB' });
        } catch (e) {
            console.warn('Lỗi truy vấn Neon:', e.message);
        }
    }
    res.json({ success: true, data: mockOrders.filter(o => o.StoreID === storeId), source: 'Mock Data' });
});

// Hủy hóa đơn: chỉ quản lý (kiểm tra vai trò từ token, không dùng PIN cố định)
app.post('/api/orders/void', requireAuth(...MANAGER_ROLES), async (req, res) => {
    const { code, reason } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Thiếu mã hóa đơn!' });
    const managerName = req.auth.name || req.auth.username;

    if (db.isConfigured()) {
        try {
            const updateRes = await db.query(`
                UPDATE Orders 
                SET OrderStatus = 'Cancelled', CancelReason = $1, CancelledBy = $2, UpdatedAt = CURRENT_TIMESTAMP
                WHERE OrderCode = $3 AND StoreID = $4
                RETURNING *
            `, [reason || 'Quản lý duyệt hủy', managerName, code, req.storeId]);
            if (!updateRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy hóa đơn!' });
            return res.json({ success: true, message: `Đã hủy hóa đơn ${code}`, data: updateRes.rows[0] });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    res.json({ success: true, message: `✓ Đã hủy hóa đơn ${code} theo ủy quyền của ${managerName}` });
});

// =============================================================================
// BARISTA KDS (hàng đợi lưu trong bộ nhớ, tách theo quán)
// =============================================================================
app.get('/api/barista/queue', requireAuth('Barista', ...MANAGER_ROLES, 'Cashier', 'Waiter'), (req, res) => {
    res.json({ success: true, data: mockBaristaQueue.filter(t => t.StoreID === req.storeId) });
});

app.post('/api/barista/queue', requireAuth('Cashier', 'Waiter', ...MANAGER_ROLES), (req, res) => {
    mockBaristaQueue.push({ ...(req.body || {}), StoreID: req.storeId });
    res.json({ success: true, message: 'Đã bắn vé sang hàng đợi Barista' });
});

// Xử lý lỗi chung: trả JSON thay vì HTML stack trace
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ success: false, error: status === 400 ? 'Dữ liệu gửi lên không hợp lệ (JSON sai cú pháp)!' : 'Lỗi máy chủ nội bộ' });
});

if (require.main === module && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 CafeManager POS Backend đang chạy tại: http://localhost:${PORT}`);
        console.log(`📡 Trạng thái Neon Database: ${db.isConfigured() ? 'ĐÃ KẾT NỐI' : 'CHƯA CẤU HÌNH (Dùng Mock)'}`);
    });
}

// Xuất handler cho Vercel Serverless
module.exports = app;
