/**
 * CafeStore: lớp đồng bộ dữ liệu giữa các thiết bị qua API.
 *
 * - Dữ liệu tham chiếu (bàn, thực đơn, topping, thông tin quán) được tải từ server rồi
 *   ghi vào localStorage dưới các khóa cũ để mã giao diện hiện có tiếp tục đọc được.
 *   localStorage chỉ là bộ nhớ đệm, nguồn dữ liệu thật là database.
 * - Đơn đang mở theo bàn: đồng bộ có phiên bản (phát hiện xung đột), poll mỗi vài giây.
 * - Vé pha chế (KDS), thanh toán, hóa đơn: gọi thẳng API.
 * - Mất kết nối: hiện thanh cảnh báo đỏ. Thay đổi chưa gửi được sẽ KHÔNG được coi là đã lưu.
 */
(function () {
    const TOKEN_KEY = 'cafemanager_auth_token';
    const USER_KEY = 'cafemanager_auth_user';
    const POLL_MS = 3000;
    const OPEN_KEY = 'pos_table_orders';

    // ------------------------------------------------------------------ dọn dữ liệu cũ
    // Bản cũ lưu đơn, hóa đơn, dữ liệu mẫu trong localStorage. Xóa một lần để dữ liệu mẫu cũ
    // không bị đẩy lên server như đơn thật, và xóa khi đổi sang quán khác trên cùng trình duyệt.
    (function cleanLegacyCache() {
        try {
            const SCHEMA = '3';
            let storeTag = '';
            try { storeTag = String((JSON.parse(localStorage.getItem(USER_KEY) || 'null') || {}).storeId); } catch (e) {}
            if (localStorage.getItem('cafestore_schema') !== SCHEMA || localStorage.getItem('cafestore_store') !== storeTag) {
                ['pos_table_orders', 'barista_orders', 'pos_invoices_history', 'admin_store_tables', 'admin_store_menu',
                    'admin_store_toppings', 'admin_store_staff', 'store_info_config', 'store_vietqr_config', 'pos_petty_cash']
                    .forEach(k => localStorage.removeItem(k));
                localStorage.setItem('cafestore_schema', SCHEMA);
                localStorage.setItem('cafestore_store', storeTag);
            }
        } catch (e) {}
    })();

    // ------------------------------------------------------------------ fetch có token
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (/^\/api\//.test(url) && !/^\/api\/auth\//.test(url)) {
                init = init || {};
                const headers = new Headers(init.headers || {});
                const token = localStorage.getItem(TOKEN_KEY);
                if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
                init.headers = headers;
                return nativeFetch(input, init).then(res => {
                    if (res.status === 401) handleUnauthorized();
                    return res;
                });
            }
        } catch (e) { /* rơi xuống fetch gốc */ }
        return nativeFetch(input, init);
    };

    function handleUnauthorized() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        } catch (e) {}
        const cur = location.pathname.split('/').pop().split('?')[0] || 'index.html';
        if (cur !== 'login.html') location.replace('login.html?redirect=' + encodeURIComponent(cur));
    }

    async function api(method, path, body) {
        let res;
        try {
            res = await fetch(path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (e) {
            setOnline(false);
            return { ok: false, status: 0, json: { error: 'Mất kết nối máy chủ' } };
        }
        let json = null;
        try { json = await res.json(); } catch (e) {}
        if (res.status >= 500 || res.status === 503) setOnline(false); else setOnline(true);
        return { ok: res.ok, status: res.status, json: json || {} };
    }

    // ------------------------------------------------------------------ trạng thái mạng
    let online = true;
    function setOnline(v) {
        if (online === v) return;
        online = v;
        renderBanner();
        emit(v ? 'online' : 'offline');
    }
    function renderBanner() {
        let el = document.getElementById('cafestore-offline-banner');
        if (online) { if (el) el.remove(); return; }
        if (!document.body) return;
        if (!el) {
            el = document.createElement('div');
            el.id = 'cafestore-offline-banner';
            el.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#dc2626;color:#fff;' +
                'font:700 13px system-ui,sans-serif;text-align:center;padding:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.4)');
            el.textContent = '⚠️ MẤT KẾT NỐI MÁY CHỦ. Thao tác mới có thể CHƯA ĐƯỢC LƯU. Đang tự thử lại...';
            document.body.appendChild(el);
        }
    }

    // ------------------------------------------------------------------ sự kiện
    const listeners = {};
    function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
    function emit(type, detail) {
        (listeners[type] || []).forEach(fn => { try { fn(detail); } catch (e) { console.error(e); } });
    }

    // ------------------------------------------------------------------ dữ liệu tham chiếu
    function setLS(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }
    function getLS(key, fallback) {
        try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
    }

    async function loadReference() {
        const r = await api('GET', '/api/bootstrap');
        if (!r.ok) return null;
        const d = r.json.data;
        setLS('admin_store_tables', d.tables);
        setLS('admin_store_menu', d.menu);
        setLS('admin_store_toppings', d.toppings);
        setLS('store_info_config', { name: d.store.name, address: d.store.address, phone: d.store.phone, wifi: d.store.wifi });
        setLS('store_vietqr_config', { bankCode: d.store.bankCode, bankAcc: d.store.bankAcc, bankName: d.store.bankName });
        emit('reference', d);
        return d;
    }

    // ------------------------------------------------------------------ đơn đang mở theo bàn
    // serverSnap: JSON của từng bàn lần cuối khớp với server; versions: phiên bản tương ứng
    let serverSnap = {};
    let versions = {};
    const chains = {};      // hàng đợi tuần tự theo bàn
    let pendingWrites = 0;

    const strip = (o) => { const c = { ...o }; delete c._v; return c; };

    function readOpen() { return getLS(OPEN_KEY, {}); }

    function applyServerOpen(data) {
        const cache = {};
        const snap = {};
        const ver = {};
        Object.keys(data).forEach(k => {
            ver[k] = data[k]._v;
            const clean = strip(data[k]);
            cache[k] = clean;
            snap[k] = JSON.stringify(clean);
        });
        const changed = JSON.stringify(cache) !== JSON.stringify(readOpen());
        serverSnap = snap;
        versions = ver;
        if (changed) {
            setLS(OPEN_KEY, cache);
            emit('open-orders');
        }
    }

    async function refreshOpenOrders() {
        if (pendingWrites > 0) return; // đang gửi thay đổi, đừng ghi đè bản tạm
        const r = await api('GET', '/api/open-orders');
        if (r.ok && pendingWrites === 0) applyServerOpen(r.json.data);
    }

    function queue(key, fn) {
        const prev = chains[key] || Promise.resolve();
        const next = prev.then(fn, fn);
        chains[key] = next.catch(() => {});
        return next;
    }

    /** Lưu toàn bộ object đơn các bàn: chỉ gửi những bàn có thay đổi so với server */
    function saveOpenOrders(all) {
        setLS(OPEN_KEY, all);
        const keys = new Set([...Object.keys(all), ...Object.keys(serverSnap)]);
        keys.forEach(key => {
            const local = all[key];
            const localJson = local ? JSON.stringify(strip(local)) : null;
            if (localJson === (serverSnap[key] || null)) return;

            pendingWrites++;
            queue(key, async () => {
                try {
                    if (local) {
                        const r = await api('PUT', '/api/open-orders/' + encodeURIComponent(key),
                            { data: strip(local), baseVersion: versions[key] || 0 });
                        if (r.ok) {
                            versions[key] = r.json.version;
                            serverSnap[key] = localJson;
                        } else if (r.status === 409) {
                            const cur = r.json.current;
                            const cache = readOpen();
                            if (cur) {
                                versions[key] = cur._v;
                                serverSnap[key] = JSON.stringify(strip(cur));
                                cache[key] = strip(cur);
                            } else {
                                delete versions[key]; delete serverSnap[key]; delete cache[key];
                            }
                            setLS(OPEN_KEY, cache);
                            emit('conflict', { key });
                            emit('open-orders');
                        } else {
                            emit('save-failed', { key, error: r.json.error });
                        }
                    } else {
                        const r = await api('DELETE', '/api/open-orders/' + encodeURIComponent(key));
                        if (r.ok) { delete serverSnap[key]; delete versions[key]; }
                        else emit('save-failed', { key, error: r.json.error });
                    }
                } finally {
                    pendingWrites--;
                }
            });
        });
    }

    // ------------------------------------------------------------------ KDS
    let kdsTickets = [];
    let kdsSeen = null;

    async function refreshKds() {
        const r = await api('GET', '/api/kds');
        if (!r.ok) return;
        const list = r.json.data;
        const ids = new Set(list.map(t => t.id));
        const fresh = kdsSeen ? list.filter(t => !kdsSeen.has(t.id) && t.status === 'pending') : [];
        const changed = JSON.stringify(list) !== JSON.stringify(kdsTickets);
        kdsTickets = list;
        kdsSeen = ids;
        if (fresh.length) emit('kds-new', fresh);
        if (changed) emit('kds');
    }

    async function sendKds(ticket) {
        const r = await api('POST', '/api/kds', ticket);
        if (r.ok) emit('kds-sent', r.json.data);
        return r;
    }

    async function setKdsStatus(id, status) {
        const t = kdsTickets.find(x => x.id === id);
        if (t) t.status = status;   // cập nhật tạm để giao diện phản hồi ngay
        if (status === 'served' || status === 'cancelled') kdsTickets = kdsTickets.filter(x => x.id !== id);
        const r = await api('PATCH', '/api/kds/' + encodeURIComponent(id), { status });
        if (!r.ok) await refreshKds();
        return r;
    }

    // ------------------------------------------------------------------ thanh toán, hóa đơn
    async function checkout(payload) {
        const key = String(payload.tableKey);
        // chờ các thay đổi đang gửi của bàn này xong rồi mới thanh toán
        await (chains[key] || Promise.resolve());
        const r = await api('POST', '/api/orders/checkout', payload);
        if (r.ok) {
            const cache = readOpen();
            delete cache[key]; delete serverSnap[key]; delete versions[key];
            setLS(OPEN_KEY, cache);
            emit('open-orders');
        } else if (r.status === 409) {
            await refreshOpenOrders();
        }
        return r;
    }

    const loadInvoices = (date) => api('GET', '/api/orders' + (date ? '?date=' + encodeURIComponent(date) : ''));
    const voidInvoice = (code, reason, pin) => api('POST', '/api/orders/void', { code, reason, pin });

    // ------------------------------------------------------------------ khởi động
    let timer = null;
    async function start(opts) {
        opts = opts || {};
        if (opts.reference !== false) await loadReference();
        if (opts.open !== false) await refreshOpenOrders();
        if (opts.kds) await refreshKds();
        clearInterval(timer);
        timer = setInterval(() => {
            if (document.hidden) return;
            if (opts.open !== false) refreshOpenOrders();
            if (opts.kds) refreshKds();
        }, POLL_MS);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (opts.open !== false) refreshOpenOrders();
                if (opts.kds) refreshKds();
            }
        });
        if (opts.reference !== false) setInterval(() => { if (!document.hidden) loadReference(); }, 60000);
    }

    window.CafeStore = {
        start, on, api, isOnline: () => online,
        loadReference, refreshOpenOrders, readOpen, saveOpenOrders,
        refreshKds, sendKds, setKdsStatus, kdsList: () => kdsTickets,
        checkout, loadInvoices, voidInvoice
    };
})();
