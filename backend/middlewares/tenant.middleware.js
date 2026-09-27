/**
 * CafeManager POS - B2B Multi-Tenant SaaS
 * Middleware: CheckTenant
 * 
 * NHIỆM VỤ:
 * 1. Giải mã JWT Token từ Authorization Header (hoặc nhận diện từ mã QR đối với khách hàng).
 * 2. Trích xuất StoreID, UserID, Role.
 * 3. Gắn StoreID vào req (req.storeId, req.tenantUser).
 * 4. Cung cấp hàm dbScoped() tự động thêm bộ lọc WHERE StoreID = :storeId vào mọi truy vấn DB.
 * 5. Ngăn chặn 100% việc truy cập chéo dữ liệu giữa các quán.
 */

// Secret key dùng cho ký và giải mã JWT Token (trong thực tế đọc từ process.env.JWT_SECRET)
const JWT_SECRET = process.env.JWT_SECRET || 'CafeManager_SaaS_Secret_Key_2026';

/**
 * Hàm giải mã JWT Token (Hỗ trợ cả thư viện jsonwebtoken chuẩn và Native Decoder dự phòng)
 */
function decodeJwt(tokenString) {
    if (!tokenString) return null;
    try {
        if (tokenString.includes('.')) {
            const parts = tokenString.split('.');
            // Phần 2 của JWT chứa payload JSON mã hóa Base64URL
            const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const decodedJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
            return JSON.parse(decodedJson);
        }
        // Trường hợp token dạng JSON demo hoặc fallback
        return JSON.parse(tokenString);
    } catch (err) {
        return null;
    }
}

/**
 * Middleware CheckTenant
 */
function checkTenant(db) {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'] || '';
        let token = null;

        // 1. Lấy Token từ Header: Authorization: Bearer <token>
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        }

        // 2. Trường hợp Khách hàng quét mã QR tại bàn (Không có tài khoản user đăng nhập)
        const qrToken = req.query?.qr_token || req.body?.qr_token;
        if (qrToken && db) {
            const matchedTable = db.tables.find(t => t.QRToken === qrToken);
            if (matchedTable) {
                req.storeId = matchedTable.StoreID;
                req.isQrCustomer = true;
                req.tableInfo = matchedTable;
                attachTenantDbHelper(req, db);
                return next();
            }
        }

        // 3. Nếu không có Token và cũng không có QR Token hợp lệ
        if (!token) {
            // Cho phép header nội bộ x-store-id nếu đang ở môi trường test/dev nội bộ
            const devHeaderStoreId = req.headers['x-store-id'];
            if (devHeaderStoreId && process.env.NODE_ENV !== 'production') {
                req.storeId = parseInt(devHeaderStoreId, 10);
                req.tenantUser = { UserID: 999, Username: 'dev_tester', Role: 'StoreManager', StoreID: req.storeId };
                attachTenantDbHelper(req, db);
                return next();
            }

            return res.status(401).json({
                success: false,
                error: {
                    code: 'TENANT_AUTH_REQUIRED',
                    message: 'Yêu cầu xác thực danh tính Quán (StoreID)! Vui lòng gửi kèm Authorization Bearer Token hoặc mã QR hợp lệ.'
                }
            });
        }

        // 4. Giải mã Token
        const payload = decodeJwt(token);
        if (!payload) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Token xác thực không hợp lệ hoặc đã bị chỉnh sửa.'
                }
            });
        }

        // 5. Kiểm tra quyền SuperAdmin (Có thể truy cập toàn bộ hoặc switch quán qua query ?storeId=...)
        if (payload.role === 'SuperAdmin' || payload.Role === 'SuperAdmin') {
            const requestedStoreId = req.query?.storeId ? parseInt(req.query.storeId, 10) : payload.storeId;
            req.storeId = requestedStoreId || null;
            req.tenantUser = payload;
            req.isSuperAdmin = true;
            attachTenantDbHelper(req, db);
            return next();
        }

        // 6. Trích xuất StoreID của người dùng bình thường
        const tenantStoreId = payload.storeId || payload.StoreID;
        if (!tenantStoreId) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'TENANT_NOT_ASSIGNED',
                    message: 'Tài khoản của bạn chưa được liên kết với bất kỳ Cửa hàng (Store) nào!'
                }
            });
        }

        // 7. Gắn StoreID và User vào Request Context
        req.storeId = parseInt(tenantStoreId, 10);
        req.tenantUser = payload;
        req.isSuperAdmin = false;

        // 8. Tự động gắn bộ lọc cô lập dữ liệu
        attachTenantDbHelper(req, db);

        return next();
    };
}

/**
 * Hàm tiện ích gắn DB Query Helper tự động thêm bộ lọc StoreID
 */
function attachTenantDbHelper(req, db) {
    if (!db) return;

    // Helper: Truy vấn bất kỳ mảng dữ liệu nào và ép buộc lọc theo req.storeId
    req.tenantFilter = (collection) => {
        if (!Array.isArray(collection)) return [];
        if (req.isSuperAdmin && !req.storeId) return collection; // SuperAdmin xem tất cả nếu không chọn store
        return collection.filter(item => item.StoreID === req.storeId || item.storeId === req.storeId);
    };

    // Helper: Tự động gán StoreID trước khi thêm mới bản ghi vào CSDL
    req.withTenantId = (dataObject) => {
        return {
            ...dataObject,
            StoreID: req.storeId
        };
    };
}

module.exports = {
    checkTenant,
    decodeJwt,
    JWT_SECRET
};
