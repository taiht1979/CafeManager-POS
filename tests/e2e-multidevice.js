/**
 * Kiểm thử đầu-cuối nhiều thiết bị bằng Playwright (mỗi thiết bị là một browser context riêng,
 * không chia sẻ localStorage): Waiter gọi món -> Barista nhận vé -> POS thấy đơn và thanh toán.
 * Chạy: DATABASE_URL=... JWT_SECRET=... node tests/e2e-multidevice.js
 * Cần database TEST (script xóa đơn hàng của quán 1).
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.NODE_ENV = 'development';
if (!process.env.DATABASE_URL) throw new Error('Cần DATABASE_URL trỏ tới database TEST');
if (/neon\.tech/.test(process.env.DATABASE_URL) && !process.env.ALLOW_TEST_ON_NEON) {
    throw new Error('Từ chối chạy trên Neon.');
}

const path = require('path');
const http = require('http');
const express = require('express');
const { chromium } = require('playwright');
const api = require('../api/index.js');
const db = require('../api/db.js');

const assert = require('node:assert/strict');
const OUT = process.env.E2E_OUT || '/tmp';

async function until(fn, what, ms = 12000) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < ms) {
        try { last = await fn(); if (last) return last; } catch (e) { last = e; }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Quá thời gian chờ: ' + what + (last instanceof Error ? ' (' + last.message + ')' : ''));
}

const step = (m) => console.log('[e2e]', m);
(async () => {
    step('dọn DB');
    await db.query('DELETE FROM OpenOrders');
    await db.query('DELETE FROM KdsTickets');
    await db.query('DELETE FROM OrderDetails');
    await db.query('DELETE FROM Orders');
    await db.query('DELETE FROM DailyCounters');
    await db.query(`UPDATE Stores SET BankCode='MB', BankAccountNumber='0123456789', BankAccountName='QUAN CAFE TEST', Address='1 Test', Phone='0900', Wifi='wifi-test' WHERE StoreID=1`);

    const app = express();
    app.use(api);
    app.use(express.static(path.join(__dirname, '..', 'frontend')));
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;

    step('mở trình duyệt');
    const browser = await chromium.launch();
    const errors = [];

    async function device(label, username, password, page, viewport) {
        const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 } });
        // Chặn tài nguyên ngoài (CDN, ảnh VietQR) để test không phụ thuộc mạng
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        const pg = await ctx.newPage();
        pg.on('pageerror', e => errors.push(`[${label}] pageerror: ${e.message}`));
        pg.on('console', m => { if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`); });
        // đăng nhập qua API thật, rồi đặt phiên giống màn hình đăng nhập
        await pg.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
        const res = await pg.evaluate(async ({ username, password }) => {
            const r = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            return r.json();
        }, { username, password });
        assert.ok(res.success, 'đăng nhập ' + label);
        await pg.evaluate(({ user, token }) => {
            localStorage.setItem('cafemanager_auth_user', JSON.stringify(user));
            localStorage.setItem('cafemanager_auth_token', token);
        }, { user: res.user, token: res.token });
        await pg.goto(base + '/' + page, { waitUntil: 'domcontentloaded' });
        return pg;
    }

    try {
        step('đăng nhập 4 thiết bị');
        const waiter = await device('waiter', 'waiter', 'Waiter@2345!', 'waiter-order.html', { width: 390, height: 800 });
        const pos = await device('pos', 'cashier', 'Cashier@1234!', 'pos.html');
        const barista = await device('barista', 'barista', 'Barista@3456!', 'barista.html');
        const admin = await device('admin', 'manager', 'Manager@2026!', 'store-admin-dashboard.html');

        step('1 menu');
        // 1. Menu và bàn từ server hiện ra trên điện thoại phục vụ
        await until(() => waiter.evaluate(() => getActiveMenu().length >= 5 && getActiveTables().length >= 4), 'waiter nạp menu/bàn');
        const table = await waiter.evaluate(() => {
            const t = getActiveTables().find(x => x.name === 'Bàn 02');
            switchTable(String(t.id), t.name);
            return { id: String(t.id), name: t.name };
        });
        await waiter.evaluate(() => {
            const item = getActiveMenu().find(m => m.name.includes('Muối'));
            addItemToCart({ id: item.id, name: item.name, unitPrice: item.price, quantity: 2, note: 'Size M • Đá 100%', emoji: item.emoji });
        });
        await waiter.evaluate(() => changeItemQty(cart[0].cartKey, 1));   // 2 ly
        const waiterCart = await waiter.evaluate(() => cart.length);
        assert.equal(waiterCart, 1);

        step('2 POS thấy đơn');
        // 2. POS (máy khác) tự thấy đơn của waiter mà chưa cần bấm gửi
        await until(() => pos.evaluate((k) => tableOrders[k] && tableOrders[k].cart.length === 1 && tableOrders[k].cart[0].quantity === 2, table.id), 'POS thấy đơn nháp của waiter');

        step('3 bắn bếp');
        // 3. Bắn bếp: vé xuất hiện ở barista
        await waiter.evaluate(() => submitOrderToBarista());
        await until(() => barista.evaluate(() => orders.length === 1 && orders[0].status === 'pending'), 'barista nhận vé');
        const ticket = await barista.evaluate(() => orders[0]);
        assert.equal(ticket.tableName, table.name);
        assert.equal(ticket.items[0].quantity, 2);

        step('4 gửi lần 2');
        // 4. Bấm gửi lần 2 không có món mới: không tạo vé trùng
        await waiter.evaluate(() => submitOrderToBarista());
        await new Promise(r => setTimeout(r, 800));
        assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM KdsTickets')).rows[0].n, 1, 'không được lên vé trùng');

        step('5 vé bổ sung');
        // 5. Thêm 1 ly nữa và gửi: vé mới chỉ có phần chênh lệch
        await waiter.evaluate(() => changeItemQty(cart[0].cartKey, 1));
        await waiter.evaluate(() => submitOrderToBarista());
        await until(() => barista.evaluate(() => orders.length === 2), 'barista nhận vé bổ sung');
        const delta = await barista.evaluate(() => orders[1].items[0].quantity);
        assert.equal(delta, 1, 'vé bổ sung chỉ gồm 1 ly mới thêm');

        step('6 barista');
        // 6. Barista pha chế: đổi trạng thái lưu lên server
        await barista.evaluate((id) => updateTicketStatus(id, 'brewing'), ticket.id);
        await until(async () => (await db.query(`SELECT Status FROM KdsTickets WHERE TicketCode = $1`, [ticket.id])).rows[0].status === 'brewing', 'DB: brewing');
        await barista.evaluate((id) => updateTicketStatus(id, 'ready'), ticket.id);
        await barista.screenshot({ path: path.join(OUT, 'e2e-barista.png') });

        step('7 thanh toán');
        // 7. POS thanh toán từ máy khác
        await pos.evaluate((k) => { currentSelectedTableId = k; renderFloorPlan(); }, table.id);
        await pos.waitForTimeout(300);
        const billTotal = await pos.evaluate(() => document.getElementById('bill-final-total').textContent);
        assert.match(billTotal, /113\.400/, '3 ly x 35.000 + VAT 8% (mặc định bật), thực tế: ' + billTotal);
        await pos.evaluate(() => { selectPayTab('cash'); });
        await pos.screenshot({ path: path.join(OUT, 'e2e-pos.png') });
        await pos.evaluate(() => executeCheckoutAndPrint());
        await until(() => pos.evaluate(() => invoicesHistory.length === 1), 'POS ghi nhận hóa đơn');
        const inv = await pos.evaluate(() => invoicesHistory[0]);
        assert.match(inv.code, /^HD-\d{6}-0001$/);
        assert.equal(inv.totalAmount, 113400);
        const receipt = await pos.evaluate(() => ({
            brand: document.getElementById('rec-brand-name').textContent,
            contact: document.getElementById('rec-brand-contact').textContent
        }));
        assert.equal(receipt.brand, 'AROMA COFFEE ROASTERY');
        assert.match(receipt.contact, /wifi-test/);

        step('8 waiter thấy trống');
        // 8. Điện thoại phục vụ thấy bàn đã trống (giỏ hàng bị xóa)
        await until(() => waiter.evaluate(() => cart.length === 0), 'waiter thấy bàn đã thanh toán');
        const rows = (await db.query('SELECT OrderCode, TotalAmount, PaymentMethod, CashierName FROM Orders')).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].paymentmethod, 'Cash');

        step('9 admin');
        // 9. Admin thấy hóa đơn, và có dữ liệu thật từ server (không phải dữ liệu mẫu)
        await until(() => admin.evaluate(() => storeMenu.length >= 5 && storeStaff.length >= 4), 'admin nạp dữ liệu');
        await admin.evaluate(() => refreshInvoicesList());
        await until(() => admin.evaluate(() => adminInvoices.length === 1), 'admin thấy hóa đơn');
        const bank = await admin.evaluate(() => document.getElementById('setting-bank-acc').value);
        assert.equal(bank, '0123456789');
        await admin.screenshot({ path: path.join(OUT, 'e2e-admin.png') });

        step('10 offline');
        // 10. Mất kết nối: hiện thanh cảnh báo và POS từ chối thanh toán thay vì giả vờ lưu
        await pos.context().setOffline(true);
        await until(async () => { await pos.evaluate(() => CafeStore.refreshOpenOrders()); return pos.evaluate(() => !!document.getElementById('cafestore-offline-banner')); }, 'banner mất kết nối');
        await pos.context().setOffline(false);
        await until(async () => { await pos.evaluate(() => CafeStore.refreshOpenOrders()); return pos.evaluate(() => !document.getElementById('cafestore-offline-banner')); }, 'banner biến mất khi có mạng');

        step('11 phiên giả');
        // 11. Phiên giả/cũ bị đá về trang đăng nhập
        const ctx = await browser.newContext();
        const fake = await ctx.newPage();
        await fake.addInitScript(() => {
            localStorage.setItem('cafemanager_auth_user', JSON.stringify({ role: 'StoreOwner', storeId: 1, username: 'x' }));
            localStorage.setItem('cafemanager_auth_token', 'mock_jwt_token_123');
        });
        await fake.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        await fake.goto(base + '/pos.html', { waitUntil: 'domcontentloaded' });
        await fake.waitForURL(/login\.html/, { timeout: 8000 });

        const real = errors.filter(e => !/favicon|cdn\.tailwindcss|net::ERR|Failed to load resource|vietqr|ERR_INTERNET|ERR_NAME|ERR_PROXY|ERR_TUNNEL/.test(e));
        if (real.length) {
            console.log('LỖI TRÊN TRÌNH DUYỆT:\n' + real.join('\n'));
            process.exitCode = 1;
        } else {
            console.log('E2E: TẤT CẢ BƯỚC ĐẠT');
        }
    } catch (e) {
        console.error('E2E THẤT BẠI:', e.message);
        console.error(errors.join('\n'));
        process.exitCode = 1;
    } finally {
        await browser.close();
        server.closeAllConnections();
        server.close();
        await db.getPool().end();
    }
})();
