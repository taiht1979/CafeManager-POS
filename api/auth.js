/**
 * Xác thực JWT và phân quyền theo vai trò.
 * StoreID luôn lấy từ token đã ký, không tin giá trị client gửi lên.
 */
const jwt = require('jsonwebtoken');

const MANAGER_ROLES = ['StoreOwner', 'StoreManager', 'Manager'];
const STORE_ROLES = [...MANAGER_ROLES, 'Cashier', 'Waiter', 'Barista'];
const TOKEN_TTL = '12h';

function getSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
        return 'dev-only-secret-khong-dung-cho-production';
    }
    return null;
}

function signToken(user) {
    const secret = getSecret();
    if (!secret) throw new Error('JWT_SECRET chưa được cấu hình trên server!');
    return jwt.sign({
        userId: user.UserID,
        username: user.Username,
        fullName: user.FullName,
        role: user.Role,
        storeId: user.StoreID
    }, secret, { expiresIn: TOKEN_TTL });
}

function requireAuth(req, res, next) {
    const secret = getSecret();
    if (!secret) {
        return res.status(503).json({ success: false, error: 'Server chưa cấu hình JWT_SECRET.' });
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, error: 'Chưa đăng nhập.' });
    }
    try {
        const p = jwt.verify(token, secret);
        req.auth = p;
        // SuperAdmin không thuộc quán nào, được chọn quán qua store_id
        req.storeId = p.role === 'SuperAdmin'
            ? parseInt(req.query.store_id || req.body?.storeId, 10) || null
            : p.storeId;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.auth || !roles.includes(req.auth.role)) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền thực hiện thao tác này.' });
        }
        next();
    };
}

/** Yêu cầu request đã gắn với một quán cụ thể */
function requireStore(req, res, next) {
    if (!req.storeId) {
        return res.status(400).json({ success: false, error: 'Tài khoản này không thuộc quán nào.' });
    }
    next();
}

module.exports = { MANAGER_ROLES, STORE_ROLES, signToken, requireAuth, requireRole, requireStore };
