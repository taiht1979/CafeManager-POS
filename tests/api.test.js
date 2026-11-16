/**
 * Test tích hợp API trên Postgres thật.
 * Chạy: DATABASE_URL=... JWT_SECRET=... npm test
 * Test tự khởi động API trên cổng ngẫu nhiên và dọn dữ liệu đơn hàng trước khi chạy.
 * KHÔNG chạy trên database production: test xóa OpenOrders, KdsTickets, Orders của quán 1 và 2.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.NODE_ENV = 'development';
if (!process.env.DATABASE_URL) throw new Error('Cần DATABASE_URL trỏ tới database TEST');
if (/neon\.tech/.test(process.env.DATABASE_URL) && !process.env.ALLOW_TEST_ON_NEON) {
    throw new Error('Từ chối chạy test trên Neon. Dùng database local hoặc đặt ALLOW_TEST_ON_NEON=1 nếu chắc chắn.');
}

const app = require('../api/index.js');
const db = require('../api/db.js');

let server, base;
const tokens = {};

async function call(method, path, { token, body } = {}) {
    const res = await fetch(base + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
}

async function login(username, password) {
    const r = await call('POST', '/api/auth/login', { body: { username, password } });
    assert.equal(r.status, 200, `login ${username}: ${JSON.stringify(r.json)}`);
    return r.json.token;
}

test.before(async () => {
    server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;

    await db.query('DELETE FROM OpenOrders');
    await db.query('DELETE FROM KdsTickets');
    await db.query('DELETE FROM OrderDetails');
    await db.query('DELETE FROM Orders');
    await db.query('DELETE FROM DailyCounters');
    await db.query(`DELETE FROM StaffUsers WHERE Username = 'store2_manager'`);
    await db.query(`
        INSERT INTO StaffUsers (StoreID, Username, Password, Pin, FullName, Role, Phone)
        VALUES (2, 'store2_manager', 'Store2@pass', '5555', 'Quản lý quán 2', 'StoreOwner', '0900000002')
    `);

    tokens.manager = await login('manager', 'Manager@2026!');
    tokens.cashier = await login('cashier', 'Cashier@1234!');
    tokens.waiter = await login('waiter', 'Waiter@2345!');
    tokens.barista = await login('barista', 'Barista@3456!');
    tokens.store2 = await login('store2_manager', 'Store2@pass');
});

test.after(async () => {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
    await db.getPool().end();
});

const cart = (qty = 2, price = 35000) => ({
    cart: [{ id: 1, name: 'Cà Phê Muối Đặc Biệt', unitPrice: price, quantity: qty, note: 'Size M', cartKey: 1 }],
    orderMode: 'dine-in',
    status: 'occupied',
    openedAt: Date.now()
});

test('Xác thực: không token, token giả và mật khẩu sai đều bị từ chối', async () => {
    assert.equal((await call('GET', '/api/open-orders')).status, 401);
    // Token kiểu cũ: base64 JSON không có chữ ký
    const forged = Buffer.from(JSON.stringify({ role: 'StoreOwner', storeId: 1, exp: Date.now() + 1e8 })).toString('base64');
    assert.equal((await call('GET', '/api/staff', { token: forged })).status, 401);
    const bad = await call('POST', '/api/auth/login', { body: { username: 'manager', password: 'sai' } });
    assert.equal(bad.status, 401);
    const pin = await call('POST', '/api/auth/pin', { body: { pin: '3456' } });
    assert.equal(pin.status, 200);
    assert.ok(pin.json.token);
});

test('Phân quyền theo vai trò', async () => {
    assert.equal((await call('GET', '/api/staff', { token: tokens.waiter })).status, 403);
    assert.equal((await call('POST', '/api/menu', { token: tokens.cashier, body: { name: 'X' } })).status, 403);
    assert.equal((await call('GET', '/api/staff', { token: tokens.manager })).status, 200);
    const staff = (await call('GET', '/api/staff', { token: tokens.manager })).json.data;
    assert.ok(staff.length >= 4);
    assert.ok(!JSON.stringify(staff).includes('Manager@2026!'), 'Không được trả mật khẩu về client');
    assert.equal((await call('GET', '/api/stores', { token: tokens.manager })).status, 403);
});

test('Bootstrap trả bàn, menu, topping đúng quán', async () => {
    const r = await call('GET', '/api/bootstrap', { token: tokens.waiter });
    assert.equal(r.status, 200);
    assert.ok(r.json.data.menu.length >= 5);
    assert.ok(r.json.data.tables.length >= 3);
    assert.equal(r.json.data.store.id, 1);
    const r2 = await call('GET', '/api/bootstrap', { token: tokens.store2 });
    assert.equal(r2.json.data.store.id, 2);
    assert.equal(r2.json.data.menu.length, 0);
});

test('Đơn đang mở: tạo, sửa, xung đột phiên bản', async () => {
    const create = await call('PUT', '/api/open-orders/2', { token: tokens.waiter, body: { data: cart(), baseVersion: 0 } });
    assert.equal(create.status, 200);
    assert.equal(create.json.version, 1);

    // POS (thiết bị khác) thấy ngay đơn của waiter
    const list = await call('GET', '/api/open-orders', { token: tokens.cashier });
    assert.equal(list.json.data['2'].cart[0].quantity, 2);
    assert.equal(list.json.data['2']._v, 1);

    const upd = await call('PUT', '/api/open-orders/2', { token: tokens.cashier, body: { data: cart(3), baseVersion: 1 } });
    assert.equal(upd.json.version, 2);

    // Waiter còn giữ bản cũ (v1) -> bị từ chối, kèm bản mới nhất
    const stale = await call('PUT', '/api/open-orders/2', { token: tokens.waiter, body: { data: cart(9), baseVersion: 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.current.cart[0].quantity, 3);

    // Tạo mới trên bàn đã có đơn cũng là xung đột
    const dupCreate = await call('PUT', '/api/open-orders/2', { token: tokens.waiter, body: { data: cart(), baseVersion: 0 } });
    assert.equal(dupCreate.status, 409);

    // Dữ liệu sai
    const badQty = await call('PUT', '/api/open-orders/5', { token: tokens.waiter, body: { data: cart(0), baseVersion: 0 } });
    assert.equal(badQty.status, 400);
    const badKey = await call('PUT', '/api/open-orders/a%20b', { token: tokens.waiter, body: { data: cart(), baseVersion: 0 } });
    assert.equal(badKey.status, 400);
    const badPrice = await call('PUT', '/api/open-orders/5', { token: tokens.waiter, body: { data: { cart: [{ unitPrice: -1, quantity: 1 }] }, baseVersion: 0 } });
    assert.equal(badPrice.status, 400);
});

test('Barista không được sửa đơn đang mở, nhưng thấy vé và cập nhật trạng thái', async () => {
    assert.equal((await call('PUT', '/api/open-orders/7', { token: tokens.barista, body: { data: cart(), baseVersion: 0 } })).status, 403);

    const t = await call('POST', '/api/kds', {
        token: tokens.waiter,
        body: { tableKey: '2', tableName: 'Bàn 02', items: [{ name: 'Cà Phê Muối', quantity: 2, note: 'Size M • Đá 100%' }] }
    });
    assert.equal(t.status, 200);
    const id = t.json.data.id;
    assert.match(id, /^TKT-\d{3}-\d{6}$/);

    let q = await call('GET', '/api/kds', { token: tokens.barista });
    assert.ok(q.json.data.find(x => x.id === id && x.status === 'pending'));
    assert.equal(q.json.data.find(x => x.id === id).waiterName, 'Hoàng Nhân (Order Bàn)');

    assert.equal((await call('PATCH', `/api/kds/${id}`, { token: tokens.barista, body: { status: 'brewing' } })).status, 200);
    assert.equal((await call('PATCH', `/api/kds/${id}`, { token: tokens.barista, body: { status: 'ready' } })).status, 200);
    assert.equal((await call('PATCH', `/api/kds/${id}`, { token: tokens.barista, body: { status: 'bậy' } })).status, 400);
    assert.equal((await call('PATCH', `/api/kds/TKT-999`, { token: tokens.barista, body: { status: 'ready' } })).status, 404);

    // Quán 2 không thấy vé của quán 1 và không sửa được
    assert.equal((await call('GET', '/api/kds', { token: tokens.store2 })).json.data.length, 0);
    assert.equal((await call('PATCH', `/api/kds/${id}`, { token: tokens.store2, body: { status: 'served' } })).status, 404);

    await call('PATCH', `/api/kds/${id}`, { token: tokens.barista, body: { status: 'served' } });
    q = await call('GET', '/api/kds', { token: tokens.barista });
    assert.ok(!q.json.data.find(x => x.id === id), 'Vé đã bưng ra không còn trong danh sách');

    assert.equal((await call('POST', '/api/kds', { token: tokens.waiter, body: { tableKey: '2', tableName: 'Bàn 02', items: [] } })).status, 400);
});

let invoiceCode;
test('Thanh toán: server tự tính tiền, ghi DB, xóa đơn mở', async () => {
    // Bàn 2 đang có 3 ly x 35.000 = 105.000
    const noPerm = await call('POST', '/api/orders/checkout', { token: tokens.waiter, body: { tableKey: '2', payMethod: 'cash' } });
    assert.equal(noPerm.status, 403);

    const badMethod = await call('POST', '/api/orders/checkout', { token: tokens.cashier, body: { tableKey: '2', payMethod: 'bitcoin' } });
    assert.equal(badMethod.status, 400);

    const pay = await call('POST', '/api/orders/checkout', {
        token: tokens.cashier,
        body: {
            tableKey: '2', payMethod: 'cash', vat: true, directDiscount: 5000, discountReason: 'Khách quen',
            customer: { name: 'An', discountPercent: 10 },
            // Client gửi số tổng sai cũng không được tin
            total: 1
        }
    });
    assert.equal(pay.status, 200, JSON.stringify(pay.json));
    const inv = pay.json.data;
    // 105.000 - 10.500 (thành viên) - 5.000 = 89.500; VAT 8% = 7.160; tổng 96.660
    assert.equal(inv.totalAmount, 96660);
    assert.equal(inv.subtotal, '105.000 đ');
    assert.equal(inv.vat, '7.160 đ');
    assert.equal(inv.payMethod, 'Tiền mặt');
    assert.equal(inv.cashier, 'Trần Thu Ngân (Aroma POS)');
    assert.match(inv.code, /^HD-\d{6}-0001$/);
    invoiceCode = inv.code;

    // Đơn mở đã bị xóa; thanh toán lần 2 bị từ chối, không tạo hóa đơn trùng
    const open = await call('GET', '/api/open-orders', { token: tokens.cashier });
    assert.equal(open.json.data['2'], undefined);
    const again = await call('POST', '/api/orders/checkout', { token: tokens.cashier, body: { tableKey: '2', payMethod: 'cash' } });
    assert.equal(again.status, 409);

    const rows = await db.query('SELECT OrderCode, TotalAmount, PaymentStatus FROM Orders WHERE StoreID = 1');
    assert.equal(rows.rows.length, 1);
    assert.equal(Number(rows.rows[0].totalamount), 96660);
    const det = await db.query('SELECT ItemID, ItemNameSnapshot, Quantity FROM OrderDetails');
    assert.equal(det.rows.length, 1);
    assert.equal(det.rows[0].quantity, 3);
    assert.equal(det.rows[0].itemid, 1);
});

test('Thanh toán song song: mã hóa đơn không trùng', async () => {
    const keys = ['11', '12', '13', '14', '15', 'takeaway'];
    for (const k of keys) {
        const r = await call('PUT', `/api/open-orders/${k}`, { token: tokens.cashier, body: { data: cart(1), baseVersion: 0 } });
        assert.equal(r.status, 200);
    }
    const results = await Promise.all(keys.map(k =>
        call('POST', '/api/orders/checkout', { token: tokens.cashier, body: { tableKey: k, payMethod: 'vietqr' } })));
    results.forEach(r => assert.equal(r.status, 200, JSON.stringify(r.json)));
    const codes = results.map(r => r.json.data.code);
    assert.equal(new Set(codes).size, codes.length);
    const take = results[5].json.data;
    assert.equal(take.tableName, 'Đơn Mang Đi');
    assert.equal(take.payMethod, 'VietQR Napas');
});

test('Danh sách hóa đơn theo ngày, cô lập giữa các quán', async () => {
    const r = await call('GET', '/api/orders', { token: tokens.cashier });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.length, 7);
    assert.ok(r.json.data.find(i => i.code === invoiceCode));
    assert.equal((await call('GET', '/api/orders', { token: tokens.waiter })).status, 403);
    assert.equal((await call('GET', '/api/orders', { token: tokens.store2 })).json.data.length, 0);
    assert.equal((await call('GET', '/api/orders?date=2000-01-01', { token: tokens.manager })).json.data.length, 0);
});

test('Hủy hóa đơn: cần Quản lý, ghi người duyệt, quán khác không hủy được', async () => {
    const noPin = await call('POST', '/api/orders/void', { token: tokens.cashier, body: { code: invoiceCode, reason: 'Nhầm' } });
    assert.equal(noPin.status, 403);
    // PIN của chính thu ngân (1234) không phải PIN quản lý
    const cashierPin = await call('POST', '/api/orders/void', { token: tokens.cashier, body: { code: invoiceCode, pin: '1234' } });
    assert.equal(cashierPin.status, 403);
    // PIN quản lý quán khác không có giá trị
    const otherStorePin = await call('POST', '/api/orders/void', { token: tokens.cashier, body: { code: invoiceCode, pin: '5555' } });
    assert.equal(otherStorePin.status, 403);
    assert.equal((await call('POST', '/api/orders/void', { token: tokens.waiter, body: { code: invoiceCode } })).status, 403);
    // Quản lý quán 2 không thấy hóa đơn quán 1
    assert.equal((await call('POST', '/api/orders/void', { token: tokens.store2, body: { code: invoiceCode } })).status, 404);

    const ok = await call('POST', '/api/orders/void', { token: tokens.cashier, body: { code: invoiceCode, pin: '8888', reason: 'Khách đổi ý' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.data.status, 'Cancelled');
    assert.equal(ok.json.data.cancelledBy, 'Lê Hữu Nghĩa (Chủ Quán Aroma)');
    assert.equal((await call('POST', '/api/orders/void', { token: tokens.manager, body: { code: invoiceCode } })).status, 404);
});

test('Quản lý sửa phương thức thanh toán của hóa đơn', async () => {
    const list = (await call('GET', '/api/orders', { token: tokens.manager })).json.data;
    const inv = list.find(i => i.status === 'Completed' && i.payMethod === 'VietQR Napas');
    assert.ok(inv);
    assert.equal((await call('PATCH', `/api/orders/${inv.code}/payment`, { token: tokens.cashier, body: { payMethod: 'cash' } })).status, 403);
    assert.equal((await call('PATCH', `/api/orders/${inv.code}/payment`, { token: tokens.manager, body: { payMethod: 'xx' } })).status, 400);
    const ok = await call('PATCH', `/api/orders/${inv.code}/payment`, { token: tokens.manager, body: { payMethod: 'cash', note: 'Khách trả tiền mặt' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.payMethod, 'Tiền mặt');
    assert.equal((await call('PATCH', `/api/orders/${inv.code}/payment`, { token: tokens.store2, body: { payMethod: 'cash' } })).status, 404);
});

test('Quản lý lưu món và bàn qua API, PIN nhân viên không được trùng', async () => {
    const m = await call('POST', '/api/menu', { token: tokens.manager, body: { name: 'Món Test', price: 12345, cat: 'Cà Phê', sku: 'T-1' } });
    assert.equal(m.status, 200);
    assert.equal(m.json.data.price, 12345);
    const m2 = await call('POST', '/api/menu', { token: tokens.manager, body: { id: m.json.data.id, name: 'Món Test 2', price: 20000, sku: 'T-1', available: false } });
    assert.equal(m2.json.data.name, 'Món Test 2');
    assert.equal(m2.json.data.available, false);
    assert.equal((await call('DELETE', `/api/menu/${m.json.data.id}`, { token: tokens.manager })).status, 200);

    const t = await call('POST', '/api/tables', { token: tokens.manager, body: { name: 'Bàn Test', area: 'Khu T', capacity: 2, status: 'active' } });
    assert.equal(t.status, 200, JSON.stringify(t.json));
    const dupTable = await call('POST', '/api/tables', { token: tokens.manager, body: { name: 'Bàn Test' } });
    assert.equal(dupTable.status, 409);
    await call('PUT', `/api/open-orders/${t.json.data.id}`, { token: tokens.cashier, body: { data: cart(1), baseVersion: 0 } });
    assert.equal((await call('DELETE', `/api/tables/${t.json.data.id}`, { token: tokens.manager })).status, 409);
    await call('DELETE', `/api/open-orders/${t.json.data.id}`, { token: tokens.cashier });
    assert.equal((await call('DELETE', `/api/tables/${t.json.data.id}`, { token: tokens.manager })).status, 200);

    const dupPin = await call('POST', '/api/staff', { token: tokens.manager, body: { name: 'NV Mới', role: 'Waiter', pin: '1234', username: 'nvmoi' } });
    assert.equal(dupPin.status, 409);
    const okStaff = await call('POST', '/api/staff', { token: tokens.manager, body: { name: 'NV Mới', role: 'Waiter', pin: '7777', username: 'nvmoi' } });
    assert.equal(okStaff.status, 200);
    await call('DELETE', `/api/staff/${okStaff.json.data.id}`, { token: tokens.manager });
});
