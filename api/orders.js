/**
 * Đơn hàng thời gian thực: đơn đang mở theo bàn, vé pha chế (KDS),
 * thanh toán (checkout), danh sách và hủy hóa đơn.
 * Mọi truy vấn đều lọc theo req.storeId lấy từ JWT.
 */
const express = require('express');
const db = require('./db');
const { MANAGER_ROLES, requireRole, requireStore } = require('./auth');

const router = express.Router();
router.use(requireStore);

const VN_TZ = 'Asia/Ho_Chi_Minh';
const OPEN_ORDER_MAX_BYTES = 200 * 1024;
const PAY_METHODS = {
    vietqr: { db: 'VietQR', label: 'VietQR Napas' },
    cash: { db: 'Cash', label: 'Tiền mặt' },
    card: { db: 'Card', label: 'Thẻ POS' }
};
const KDS_STATUSES = ['pending', 'brewing', 'ready', 'served', 'cancelled'];

function fmtMoney(n) {
    return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
}

function fmtTimeVN(d) {
    return new Date(d).toLocaleString('vi-VN', { timeZone: VN_TZ });
}

/** Số thứ tự tăng dần theo quán + loại + ngày (giờ Việt Nam), an toàn khi nhiều thiết bị cùng gọi */
async function nextCounter(client, storeId, kind) {
    const r = await client.query(`
        INSERT INTO DailyCounters (StoreID, Kind, Day, LastValue)
        VALUES ($1, $2, (CURRENT_TIMESTAMP AT TIME ZONE '${VN_TZ}')::date, 1)
        ON CONFLICT (StoreID, Kind, Day) DO UPDATE SET LastValue = DailyCounters.LastValue + 1
        RETURNING LastValue, to_char(Day, 'YYMMDD') AS daystr
    `, [storeId, kind]);
    return { n: r.rows[0].lastvalue, day: r.rows[0].daystr };
}

function validTableKey(key) {
    return typeof key === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(key);
}

function wrap(fn) {
    return (req, res) => fn(req, res).catch(err => {
        console.error('❌ [orders]', req.method, req.originalUrl, err.message);
        res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
    });
}

// -----------------------------------------------------------------------------
// ĐƠN ĐANG MỞ THEO BÀN (giỏ hàng chung Waiter <-> POS)
// -----------------------------------------------------------------------------
router.get('/open-orders', wrap(async (req, res) => {
    const r = await db.query(
        'SELECT TableKey, Data, Version FROM OpenOrders WHERE StoreID = $1', [req.storeId]);
    const data = {};
    r.rows.forEach(row => { data[row.tablekey] = { ...row.data, _v: row.version }; });
    res.json({ success: true, data, serverTime: Date.now() });
}));

router.put('/open-orders/:key', requireRole(...MANAGER_ROLES, 'Cashier', 'Waiter'), wrap(async (req, res) => {
    const key = req.params.key;
    if (!validTableKey(key)) return res.status(400).json({ success: false, error: 'Mã bàn không hợp lệ.' });

    const body = req.body || {};
    const order = body.data;
    const baseVersion = parseInt(body.baseVersion, 10) || 0;
    if (!order || !Array.isArray(order.cart)) {
        return res.status(400).json({ success: false, error: 'Dữ liệu đơn không hợp lệ.' });
    }
    for (const it of order.cart) {
        if (!it || !(Number(it.unitPrice) >= 0) || !Number.isInteger(Number(it.quantity)) || Number(it.quantity) <= 0) {
            return res.status(400).json({ success: false, error: 'Món trong đơn có giá hoặc số lượng không hợp lệ.' });
        }
    }
    const clean = { ...order };
    delete clean._v;
    const json = JSON.stringify(clean);
    if (Buffer.byteLength(json) > OPEN_ORDER_MAX_BYTES) {
        return res.status(413).json({ success: false, error: 'Đơn quá lớn.' });
    }
    const who = req.auth.fullName || req.auth.username;

    if (baseVersion === 0) {
        // Tạo mới: nếu bàn đã có đơn do thiết bị khác tạo trước thì báo xung đột
        const ins = await db.query(`
            INSERT INTO OpenOrders (StoreID, TableKey, Data, UpdatedBy)
            VALUES ($1, $2, $3::jsonb, $4)
            ON CONFLICT (StoreID, TableKey) DO NOTHING
            RETURNING Version
        `, [req.storeId, key, json, who]);
        if (ins.rows.length) return res.json({ success: true, version: ins.rows[0].version });
    } else {
        const upd = await db.query(`
            UPDATE OpenOrders SET Data = $3::jsonb, Version = Version + 1, UpdatedBy = $4, UpdatedAt = CURRENT_TIMESTAMP
            WHERE StoreID = $1 AND TableKey = $2 AND Version = $5
            RETURNING Version
        `, [req.storeId, key, json, who, baseVersion]);
        if (upd.rows.length) return res.json({ success: true, version: upd.rows[0].version });
    }
    const cur = await db.query(
        'SELECT Data, Version FROM OpenOrders WHERE StoreID = $1 AND TableKey = $2', [req.storeId, key]);
    return res.status(409).json({
        success: false,
        conflict: true,
        error: 'Bàn vừa được thay đổi ở thiết bị khác.',
        current: cur.rows.length ? { ...cur.rows[0].data, _v: cur.rows[0].version } : null
    });
}));

router.delete('/open-orders/:key', requireRole(...MANAGER_ROLES, 'Cashier', 'Waiter'), wrap(async (req, res) => {
    const key = req.params.key;
    if (!validTableKey(key)) return res.status(400).json({ success: false, error: 'Mã bàn không hợp lệ.' });
    await db.query('DELETE FROM OpenOrders WHERE StoreID = $1 AND TableKey = $2', [req.storeId, key]);
    res.json({ success: true });
}));

// -----------------------------------------------------------------------------
// VÉ PHA CHẾ (KDS)
// -----------------------------------------------------------------------------
function ticketToClient(row) {
    return {
        id: row.ticketcode,
        tableId: row.tablekey,
        tableName: row.tablename,
        waiterName: row.waitername,
        items: row.items,
        status: row.status,
        timestamp: new Date(row.createdat).getTime(),
        time: new Date(row.createdat).toLocaleTimeString('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit' })
    };
}

router.get('/kds', wrap(async (req, res) => {
    // Chỉ các vé chưa bưng ra bàn (pending, brewing, ready)
    const r = await db.query(`
        SELECT * FROM KdsTickets
        WHERE StoreID = $1 AND Status IN ('pending', 'brewing', 'ready')
        ORDER BY CreatedAt ASC
    `, [req.storeId]);
    res.json({ success: true, data: r.rows.map(ticketToClient), serverTime: Date.now() });
}));

router.post('/kds', requireRole(...MANAGER_ROLES, 'Cashier', 'Waiter'), wrap(async (req, res) => {
    const { tableKey, tableName, items } = req.body || {};
    if (!validTableKey(String(tableKey)) || !tableName) {
        return res.status(400).json({ success: false, error: 'Thiếu thông tin bàn.' });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
        return res.status(400).json({ success: false, error: 'Vé pha chế phải có từ 1 đến 100 món.' });
    }
    const cleanItems = items.map(i => ({
        name: String(i.name || '').slice(0, 150),
        size: i.size ? String(i.size).slice(0, 10) : undefined,
        quantity: Math.max(1, parseInt(i.quantity, 10) || 1),
        note: String(i.note || '').slice(0, 300)
    }));
    const ticket = await db.withTransaction(async (client) => {
        const { n, day } = await nextCounter(client, req.storeId, 'ticket');
        const code = `TKT-${String(n).padStart(3, '0')}`;
        const r = await client.query(`
            INSERT INTO KdsTickets (StoreID, TicketCode, TableKey, TableName, WaiterName, Items)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING *
        `, [req.storeId, `${code}-${day}`, String(tableKey), String(tableName).slice(0, 100),
            req.auth.fullName || req.auth.username, JSON.stringify(cleanItems)]);
        return r.rows[0];
    });
    const out = ticketToClient(ticket);
    out.id = ticket.ticketcode;
    res.json({ success: true, data: out });
}));

router.patch('/kds/:code', wrap(async (req, res) => {
    const status = req.body && req.body.status;
    if (!KDS_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: 'Trạng thái vé không hợp lệ.' });
    }
    const r = await db.query(`
        UPDATE KdsTickets SET Status = $3, UpdatedAt = CURRENT_TIMESTAMP
        WHERE StoreID = $1 AND TicketCode = $2 RETURNING *
    `, [req.storeId, req.params.code, status]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Không tìm thấy vé.' });
    res.json({ success: true, data: ticketToClient(r.rows[0]) });
}));

// -----------------------------------------------------------------------------
// THANH TOÁN
// -----------------------------------------------------------------------------
router.post('/orders/checkout', requireRole(...MANAGER_ROLES, 'Cashier'), wrap(async (req, res) => {
    const { tableKey, payMethod, vat, directDiscount, discountReason, customer } = req.body || {};
    const method = PAY_METHODS[payMethod];
    if (!validTableKey(String(tableKey)) || !method) {
        return res.status(400).json({ success: false, error: 'Thiếu bàn hoặc phương thức thanh toán không hợp lệ.' });
    }

    const result = await db.withTransaction(async (client) => {
        const open = await client.query(
            'SELECT Data FROM OpenOrders WHERE StoreID = $1 AND TableKey = $2 FOR UPDATE',
            [req.storeId, String(tableKey)]);
        if (!open.rows.length) {
            return { error: 'Bàn này không còn đơn đang mở (có thể đã được thanh toán ở thiết bị khác).', status: 409 };
        }
        const order = open.rows[0].data;
        const cart = Array.isArray(order.cart) ? order.cart : [];
        if (!cart.length) return { error: 'Đơn rỗng.', status: 400 };

        // Tính lại tiền trên server, không tin số tổng do client gửi
        const subtotal = cart.reduce((s, i) => s + Number(i.unitPrice) * Number(i.quantity), 0);
        const cust = customer || order.customer || null;
        const pct = cust ? Math.min(100, Math.max(0, Number(cust.discountPercent) || 0)) : 0;
        const memberDiscount = subtotal * pct / 100;
        const direct = Math.min(subtotal - memberDiscount, Math.max(0, Number(directDiscount) || 0));
        const totalDiscount = memberDiscount + direct;
        const afterDiscount = Math.max(0, subtotal - totalDiscount);
        const vatAmount = vat ? Math.round(afterDiscount * 0.08) : 0;
        const total = afterDiscount + vatAmount;

        const { n, day } = await nextCounter(client, req.storeId, 'invoice');
        const code = `HD-${day}-${String(n).padStart(4, '0')}`;

        const isTakeaway = String(tableKey) === 'takeaway';
        let tableId = null;
        let tableName = isTakeaway ? 'Đơn Mang Đi' : null;
        if (!isTakeaway && /^\d+$/.test(String(tableKey))) {
            const t = await client.query(
                'SELECT TableID, TableName FROM Tables WHERE StoreID = $1 AND TableID = $2', [req.storeId, Number(tableKey)]);
            if (t.rows.length) { tableId = t.rows[0].tableid; tableName = t.rows[0].tablename; }
        }
        if (!tableName) tableName = order.tableName || `Bàn ${tableKey}`;
        const cashierName = req.auth.fullName || req.auth.username;

        const ord = await client.query(`
            INSERT INTO Orders (StoreID, OrderCode, TableID, TableKey, TableName, CashierUserID, CashierName,
                OrderType, OrderStatus, PaymentStatus, PaymentMethod, Subtotal, DiscountAmount, TaxAmount, TotalAmount,
                DiscountReason, ItemsJSON, CustomerJSON, ClosedAt)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Completed','Paid',$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,CURRENT_TIMESTAMP)
            RETURNING OrderID, ClosedAt
        `, [req.storeId, code, tableId, String(tableKey), tableName, req.auth.userId || null, cashierName,
            isTakeaway ? 'TakeAway' : 'DineIn', method.db, subtotal, totalDiscount, vatAmount, total,
            discountReason ? String(discountReason).slice(0, 200) : null,
            JSON.stringify(cart), cust ? JSON.stringify(cust) : null]);

        const ids = [...new Set(cart.map(i => parseInt(i.id, 10)).filter(Number.isFinite))];
        const known = new Set();
        if (ids.length) {
            const m = await client.query(
                'SELECT ItemID FROM MenuItems WHERE StoreID = $1 AND ItemID = ANY($2::int[])', [req.storeId, ids]);
            m.rows.forEach(r => known.add(r.itemid));
        }
        for (const i of cart) {
            const itemId = parseInt(i.id, 10);
            await client.query(`
                INSERT INTO OrderDetails (StoreID, OrderID, ItemID, ItemNameSnapshot, UnitPrice, Quantity,
                    TotalLineAmount, CustomerNote, BaristaStatus)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Served')
            `, [req.storeId, ord.rows[0].orderid, known.has(itemId) ? itemId : null,
                String(i.name || '').slice(0, 150), Number(i.unitPrice), Number(i.quantity),
                Number(i.unitPrice) * Number(i.quantity), i.note ? String(i.note).slice(0, 300) : null]);
        }

        await client.query('DELETE FROM OpenOrders WHERE StoreID = $1 AND TableKey = $2', [req.storeId, String(tableKey)]);

        return {
            invoice: {
                code,
                time: fmtTimeVN(ord.rows[0].closedat),
                tableId: String(tableKey),
                tableName,
                items: cart,
                subtotal: fmtMoney(subtotal),
                discount: '-' + fmtMoney(totalDiscount),
                vat: fmtMoney(vatAmount),
                total: fmtMoney(total),
                totalAmount: total,
                payMethod: method.label,
                cashier: cashierName,
                status: 'Completed'
            }
        };
    });

    if (result.error) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.invoice });
}));

// -----------------------------------------------------------------------------
// DANH SÁCH HÓA ĐƠN
// -----------------------------------------------------------------------------
function orderToInvoice(r) {
    const method = Object.values(PAY_METHODS).find(m => m.db === r.paymentmethod);
    return {
        code: r.ordercode,
        time: fmtTimeVN(r.closedat || r.createdat),
        tableId: r.tablekey,
        tableName: r.tablename,
        items: r.itemsjson || [],
        subtotal: fmtMoney(Number(r.subtotal)),
        discount: '-' + fmtMoney(Number(r.discountamount)),
        vat: fmtMoney(Number(r.taxamount)),
        total: fmtMoney(Number(r.totalamount)),
        totalAmount: Number(r.totalamount),
        payMethod: method ? method.label : r.paymentmethod,
        cashier: r.cashiername,
        status: r.orderstatus,
        cancelReason: r.cancelreason || null,
        cancelledBy: r.cancelledby || null
    };
}

router.get('/orders', requireRole(...MANAGER_ROLES, 'Cashier'), wrap(async (req, res) => {
    // date=YYYY-MM-DD theo giờ Việt Nam, mặc định hôm nay
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
    const r = await db.query(`
        SELECT * FROM Orders
        WHERE StoreID = $1
          AND (COALESCE(ClosedAt, CreatedAt) AT TIME ZONE '${VN_TZ}')::date
              = COALESCE($2::date, (CURRENT_TIMESTAMP AT TIME ZONE '${VN_TZ}')::date)
        ORDER BY OrderID DESC
        LIMIT 500
    `, [req.storeId, date]);
    res.json({ success: true, data: r.rows.map(orderToInvoice) });
}));

// -----------------------------------------------------------------------------
// HỦY HÓA ĐƠN: chỉ Quản lý, hoặc Thu ngân kèm mã PIN của một Quản lý trong cùng quán
// -----------------------------------------------------------------------------
router.post('/orders/void', requireRole(...MANAGER_ROLES, 'Cashier'), wrap(async (req, res) => {
    const { code, reason, pin } = req.body || {};
    if (!code) return res.status(400).json({ success: false, error: 'Thiếu mã hóa đơn.' });

    let approver = null;
    if (MANAGER_ROLES.includes(req.auth.role)) {
        approver = req.auth.fullName || req.auth.username;
    } else {
        const cleanPin = String(pin || '').trim();
        const m = cleanPin ? await db.query(`
            SELECT FullName FROM StaffUsers
            WHERE StoreID = $1 AND Pin = $2 AND IsActive = TRUE AND Role = ANY($3::text[]) LIMIT 1
        `, [req.storeId, cleanPin, MANAGER_ROLES]) : { rows: [] };
        if (!m.rows.length) {
            return res.status(403).json({ success: false, error: '⛔ Cần mã PIN hợp lệ của Quản lý để hủy hóa đơn.' });
        }
        approver = m.rows[0].fullname;
    }

    const r = await db.query(`
        UPDATE Orders SET OrderStatus = 'Cancelled', CancelReason = $3, CancelledBy = $4,
            CancelledAt = CURRENT_TIMESTAMP, UpdatedAt = CURRENT_TIMESTAMP
        WHERE StoreID = $1 AND OrderCode = $2 AND OrderStatus <> 'Cancelled'
        RETURNING *
    `, [req.storeId, String(code), String(reason || 'Quản lý duyệt hủy').slice(0, 300), approver]);
    if (!r.rows.length) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy hóa đơn hoặc hóa đơn đã bị hủy.' });
    }
    res.json({ success: true, message: `Đã hủy hóa đơn ${code}`, data: orderToInvoice(r.rows[0]) });
}));

// Quản lý sửa phương thức thanh toán của hóa đơn (đối soát). Ghi nhận người sửa vào ghi chú.
router.patch('/orders/:code/payment', requireRole(...MANAGER_ROLES), wrap(async (req, res) => {
    const method = PAY_METHODS[(req.body || {}).payMethod];
    if (!method) return res.status(400).json({ success: false, error: 'Phương thức thanh toán không hợp lệ.' });
    const note = String((req.body || {}).note || '').slice(0, 200);
    const who = req.auth.fullName || req.auth.username;
    const r = await db.query(`
        UPDATE Orders SET PaymentMethod = $3, UpdatedAt = CURRENT_TIMESTAMP,
            CashierNote = COALESCE(CashierNote || E'\n', '') || $4
        WHERE StoreID = $1 AND OrderCode = $2 AND OrderStatus <> 'Cancelled'
        RETURNING *
    `, [req.storeId, req.params.code, method.db, `[${who}] đổi PTTT sang ${method.label}${note ? ': ' + note : ''}`]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Không tìm thấy hóa đơn hoặc hóa đơn đã bị hủy.' });
    res.json({ success: true, data: orderToInvoice(r.rows[0]) });
}));

module.exports = router;
