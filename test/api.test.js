// Chạy: npm test   (mock mode) hoặc DATABASE_URL=... npm test (kiểm thử với Postgres thật)
process.env.NODE_ENV = 'development';
process.env.VERCEL = '';
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../api/index.js');

let base;
let server;
test.before(async () => {
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, json: await res.json().catch(() => null) };
};
const login = async (username, password) => (await call('POST', '/auth/login', { body: { username, password } })).json.token;

test('đăng nhập đúng/sai mật khẩu, PIN không thay được mật khẩu', async () => {
    assert.equal((await call('POST', '/auth/login', { body: { username: 'manager', password: 'Manager@2026!' } })).status, 200);
    assert.equal((await call('POST', '/auth/login', { body: { username: 'manager', password: 'sai' } })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { username: 'manager', password: '8888' } })).status, 401);
    assert.equal((await call('POST', '/auth/pin', { body: { pin: '8888' } })).status, 200);
    assert.equal((await call('POST', '/auth/pin', { body: { pin: '12' } })).status, 400);
});

test('API không có token bị chặn; token giả/không chữ ký bị từ chối', async () => {
    for (const p of ['/staff', '/menu', '/tables', '/orders', '/stores', '/barista/queue']) {
        assert.equal((await call('GET', p)).status, 401, p);
    }
    assert.equal((await call('DELETE', '/staff/5')).status, 401);
    const forged = Buffer.from(JSON.stringify({ role: 'SuperAdmin', storeId: 1 })).toString('base64');
    assert.equal((await call('GET', '/staff', { token: forged })).status, 401);
    const wrongKey = jwt.sign({ role: 'StoreOwner', storeId: 1 }, 'khac');
    assert.equal((await call('GET', '/staff', { token: wrongKey })).status, 401);
    const none = jwt.sign({ role: 'StoreOwner', storeId: 1 }, '', { algorithm: 'none' });
    assert.equal((await call('GET', '/staff', { token: none })).status, 401);
});

test('phân quyền theo vai trò', async () => {
    const cashier = await login('cashier', 'Cashier@1234!');
    const manager = await login('manager', 'Manager@2026!');
    const superadmin = await login('superadmin', 'SuperAdmin@2026!');
    assert.equal((await call('GET', '/staff', { token: cashier })).status, 403);
    assert.equal((await call('POST', '/menu', { token: cashier, body: { name: 'x' } })).status, 403);
    assert.equal((await call('POST', '/orders/void', { token: cashier, body: { code: 'A' } })).status, 403);
    assert.equal((await call('GET', '/menu', { token: cashier })).status, 200);
    assert.ok([200, 404].includes((await call('POST', '/orders/void', { token: manager, body: { code: 'A' } })).status)); // 404 khi chạy với DB thật (không có đơn)
    assert.equal((await call('GET', '/stores', { token: manager })).status, 403);
    assert.equal((await call('GET', '/stores', { token: superadmin })).status, 200);
    assert.equal((await call('GET', '/menu', { token: superadmin })).status, 403);
});

test('GET /staff không lộ mật khẩu; PIN trùng bị từ chối; không tự xóa mình', async () => {
    const manager = await login('manager', 'Manager@2026!');
    const r = await call('GET', '/staff', { token: manager });
    assert.ok(r.json.data.length >= 4);
    for (const s of r.json.data) { assert.equal(s.Password, undefined); assert.equal(s.PasswordHash, undefined); }
    const dup = await call('POST', '/staff', { token: manager, body: { name: 'Trùng', role: 'Waiter', pin: '1234', username: 'trung' } });
    assert.equal(dup.status, 409);
    const bad = await call('POST', '/staff', { token: manager, body: { name: 'X', role: 'SuperAdmin', pin: '7777' } });
    assert.equal(bad.status, 400);
    const ok = await call('POST', '/staff', { token: manager, body: { name: 'Mới', role: 'Waiter', pin: '7777', username: 'moi' } });
    assert.equal(ok.status, 200);
    assert.equal((await call('POST', '/auth/login', { body: { username: 'moi', password: '7777' } })).status, 200);
    const me = jwt.decode(manager).uid;
    assert.equal((await call('DELETE', '/staff/' + me, { token: manager })).status, 400);
});

test('StoreID lấy từ token, client không giả được store khác', async () => {
    const manager = await login('manager', 'Manager@2026!');
    const r = await call('POST', '/menu', { token: manager, body: { name: 'Món X', price: 1000, storeId: 999 } });
    assert.equal(r.status, 200);
    const list = await call('GET', '/menu?store_id=999', { token: manager });
    assert.ok(list.json.data.every(m => (m.StoreID ?? m.storeid) === 1));
});

test('rate limit đăng nhập sai', async () => {
    let last;
    for (let i = 0; i < 12; i++) last = await call('POST', '/auth/pin', { body: { pin: '0000' } });
    assert.equal(last.status, 429);
});

test('JSON sai cú pháp trả JSON 400', async () => {
    const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).success, false);
});
