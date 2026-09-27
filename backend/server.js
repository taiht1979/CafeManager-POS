/**
 * CafeManager POS - B2B SaaS Multi-Tenant Backend API Server
 * 
 * KIẾN TRÚC BẢO MẬT & PHÂN QUYỀN SAAS:
 * 1. checkTenant: Giải mã JWT, cô lập dữ liệu tuyệt đối theo StoreID.
 * 2. checkSubscription: Kiểm tra hạn thuê bao (ExpiryDate), chặn 403 nếu hết hạn.
 * 3. requireFeature: Kiểm tra cờ tính năng (Feature_CRM, Feature_Inventory, v.v.),
 *    chặn 403 Payment Required nếu gói hiện tại không hỗ trợ.
 */

const http = require('http');
const url = require('url');
const { checkTenant, decodeJwt } = require('./middlewares/tenant.middleware');
const { checkSubscription, requireFeature, checkMaxTablesQuota } = require('./middlewares/subscription.middleware');

const PORT = process.env.PORT || 3000;

// =============================================================================
// DATABASE MOCK KHỞI TẠO (ĐỒNG BỘ VỚI SCHEMA.SQL)
// =============================================================================
const db = {
    // 1. Bảng Plans (3 Gói dịch vụ)
    plans: [
        {
            PlanID: 1,
            PlanCode: 'STARTER',
            PlanName: 'Gói Khởi Nghiệp (Starter)',
            MonthlyPrice: 299000,
            AnnualPrice: 2990000,
            MaxTables: 10,
            MaxStaff: 3,
            Feature_CRM: false,         // <-- Gói Starter BỊ KHÓA CRM!
            Feature_Inventory: false,   // <-- Gói Starter BỊ KHÓA Quản lý Kho!
            Feature_QR_Order: true,
            Feature_KDS: true,
            Feature_MultiBranch: false
        },
        {
            PlanID: 2,
            PlanCode: 'PRO',
            PlanName: 'Gói Tiêu Chuẩn (Pro)',
            MonthlyPrice: 699000,
            AnnualPrice: 6990000,
            MaxTables: 30,
            MaxStaff: 10,
            Feature_CRM: true,          // <-- Mở khóa CRM
            Feature_Inventory: false,   // <-- Khóa Kho
            Feature_QR_Order: true,
            Feature_KDS: true,
            Feature_MultiBranch: false
        },
        {
            PlanID: 3,
            PlanCode: 'ENTERPRISE',
            PlanName: 'Gói Doanh Nghiệp (Enterprise)',
            MonthlyPrice: 1499000,
            AnnualPrice: 14990000,
            MaxTables: 999,
            MaxStaff: 50,
            Feature_CRM: true,          // <-- Đầy đủ mọi tính năng
            Feature_Inventory: true,
            Feature_QR_Order: true,
            Feature_KDS: true,
            Feature_MultiBranch: true
        }
    ],

    // 2. Bảng Stores (Có Store 1 còn hạn, Store 2 gói Starter, Store 3 hết hạn)
    stores: [
        {
            StoreID: 1,
            StoreCode: 'STORE-HCM-01',
            StoreName: 'Aroma Coffee Roastery',
            Subdomain: 'aroma-roastery',
            PlanID: 3, // Enterprise
            ExpiryDate: '2027-09-26T23:59:59Z', // Còn hạn 1 năm
            SubscriptionStatus: 'Active',
            Phone: '0901112222',
            Address: '120 Nguyễn Huệ, Quận 1, TP.HCM',
            BankCode: 'MB',
            BankAccountNumber: '99998888',
            BankAccountName: 'AROMA COFFEE ROASTERY'
        },
        {
            StoreID: 2,
            StoreCode: 'STORE-HN-02',
            StoreName: 'Little Bean Coffee',
            Subdomain: 'little-bean',
            PlanID: 1, // Starter (Không có CRM, Giới hạn 10 bàn)
            ExpiryDate: '2027-03-15T23:59:59Z',
            SubscriptionStatus: 'Active',
            Phone: '0903334444',
            Address: '15 Tạ Hiện, Hoàn Kiếm, Hà Nội',
            BankCode: 'VCB',
            BankAccountNumber: '001100223344',
            BankAccountName: 'LITTLE BEAN CO'
        },
        {
            StoreID: 3,
            StoreCode: 'STORE-DN-03',
            StoreName: 'Old Time Cafe (Đã Hết Hạn)',
            Subdomain: 'old-time',
            PlanID: 2, // Pro
            ExpiryDate: '2026-08-01T00:00:00Z', // ĐÃ HẾT HẠN THUÊ BAO!
            SubscriptionStatus: 'Expired',
            Phone: '0905556666',
            Address: '88 Bạch Đằng, Đà Nẵng',
            BankCode: 'TCB',
            BankAccountNumber: '19038888',
            BankAccountName: 'OLD TIME CAFE'
        }
    ],

    // 3. Bảng StaffUsers
    staffUsers: [
        { UserID: 1, StoreID: null, Username: 'superadmin', Role: 'SuperAdmin', FullName: 'SaaS Platform Administrator' },
        { UserID: 2, StoreID: 1, Username: 'aroma_owner', Role: 'StoreOwner', FullName: 'Lê Hữu Nghĩa (Chủ Quán Aroma)' },
        { UserID: 3, StoreID: 2, Username: 'bean_owner', Role: 'StoreOwner', FullName: 'Trần Văn Đậu (Chủ Quán Little Bean)' },
        { UserID: 4, StoreID: 3, Username: 'old_owner', Role: 'StoreOwner', FullName: 'Nguyễn Văn Cũ (Chủ Quán Hết Hạn)' }
    ],

    // 4. Bảng Tables
    tables: [
        { TableID: 1, StoreID: 1, TableName: 'Bàn 01', AreaName: 'Tầng 1', Capacity: 4, Status: 'Occupied', Bill: 115000, QRToken: 'QR-AROMA-01' },
        { TableID: 2, StoreID: 1, TableName: 'Bàn 02', AreaName: 'Tầng 1', Capacity: 4, Status: 'Available', Bill: 0, QRToken: 'QR-AROMA-02' },
        { TableID: 3, StoreID: 2, TableName: 'Bàn Nhỏ 01', AreaName: 'Trong nhà', Capacity: 2, Status: 'Available', Bill: 0, QRToken: 'QR-BEAN-01' }
    ],

    // 5. Bảng MenuItems
    menuItems: [
        { ItemID: 1, StoreID: 1, CategoryName: 'Cà Phê', ItemName: 'Cà Phê Muối Đặc Biệt', SKU: 'CF-SALT', BasePrice: 35000 },
        { ItemID: 2, StoreID: 1, CategoryName: 'Trà', ItemName: 'Trà Sen Vàng Aroma', SKU: 'TEA-LOTUS', BasePrice: 45000 },
        { ItemID: 3, StoreID: 2, CategoryName: 'Cà Phê', ItemName: 'Espresso Đậm Đà', SKU: 'CF-ESP', BasePrice: 30000 }
    ],

    // 6. Bảng Customers
    customers: [
        { CustomerID: 1, StoreID: 1, FullName: 'Nguyễn Văn An', Phone: '0901234567', MembershipTier: 'Gold', LoyaltyPoints: 450, TotalSpent: 4500000 },
        { CustomerID: 2, StoreID: 2, FullName: 'Phạm Thị Thúy', Phone: '0988777666', MembershipTier: 'Silver', LoyaltyPoints: 120, TotalSpent: 1200000 }
    ],

    // 7. Bảng Orders & Hàng đợi Barista KDS
    orders: [
        { OrderID: 1, StoreID: 1, OrderCode: 'ORD-AROMA-001', TotalAmount: 115000, OrderStatus: 'Completed', PaymentMethod: 'VietQR', CreatedAt: '2026-09-26 15:30' }
    ],
    baristaQueue: [
        { OrderDetailID: 101, StoreID: 1, TableName: 'Bàn 01', ItemName: 'Cà Phê Muối (Size M)', BaristaStatus: 'Brewing', Time: '18:15' }
    ]
};

// =============================================================================
// NATIVE PIPELINE RUNNER (Hỗ trợ chạy độc lập không cần cài thêm thư viện ngoài)
// =============================================================================
function createPipeline(req, res, middlewares, handler) {
    let index = 0;
    function next(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (index < middlewares.length) {
            const currentMiddleware = middlewares[index++];
            currentMiddleware(req, res, next);
        } else {
            handler(req, res);
        }
    }
    next();
}

// Khởi tạo các Middleware
const tenantMW = checkTenant(db);
const subscriptionMW = checkSubscription(db);
const maxTablesMW = checkMaxTablesQuota(db);

// Helper Response JSON
function enhanceResponse(res) {
    res.status = function(code) {
        this.statusCode = code;
        return this;
    };
    res.json = function(data) {
        this.writeHead(this.statusCode || 200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-store-id'
        });
        this.end(JSON.stringify(data, null, 2));
    };
}

// =============================================================================
// HTTP SERVER & ROUTING ENGINE
// =============================================================================
const server = http.createServer((req, res) => {
    enhanceResponse(res);
    const parsedUrl = url.parse(req.url, true);
    req.query = parsedUrl.query || {};
    req.path = parsedUrl.pathname;

    // CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-store-id'
        });
        return res.end();
    }

    // Đọc Body JSON cho POST request
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', () => {
        try {
            req.body = rawBody ? JSON.parse(rawBody) : {};
        } catch (e) {
            req.body = {};
        }
        routeRequest(req, res);
    });
});

function routeRequest(req, res) {
    const { method, path } = req;

    // -------------------------------------------------------------------------
    // 1. PUBLIC ROUTES (Không cần đăng nhập)
    // -------------------------------------------------------------------------
    if (method === 'GET' && path === '/') {
        return res.json({
            name: '☕ CafeManager POS - B2B Multi-Tenant SaaS Engine',
            version: '2.5.0',
            description: 'Core backend bảo mật với CheckTenant & CheckSubscription middleware',
            plansAvailable: db.plans.map(p => ({ plan: p.PlanCode, name: p.PlanName, price: p.MonthlyPrice }))
        });
    }

    // Lấy bảng giá các gói SaaS
    if (method === 'GET' && path === '/api/plans') {
        return res.json({ success: true, data: db.plans });
    }

    // Đăng nhập lấy JWT mang StoreID
    if (method === 'POST' && path === '/api/auth/login') {
        const { username } = req.body;
        const user = db.staffUsers.find(u => u.Username === username);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Tên đăng nhập không tồn tại! (Thử: aroma_owner, bean_owner, old_owner, superadmin)'
            });
        }

        const store = db.stores.find(s => s.StoreID === user.StoreID) || null;
        const tokenPayload = {
            userId: user.UserID,
            username: user.Username,
            role: user.Role,
            fullName: user.FullName,
            storeId: user.StoreID,
            storeName: store ? store.StoreName : 'SaaS Global'
        };

        // Tạo JWT Token giả lập có payload base64
        const token = 'jwt.' + Buffer.from(JSON.stringify(tokenPayload)).toString('base64') + '.sig';

        return res.json({
            success: true,
            token,
            user: tokenPayload,
            store
        });
    }

    // -------------------------------------------------------------------------
    // 2. CORE POS TENANT ROUTES (Bảo vệ bởi CheckTenant + CheckSubscription)
    // -------------------------------------------------------------------------

    // 2.1. LẤY SƠ ĐỒ BÀN (Tự động lọc theo StoreID)
    if (method === 'GET' && path === '/api/tables') {
        return createPipeline(req, res, [tenantMW, subscriptionMW], (qReq, qRes) => {
            const myTables = qReq.tenantFilter(db.tables);
            return qRes.json({
                success: true,
                storeId: qReq.storeId,
                storeName: qReq.store.StoreName,
                totalTables: myTables.length,
                maxAllowed: qReq.storePlan.MaxTables,
                data: myTables
            });
        });
    }

    // 2.2. TẠO BÀN MỚI (Kiểm tra hạn mức MaxTables)
    if (method === 'POST' && path === '/api/tables') {
        return createPipeline(req, res, [tenantMW, subscriptionMW, maxTablesMW], (qReq, qRes) => {
            const { tableName, areaName, capacity } = qReq.body;
            if (!tableName) return qRes.status(400).json({ error: 'Tên bàn là bắt buộc' });

            const newTable = qReq.withTenantId({
                TableID: db.tables.length + 1,
                TableName: tableName,
                AreaName: areaName || 'Tầng 1',
                Capacity: capacity || 4,
                Status: 'Available',
                Bill: 0,
                QRToken: `QR-${qReq.store.Subdomain}-${Date.now().toString().slice(-4)}`
            });

            db.tables.push(newTable);
            return qRes.status(201).json({
                success: true,
                message: `Đã tạo ${newTable.TableName} cho quán ${qReq.store.StoreName}!`,
                table: newTable
            });
        });
    }

    // 2.3. LẤY THỰC ĐƠN (Tự động lọc theo StoreID)
    if (method === 'GET' && path === '/api/menu') {
        return createPipeline(req, res, [tenantMW, subscriptionMW], (qReq, qRes) => {
            const myMenu = qReq.tenantFilter(db.menuItems);
            return qRes.json({
                success: true,
                storeId: qReq.storeId,
                data: myMenu
            });
        });
    }

    // 2.4. MÀN HÌNH BARISTA KDS (Yêu cầu cờ Feature_KDS)
    if (method === 'GET' && path === '/api/barista/queue') {
        return createPipeline(req, res, [tenantMW, subscriptionMW, requireFeature('Feature_KDS', 'Màn Hình Barista KDS')], (qReq, qRes) => {
            const myQueue = qReq.tenantFilter(db.baristaQueue);
            return qRes.json({
                success: true,
                storeId: qReq.storeId,
                queue: myQueue
            });
        });
    }

    // 2.5. CRM KHÁCH HÀNG THÂN THIẾT (YÊU CẦU CỜ Feature_CRM - Gói Starter sẽ bị chặn 403!)
    if (method === 'GET' && path === '/api/customers') {
        return createPipeline(req, res, [tenantMW, subscriptionMW, requireFeature('Feature_CRM', 'CRM Khách Hàng Thân Thiết & Tích Điểm')], (qReq, qRes) => {
            const myCustomers = qReq.tenantFilter(db.customers);
            return qRes.json({
                success: true,
                storeId: qReq.storeId,
                plan: qReq.storePlan.PlanName,
                totalCustomers: myCustomers.length,
                data: myCustomers
            });
        });
    }

    // 2.6. TẠO KHÁCH HÀNG CRM MỚI (YÊU CẦU CỜ Feature_CRM - Gói Starter sẽ bị chặn 403!)
    if (method === 'POST' && path === '/api/customers') {
        return createPipeline(req, res, [tenantMW, subscriptionMW, requireFeature('Feature_CRM', 'CRM Khách Hàng Thân Thiết & Tích Điểm')], (qReq, qRes) => {
            const { fullName, phone, tier } = qReq.body;
            if (!fullName || !phone) {
                return qRes.status(400).json({ error: 'Họ tên và số điện thoại là bắt buộc' });
            }

            const newCustomer = qReq.withTenantId({
                CustomerID: db.customers.length + 1,
                FullName: fullName,
                Phone: phone,
                MembershipTier: tier || 'Standard',
                LoyaltyPoints: 0,
                TotalSpent: 0
            });

            db.customers.push(newCustomer);
            return qRes.status(201).json({
                success: true,
                message: `Đã lưu khách hàng mới vào CRM của ${qReq.store.StoreName}!`,
                customer: newCustomer
            });
        });
    }

    // 2.7. QUẢN LÝ KHO NGUYÊN LIỆU (YÊU CẦU CỜ Feature_Inventory - Chỉ gói Enterprise có!)
    if (method === 'GET' && path === '/api/inventory') {
        return createPipeline(req, res, [tenantMW, subscriptionMW, requireFeature('Feature_Inventory', 'Quản Lý Định Lượng & Tồn Kho')], (qReq, qRes) => {
            return qRes.json({
                success: true,
                storeId: qReq.storeId,
                message: 'Chào mừng bạn đến với phân hệ Quản lý Kho Doanh Nghiệp!',
                inventory: [
                    { item: 'Hạt Cà Phê Robusta Cầu Đất', stock: '45 kg', unit: 'kg' },
                    { item: 'Sữa Đặc Ngôi Sao', stock: '28 lon', unit: 'lon' }
                ]
            });
        });
    }

    // 404 Route Not Found
    return res.status(404).json({ error: `Đường dẫn ${path} không tồn tại` });
}

server.listen(PORT, () => {
    console.log(`========================================================`);
    console.log(`  ☕ CAFEMANAGER POS - B2B SAAS BACKEND ENGINE ONLINE`);
    console.log(`  Địa chỉ: http://localhost:${PORT}`);
    console.log(`  Middleware 1: CheckTenant (Cô lập StoreID từ JWT)`);
    console.log(`  Middleware 2: CheckSubscription (Chặn ExpiryDate & Feature Flags)`);
    console.log(`========================================================`);
});
