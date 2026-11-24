/**
 * Xác thực & phân quyền cho API CafeManager POS
 *
 * - Token: JWT HS256 ký bằng JWT_SECRET (jsonwebtoken), hết hạn sau 12 giờ.
 * - Mật khẩu: băm scrypt (crypto có sẵn của Node, không cần thư viện native).
 *   Mật khẩu cũ dạng plaintext vẫn đăng nhập được 1 lần rồi tự được băm lại.
 * - Chống dò mật khẩu/PIN: giới hạn số lần đăng nhập sai theo IP (bộ nhớ tiến trình).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = '12h';
const MANAGER_ROLES = ['StoreOwner', 'StoreManager', 'Manager'];
const STORE_ROLES = [...MANAGER_ROLES, 'Cashier', 'Waiter', 'Barista'];

let devSecret = null;
function getSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    // Production/Vercel bắt buộc có JWT_SECRET (mỗi instance serverless sẽ không chia sẻ secret ngẫu nhiên)
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return null;
    if (!devSecret) {
        devSecret = crypto.randomBytes(32).toString('hex');
        console.warn('[auth] JWT_SECRET chưa đặt - dùng secret ngẫu nhiên cho môi trường dev (token mất hiệu lực khi restart).');
    }
    return devSecret;
}

function signToken(user) {
    const secret = getSecret();
    if (!secret) throw new Error('JWT_SECRET chưa được cấu hình trên server!');
    return jwt.sign(
        { uid: user.UserID, username: user.Username, role: user.Role, storeId: user.StoreID ?? null, name: user.FullName },
        secret,
        { algorithm: 'HS256', expiresIn: TOKEN_TTL }
    );
}

// ---------------------------------------------------------------- mật khẩu
function hashPassword(plain) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

function isHashed(stored) {
    return typeof stored === 'string' && stored.startsWith('scrypt$');
}

function verifyPassword(plain, stored) {
    if (plain === undefined || plain === null || !stored) return false;
    if (isHashed(stored)) {
        const [, salt, hash] = stored.split('$');
        const actual = crypto.scryptSync(String(plain), salt, 32);
        const expected = Buffer.from(hash, 'hex');
        return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
    }
    // Dữ liệu cũ (plaintext)
    const a = Buffer.from(String(plain));
    const b = Buffer.from(String(stored));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- middleware
function makeAuth(allowedRoles, needStore) {
    return (req, res, next) => {
        const secret = getSecret();
        if (!secret) return res.status(500).json({ success: false, error: 'Server chưa cấu hình JWT_SECRET!' });

        const header = req.headers['authorization'] || '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
        if (!token) return res.status(401).json({ success: false, error: 'Yêu cầu đăng nhập!' });

        let payload;
        try {
            payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
        } catch (e) {
            return res.status(401).json({ success: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn!' });
        }

        if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
            return res.status(403).json({ success: false, error: 'Bạn không có quyền thực hiện thao tác này!' });
        }

        req.auth = payload;
        // StoreID luôn lấy từ token, không tin tham số client gửi lên
        req.storeId = payload.storeId;
        if (needStore && (req.storeId === null || req.storeId === undefined)) {
            return res.status(403).json({ success: false, error: 'Tài khoản không thuộc quán nào!' });
        }
        next();
    };
}

// Yêu cầu đăng nhập + thuộc 1 quán (và đúng vai trò nếu có truyền)
const requireAuth = (...roles) => makeAuth(roles, true);
// Chỉ SuperAdmin (không gắn quán)
const requireSuperAdmin = makeAuth(['SuperAdmin'], false);

// ---------------------------------------------------------------- rate limit
const attempts = new Map();
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function loginRateLimit(req, res, next) {
    const key = req.ip || 'unknown';
    const rec = attempts.get(key);
    if (rec && Date.now() - rec.first < WINDOW_MS && rec.count >= MAX_FAILS) {
        return res.status(429).json({ success: false, error: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút!' });
    }
    req.loginKey = key;
    next();
}

function recordLoginFailure(key) {
    const now = Date.now();
    const rec = attempts.get(key);
    if (!rec || now - rec.first >= WINDOW_MS) attempts.set(key, { first: now, count: 1 });
    else rec.count++;
}

function clearLoginFailures(key) {
    attempts.delete(key);
}

module.exports = {
    MANAGER_ROLES, STORE_ROLES,
    signToken, hashPassword, verifyPassword, isHashed,
    requireAuth, requireSuperAdmin, loginRateLimit, recordLoginFailure, clearLoginFailures
};
