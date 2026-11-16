/**
 * CafeManager POS - Vercel Serverless Backend API
 * Dữ liệu lưu hoàn toàn trên Neon PostgreSQL. Không còn dữ liệu giả (mock) dự phòng:
 * nếu DB lỗi, API trả lỗi rõ ràng để nhân viên biết thay vì làm việc trên dữ liệu không được lưu.
 */

const express = require('express');
const cors = require('cors');
const db = require('./db');
const { MANAGER_ROLES, STORE_ROLES, signToken, requireAuth, requireRole, requireStore } = require('./auth');
const ordersRouter = require('./orders');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const wrap = (fn) => (req, res) => fn(req, res).catch(err => {
    console.error('❌ [api]', req.method, req.originalUrl, err.message);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
});

function requireDb(req, res, next) {
    if (!db.isConfigured()) {
        return res.status(503).json({
            success: false,
            error: 'Server chưa cấu hình DATABASE_URL. Thêm biến môi trường rồi deploy lại.'
        });
    }
    next();
}

const ROLE_NAMES = {
    SuperAdmin: 'Super Admin SaaS',
    StoreOwner: 'Quản Lý / Chủ Quán',
    StoreManager: 'Quản Lý / Chủ Quán',
    Manager: 'Quản Lý / Chủ Quán',
    Cashier: 'Thu Ngân POS',
    Waiter: 'Nhân Viên Order',
    Barista: 'Quầy Pha Chế'
};

function getDefaultScreenForRole(role) {
    const r = (role || '').toLowerCase();
    if (r === 'waiter') return 'waiter-order.html';
    if (r === 'cashier') return 'pos.html';
    if (r === 'barista') return 'barista.html';
    if (r === 'superadmin') return 'super-admin-dashboard.html';
    return 'store-admin-dashboard.html';
}

// =============================================================================
// ĐĂNG NHẬP (công khai)
// =============================================================================
async function buildLoginResponse(user, message) {
    const store = user.storeid
        ? (await db.query('SELECT StoreName FROM Stores WHERE StoreID = $1', [user.storeid])).rows[0]
        : null;
    const normalized = { UserID: user.userid, Username: user.username, FullName: user.fullname, Role: user.role, StoreID: user.storeid };
    db.query('UPDATE StaffUsers SET LastLoginAt = CURRENT_TIMESTAMP WHERE UserID = $1', [user.userid]).catch(() => {});
    return {
        success: true,
        message,
        token: signToken(normalized),
        user: {
            id: user.userid,
            username: user.username,
            fullName: user.fullname,
            role: user.role,
            roleName: ROLE_NAMES[user.role] || user.role,
            storeId: user.storeid,
            storeName: user.role === 'SuperAdmin' ? 'Toàn Hệ Thống SaaS' : (store ? store.storename : ''),
            defaultScreen: getDefaultScreenForRole(user.role)
        }
    };
}

app.post('/api/auth/login', requireDb, wrap(async (req, res) => {
    const { username, password, pin } = req.body || {};
    const loginUser = String(username || '').toLowerCase().trim();
    const cleanPin = pin ? String(pin).trim() : null;

    if (cleanPin) return pinLogin(cleanPin, res);
    if (!loginUser) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập tên đăng nhập hoặc mã PIN!' });
    }
    const r = await db.query(
        'SELECT * FROM StaffUsers WHERE (LOWER(Username) = $1 OR Phone = $1) AND IsActive = TRUE', [loginUser]);
    // Chấp nhận mật khẩu hoặc PIN để tương thích màn hình đăng nhập hiện tại
    const matches = r.rows.filter(u => password && (password === u.password || password === u.pin));
    if (matches.length === 0) {
        return res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
    }
    if (matches.length > 1) {
        return res.status(409).json({ success: false, error: 'Tên đăng nhập trùng giữa nhiều quán. Liên hệ quản trị.' });
    }
    return res.json(await buildLoginResponse(matches[0], `Đăng nhập thành công! Chào mừng ${matches[0].fullname}`));
}));

async function pinLogin(cleanPin, res) {
    if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ success: false, error: 'Mã PIN phải gồm đúng 4 chữ số!' });
    }
    const r = await db.query('SELECT * FROM StaffUsers WHERE Pin = $1 AND IsActive = TRUE', [cleanPin]);
    if (r.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Mã PIN không chính xác!' });
    }
    if (new Set(r.rows.map(u => u.storeid)).size > 1) {
        return res.status(409).json({ success: false, error: 'Mã PIN này trùng ở nhiều quán. Hãy đăng nhập bằng tên đăng nhập.' });
    }
    return res.json(await buildLoginResponse(r.rows[0], `Xác thực PIN thành công! Chào mừng ${r.rows[0].fullname}`));
}

app.post('/api/auth/pin', requireDb, wrap(async (req, res) => {
    return pinLogin(String((req.body || {}).pin || '').trim(), res);
}));

app.get('/api/health', async (req, res) => {
    const dbStatus = await db.testConnection();
    res.json({
        status: dbStatus.connected ? 'online' : 'degraded',
        service: 'CafeManager POS - Vercel Serverless API',
        environment: process.env.NODE_ENV || 'production',
        neonDatabase: dbStatus,
        jwtConfigured: !!process.env.JWT_SECRET,
        mode: db.isConfigured() ? 'NEON_POSTGRESQL_REALTIME' : 'NO_DATABASE'
    });
});

// =============================================================================
// TỪ ĐÂY TRỞ XUỐNG: BẮT BUỘC ĐĂNG NHẬP VÀ CÓ DATABASE
// =============================================================================
app.use('/api', requireDb, requireAuth);

app.get('/api/me', (req, res) => res.json({ success: true, data: req.auth }));

app.get('/api/plans', wrap(async (req, res) => {
    const r = await db.query('SELECT * FROM Plans WHERE IsActive = TRUE ORDER BY MonthlyPrice ASC');
    res.json({ success: true, data: r.rows });
}));

app.get('/api/stores', requireRole('SuperAdmin'), wrap(async (req, res) => {
    const r = await db.query(`
        SELECT s.*, p.PlanName, p.MaxTables, p.Feature_CRM
        FROM Stores s LEFT JOIN Plans p ON s.PlanID = p.PlanID
        ORDER BY s.StoreID ASC
    `);
    res.json({ success: true, data: r.rows });
}));

// ---- Dữ liệu dùng chung cho mọi thiết bị: quán, bàn, thực đơn, topping ----
const tableToClient = (t) => ({
    id: t.tableid, name: t.tablename, area: t.areaname, capacity: t.capacity,
    status: t.status === 'Maintenance' ? 'maintenance' : 'active'
});
const menuToClient = (m) => {
    let top = [];
    try { top = typeof m.availabletoppings === 'string' ? JSON.parse(m.availabletoppings || '[]') : (m.availabletoppings || []); } catch (e) {}
    return {
        id: m.itemid, name: m.itemname, cat: m.categoryname, sku: m.sku, price: Number(m.baseprice),
        img: m.imageurl || '☕', desc: m.description || '', available: m.isavailable !== false,
        allowTopping: !!m.allowstopping, allowedToppings: top
    };
};
const toppingToClient = (t) => ({ id: t.toppingid, name: t.toppingname, price: Number(t.price), available: t.isavailable !== false });

app.get('/api/bootstrap', requireStore, wrap(async (req, res) => {
    const sid = req.storeId;
    const [store, tables, menu, toppings] = await Promise.all([
        db.query('SELECT * FROM Stores WHERE StoreID = $1', [sid]),
        db.query('SELECT * FROM Tables WHERE StoreID = $1 ORDER BY TableID ASC', [sid]),
        db.query('SELECT * FROM MenuItems WHERE StoreID = $1 ORDER BY ItemID ASC', [sid]),
        db.query('SELECT * FROM Toppings WHERE StoreID = $1 ORDER BY ToppingID ASC', [sid])
    ]);
    const s = store.rows[0] || {};
    res.json({
        success: true,
        data: {
            store: {
                id: s.storeid, name: s.storename, address: s.address || '', phone: s.phone || '',
                wifi: s.wifi || '', bankCode: s.bankcode || '', bankAcc: s.bankaccountnumber || '',
                bankName: s.bankaccountname || ''
            },
            tables: tables.rows.map(tableToClient),
            menu: menu.rows.map(menuToClient),
            toppings: toppings.rows.map(toppingToClient)
        }
    });
}));

// Cài đặt quán (tên, địa chỉ, ngân hàng nhận VietQR)
app.put('/api/store-settings', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const b = req.body || {};
    await db.query(`
        UPDATE Stores SET
            StoreName = COALESCE(NULLIF($2, ''), StoreName),
            Address = COALESCE($3, Address),
            Phone = COALESCE($4, Phone),
            Wifi = COALESCE($5, Wifi),
            BankCode = COALESCE(NULLIF($6, ''), BankCode),
            BankAccountNumber = COALESCE($7, BankAccountNumber),
            BankAccountName = COALESCE($8, BankAccountName),
            UpdatedAt = CURRENT_TIMESTAMP
        WHERE StoreID = $1
    `, [req.storeId, b.name ?? '', b.address ?? null, b.phone ?? null, b.wifi ?? null,
        b.bankCode ?? '', b.bankAcc ?? null, b.bankName ?? null]);
    res.json({ success: true });
}));

// ---- Bàn ----
app.get('/api/tables', requireStore, wrap(async (req, res) => {
    const r = await db.query('SELECT * FROM Tables WHERE StoreID = $1 ORDER BY TableID ASC', [req.storeId]);
    res.json({ success: true, data: r.rows.map(tableToClient) });
}));

app.post('/api/tables', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const { id, name, area = 'Tầng 1', capacity = 4, status = 'active' } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'Tên bàn là bắt buộc!' });
    const dbStatus = status === 'maintenance' ? 'Maintenance' : 'Available';
    const numericId = id && Number(id) <= 1000000000 ? parseInt(id, 10) : null;
    try {
        if (numericId) {
            const r = await db.query(`
                UPDATE Tables SET TableName = $1, AreaName = $2, Capacity = $3, Status = $4, UpdatedAt = CURRENT_TIMESTAMP
                WHERE TableID = $5 AND StoreID = $6 RETURNING *
            `, [name, area, capacity, dbStatus, numericId, req.storeId]);
            if (r.rows.length) return res.json({ success: true, data: tableToClient(r.rows[0]) });
        }
        const r = await db.query(`
            INSERT INTO Tables (StoreID, TableName, AreaName, Capacity, Status, QRToken)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [req.storeId, name, area, capacity, dbStatus, `QR-${req.storeId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`]);
        res.json({ success: true, data: tableToClient(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ success: false, error: `Tên bàn "${name}" đã tồn tại.` });
        res.status(400).json({ success: false, error: e.message });
    }
}));

app.delete('/api/tables/:id', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const open = await db.query('SELECT 1 FROM OpenOrders WHERE StoreID = $1 AND TableKey = $2', [req.storeId, String(id)]);
    if (open.rows.length) {
        return res.status(409).json({ success: false, error: 'Bàn đang có đơn chưa thanh toán, không thể xóa.' });
    }
    await db.query('DELETE FROM Tables WHERE TableID = $1 AND StoreID = $2', [id, req.storeId]);
    res.json({ success: true });
}));

// ---- Thực đơn ----
app.get('/api/menu', requireStore, wrap(async (req, res) => {
    const r = await db.query('SELECT * FROM MenuItems WHERE StoreID = $1 ORDER BY ItemID ASC', [req.storeId]);
    res.json({ success: true, data: r.rows.map(menuToClient) });
}));

app.post('/api/menu', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const { id, name, cat = 'Cà Phê', price = 30000, img = '☕', desc = '', sku, available = true,
        allowTopping = false, allowedToppings = [] } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'Tên món là bắt buộc!' });
    if (!(Number(price) >= 0)) return res.status(400).json({ success: false, error: 'Giá món không hợp lệ.' });

    const finalSku = String(sku || `SKU-${Date.now().toString().slice(-6)}`).toUpperCase().trim();
    const numericId = id && Number(id) <= 1000000000 ? parseInt(id, 10) : null;
    const top = JSON.stringify(Array.isArray(allowedToppings) ? allowedToppings : []);

    if (numericId) {
        const r = await db.query(`
            UPDATE MenuItems SET ItemName = $1, CategoryName = $2, BasePrice = $3, ImageUrl = $4, Description = $5,
                AllowsTopping = $6, AvailableToppings = $7, SKU = $8, IsAvailable = $9, UpdatedAt = CURRENT_TIMESTAMP
            WHERE ItemID = $10 AND StoreID = $11 RETURNING *
        `, [name, cat, price, img, desc, allowTopping, top, finalSku, available, numericId, req.storeId]);
        if (r.rows.length) return res.json({ success: true, data: menuToClient(r.rows[0]) });
    }
    const r = await db.query(`
        INSERT INTO MenuItems (StoreID, ItemName, CategoryName, BasePrice, ImageUrl, Description, SKU, AllowsTopping, AvailableToppings, IsAvailable)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (StoreID, SKU) DO UPDATE SET
            ItemName = EXCLUDED.ItemName, CategoryName = EXCLUDED.CategoryName, BasePrice = EXCLUDED.BasePrice,
            ImageUrl = EXCLUDED.ImageUrl, Description = EXCLUDED.Description, AllowsTopping = EXCLUDED.AllowsTopping,
            AvailableToppings = EXCLUDED.AvailableToppings, IsAvailable = EXCLUDED.IsAvailable, UpdatedAt = CURRENT_TIMESTAMP
        RETURNING *
    `, [req.storeId, name, cat, price, img, desc, finalSku, allowTopping, top, available]);
    res.json({ success: true, data: menuToClient(r.rows[0]) });
}));

app.delete('/api/menu/:id', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    await db.query('DELETE FROM MenuItems WHERE ItemID = $1 AND StoreID = $2', [parseInt(req.params.id, 10), req.storeId]);
    res.json({ success: true });
}));

// ---- Topping ----
app.get('/api/toppings', requireStore, wrap(async (req, res) => {
    const r = await db.query('SELECT * FROM Toppings WHERE StoreID = $1 ORDER BY ToppingID ASC', [req.storeId]);
    res.json({ success: true, data: r.rows.map(toppingToClient) });
}));

app.post('/api/toppings', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const { id, name, price = 5000, available = true } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'Tên topping là bắt buộc!' });
    const numericId = id && Number(id) <= 1000000000 ? parseInt(id, 10) : null;
    try {
        if (numericId) {
            const r = await db.query(`
                UPDATE Toppings SET ToppingName = $1, Price = $2, IsAvailable = $3
                WHERE ToppingID = $4 AND StoreID = $5 RETURNING *
            `, [name, price, available, numericId, req.storeId]);
            if (r.rows.length) return res.json({ success: true, data: toppingToClient(r.rows[0]) });
        }
        const r = await db.query(`
            INSERT INTO Toppings (StoreID, ToppingName, Price, IsAvailable) VALUES ($1,$2,$3,$4)
            ON CONFLICT (StoreID, ToppingName) DO UPDATE SET Price = EXCLUDED.Price, IsAvailable = EXCLUDED.IsAvailable
            RETURNING *
        `, [req.storeId, name, price, available]);
        res.json({ success: true, data: toppingToClient(r.rows[0]) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
}));

app.delete('/api/toppings/:id', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    await db.query('DELETE FROM Toppings WHERE ToppingID = $1 AND StoreID = $2', [parseInt(req.params.id, 10), req.storeId]);
    res.json({ success: true });
}));

// ---- Nhân sự (không bao giờ trả mật khẩu về client) ----
const staffToClient = (s) => ({
    id: s.userid, name: s.fullname, username: s.username,
    role: s.role === 'StoreOwner' ? 'Manager' : s.role,
    phone: s.phone || '', pin: s.pin || '', status: s.isactive ? 'active' : 'inactive'
});

app.get('/api/staff', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const r = await db.query('SELECT * FROM StaffUsers WHERE StoreID = $1 ORDER BY UserID ASC', [req.storeId]);
    res.json({ success: true, data: r.rows.map(staffToClient) });
}));

app.post('/api/staff', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const b = req.body || {};
    const name = b.fullName || b.name;
    if (!name) return res.status(400).json({ success: false, error: 'Tên nhân viên là bắt buộc!' });
    const role = b.role === 'Manager' ? 'Manager' : b.role;
    if (!['Manager', 'Cashier', 'Waiter', 'Barista'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Vai trò không hợp lệ.' });
    }
    const pin = String(b.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ success: false, error: 'Mã PIN phải gồm đúng 4 chữ số.' });
    const username = String(b.username || b.phone || ('nv_' + Date.now().toString().slice(-4))).toLowerCase().trim();
    const active = b.isActive !== undefined ? !!b.isActive : b.status !== 'inactive';
    const numericId = b.id && Number(b.id) <= 1000000000 ? parseInt(b.id, 10) : null;

    // PIN phải duy nhất trong quán để đăng nhập nhanh không nhầm người
    const dup = await db.query(
        'SELECT 1 FROM StaffUsers WHERE StoreID = $1 AND Pin = $2 AND IsActive = TRUE AND UserID <> COALESCE($3, -1)',
        [req.storeId, pin, numericId]);
    if (dup.rows.length) return res.status(409).json({ success: false, error: 'Mã PIN này đã có người dùng trong quán.' });

    try {
        if (numericId) {
            const r = await db.query(`
                UPDATE StaffUsers SET FullName = $1, Role = $2, Phone = $3, Pin = $4, Username = $5, IsActive = $6,
                    Password = COALESCE(NULLIF($9, ''), Password), UpdatedAt = CURRENT_TIMESTAMP
                WHERE UserID = $7 AND StoreID = $8 RETURNING *
            `, [name, role, b.phone || null, pin, username, active, numericId, req.storeId, b.password || '']);
            if (r.rows.length) return res.json({ success: true, data: staffToClient(r.rows[0]) });
        }
        const r = await db.query(`
            INSERT INTO StaffUsers (StoreID, Username, Password, Pin, FullName, Role, Phone, IsActive)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
        `, [req.storeId, username, b.password || pin, pin, name, role, b.phone || null, active]);
        res.json({ success: true, data: staffToClient(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ success: false, error: `Tên đăng nhập "${username}" đã tồn tại.` });
        res.status(400).json({ success: false, error: e.message });
    }
}));

app.delete('/api/staff/:id', requireStore, requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (id === req.auth.userId) {
        return res.status(400).json({ success: false, error: 'Không thể tự xóa tài khoản đang đăng nhập.' });
    }
    await db.query('DELETE FROM StaffUsers WHERE UserID = $1 AND StoreID = $2', [id, req.storeId]);
    res.json({ success: true });
}));

// ---- Đơn hàng, KDS, thanh toán ----
app.use('/api', requireRole(...STORE_ROLES, 'SuperAdmin'), ordersRouter);

app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Không tìm thấy API.' }));

// =============================================================================
// KHỞI ĐỘNG LOCAL SERVER NẾU KHÔNG CHẠY TRÊN VERCEL SERVERLESS
// =============================================================================
if (require.main === module && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 CafeManager POS Backend đang chạy tại: http://localhost:${PORT}`);
        console.log(`📡 Database: ${db.isConfigured() ? 'đã cấu hình' : 'CHƯA CẤU HÌNH (API sẽ trả lỗi 503)'}`);
    });
}

module.exports = app;
