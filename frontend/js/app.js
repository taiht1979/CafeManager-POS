/**
 * CafeManager POS - Full Interactive Single Page Application Logic
 * Hoạt động 100% độc lập, không phụ thuộc thư viện ngoài, không lỗi trắng trang
 * Hỗ trợ đồng bộ Real-time đa màn hình (POS - KDS Barista - Quản lý Bàn) qua BroadcastChannel
 */

// =============================================================================
// 1. DỮ LIỆU KHỞI TẠO & LOCALSTORAGE PERSISTENCE
// =============================================================================

let tablesData = [
    { id: 1, name: 'Bàn 01', area: 'T1', status: 'occupied', capacity: 4, bill: 115000, time: '42 phút', guests: 2 },
    { id: 2, name: 'Bàn 02', area: 'T1', status: 'merged', capacity: 4, bill: 0, time: '', guests: 0, mergedInto: 'Bàn 01' },
    { id: 3, name: 'Bàn 03', area: 'T1', status: 'available', capacity: 2, bill: 0, time: '', guests: 0 },
    { id: 4, name: 'Bàn 04', area: 'T1', status: 'billing', capacity: 4, bill: 240000, time: '1 giờ 10p', guests: 4 },
    { id: 5, name: 'Bàn 05', area: 'SV', status: 'occupied', capacity: 6, bill: 185000, time: '25 phút', guests: 5 },
    { id: 6, name: 'Bàn 06', area: 'SV', status: 'available', capacity: 4, bill: 0, time: '', guests: 0 },
    { id: 7, name: 'Bàn 07', area: 'SV', status: 'occupied', capacity: 4, bill: 90000, time: '15 phút', guests: 2 },
    { id: 8, name: 'Bàn VIP 01', area: 'VIP', status: 'occupied', capacity: 8, bill: 520000, time: '55 phút', guests: 7 },
    { id: 9, name: 'Bàn VIP 02', area: 'VIP', status: 'available', capacity: 6, bill: 0, time: '', guests: 0 }
];

let customersData = [
    { id: 1, name: 'Nguyễn Văn An', phone: '0901234567', tier: 'Vàng', points: 450, totalSpent: 4500000, lastVisit: 'Hôm nay 15:30' },
    { id: 2, name: 'Trần Thị Mai', phone: '0988765432', tier: 'Bạc', points: 180, totalSpent: 1800000, lastVisit: 'Hôm qua' },
    { id: 3, name: 'Lê Hoàng Nam', phone: '0912348899', tier: 'Kim Cương', points: 920, totalSpent: 9200000, lastVisit: '24/09/2026' },
    { id: 4, name: 'Phạm Bích Ngọc', phone: '0933445566', tier: 'Đồng', points: 65, totalSpent: 650000, lastVisit: '22/09/2026' }
];

let selectedTable = null;
let currentAreaFilter = 'all';

// Web Audio API Sound Chime
const audioCtx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;
function playChime() {
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.value = 0.08;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.25);
        });
    } catch (e) {}
}

// =============================================================================
// 2. BROADCASTCHANNEL REALTIME SYNCHRONIZATION
// =============================================================================
const syncChannel = window.BroadcastChannel ? new BroadcastChannel('cafemanager_sync') : null;

if (syncChannel) {
    syncChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'KDS_NEW_ORDER') {
            playChime();
            showToast(`🔔 Đơn mới từ ${data.tableName} gửi sang quầy Barista!`, 'info');
            addLiveKdsCard(data);
            syncTablesFromStorage();
        } else if (data.type === 'INVOICE_PAID') {
            showToast(`💰 ${data.tableName} vừa thanh toán ${formatMoney(data.total)}!`, 'success');
            syncTablesFromStorage();
            updateLiveRevenueReports();
        }
    };
}

// Add real-time KDS Card from POS
function addLiveKdsCard(orderData) {
    const pendingList = document.getElementById('kds-list-pending');
    if (!pendingList) return;

    const itemsSummary = orderData.items.map(i => `• <strong>${i.quantity}x ${i.name}</strong> (${i.note || 'Chuẩn'})`).join('<br>');

    const card = document.createElement('div');
    card.className = 'kds-card urgent';
    card.innerHTML = `
        <div class="kds-card-head">
            <strong style="font-size:0.95rem; color:#fff;">${orderData.tableName}</strong>
            <span class="kds-timer">Vừa gửi</span>
        </div>
        <div class="kds-items" style="font-size:0.8rem; line-height:1.4;">
            ${itemsSummary}
        </div>
        <button onclick="advanceKds(this, 'brewing')" class="btn btn-primary" style="width:100%; padding:8px; font-size:0.8rem; justify-content:center;">
            Nhận Pha Chế ➔
        </button>
    `;
    pendingList.prepend(card);
}

// Sync live floor plan with pos_table_orders from localStorage
function syncTablesFromStorage() {
    const liveOrders = JSON.parse(localStorage.getItem('pos_table_orders') || '{}');
    tablesData.forEach(t => {
        const order = liveOrders[t.id];
        if (order && order.cart && order.cart.length > 0) {
            t.status = 'occupied';
            t.bill = order.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
            t.time = order.savedAt ? 'Từ ' + order.savedAt : 'Đang ngồi';
        }
    });
    renderTables();
}

// =============================================================================
// 3. KHỞI TẠO KHI TẢI TRANG (INIT)
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    syncTablesFromStorage();
    renderCrmTable();
    updateLiveRevenueReports();
});

// Đồng hồ thời gian thực
function initClock() {
    const clockEl = document.getElementById('live-clock');
    const update = () => {
        if (clockEl) {
            clockEl.textContent = new Date().toLocaleTimeString('vi-VN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }
    };
    setInterval(update, 1000);
    update();
}

// Điều hướng Tab linh hoạt
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-menu .nav-item[data-tab]');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const meta = {
        'overview': { title: 'Tổng quan Hệ thống', sub: 'Chào buổi chiều, Quản lý ca • Chi nhánh Aroma Roastery' },
        'tables':   { title: 'Quản lý Sơ đồ Bàn', sub: 'Theo dõi trạng thái, thời gian khách ngồi, gộp bàn và tách bàn' },
        'qr-order': { title: 'QR Order Tại Bàn', sub: 'Mô phỏng gọi món thông minh & tạo mã QR cho từng bàn' },
        'barista':  { title: 'Màn hình Barista (KDS)', sub: 'Điều phối hàng đợi chế biến theo thời gian thực' },
        'crm':      { title: 'CRM Khách Hàng Thân Thiết', sub: 'Tra cứu thông tin, điểm thưởng và chính sách phân hạng' },
        'reports':  { title: 'Báo cáo Doanh thu & Phân tích', sub: 'Thống kê doanh thu ca làm việc, món bán chạy và dòng tiền' }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabKey = item.getAttribute('data-tab');
            if (!tabKey) return;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`tab-${tabKey}`);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            if (meta[tabKey]) {
                pageTitle.textContent = meta[tabKey].title;
                pageSubtitle.textContent = meta[tabKey].sub;
            }

            if (tabKey === 'reports') {
                updateLiveRevenueReports();
            } else if (tabKey === 'tables') {
                syncTablesFromStorage();
            }
        });
    });

    // Bấm vào card ở trang Tổng quan
    document.querySelectorAll('.feature-card[data-jump]').forEach(card => {
        card.addEventListener('click', () => {
            const targetTab = card.getAttribute('data-jump');
            const correspondingNav = document.querySelector(`.nav-item[data-tab="${targetTab}"]`);
            if (correspondingNav) {
                correspondingNav.click();
            }
        });
    });
}

// =============================================================================
// 4. TAB QUẢN LÝ BÀN (TABLES)
// =============================================================================
function renderTables() {
    const container = document.getElementById('tables-container');
    if (!container) return;

    const filtered = tablesData.filter(t => currentAreaFilter === 'all' || t.area === currentAreaFilter);

    container.innerHTML = filtered.map(t => {
        let statusClass = t.status;
        let statusText = '🟢 Trống';
        let billDisplay = '0 đ';

        if (t.status === 'occupied') {
            statusText = '🔴 Đang có khách';
            billDisplay = formatMoney(t.bill);
        } else if (t.status === 'billing') {
            statusText = '🟡 Chờ tính tiền';
            billDisplay = formatMoney(t.bill);
        } else if (t.status === 'merged') {
            statusText = `🟣 Gộp vào ${t.mergedInto}`;
            billDisplay = 'Chung hóa đơn';
        }

        return `
            <div class="table-box ${statusClass}" onclick="openTableModal(${t.id})">
                <div class="table-header">
                    <span class="table-title">${t.name}</span>
                    <span class="table-capacity">👥 ${t.capacity} chỗ</span>
                </div>
                <div class="table-body">
                    <div class="table-bill">${billDisplay}</div>
                    <div class="table-time">${t.time ? '⏱️ ' + t.time : 'Sẵn sàng đón khách'}</div>
                </div>
                <div class="card-footer" style="padding-top:8px;">
                    <span class="status-pill ${t.status}">${statusText}</span>
                </div>
            </div>
        `;
    }).join('');
}

function filterTables(area, btn) {
    currentAreaFilter = area;
    document.querySelectorAll('.filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderTables();
}

function openTableModal(tableId) {
    selectedTable = tablesData.find(t => t.id === tableId);
    if (!selectedTable) return;

    document.getElementById('modal-tbl-title').textContent = `Chi Tiết: ${selectedTable.name}`;
    document.getElementById('modal-tbl-subtitle').textContent = `Khu vực: ${selectedTable.area === 'T1' ? 'Tầng 1' : selectedTable.area === 'SV' ? 'Sân Vườn' : 'VIP'} • Trạng thái: ${selectedTable.status}`;
    document.getElementById('modal-tbl-total').textContent = formatMoney(selectedTable.bill);
    document.getElementById('modal-tbl-time').textContent = selectedTable.time || 'Bàn đang trống';

    document.getElementById('modal-table-action').classList.add('active');
}

function closeTableModal() {
    document.getElementById('modal-table-action').classList.remove('active');
}

function triggerTableAction(action) {
    if (!selectedTable) return;

    if (action === 'gop') {
        const targetTable = prompt(`Nhập tên bàn bạn muốn gộp ${selectedTable.name} vào (Ví dụ: Bàn 01):`, 'Bàn 01');
        if (targetTable) {
            selectedTable.status = 'merged';
            selectedTable.mergedInto = targetTable;
            closeTableModal();
            renderTables();
            showToast(`✓ Đã gộp thành công ${selectedTable.name} vào ${targetTable}!`, 'success');
        }
    } else if (action === 'tach') {
        if (confirm(`Bạn có muốn tách hóa đơn của ${selectedTable.name} thành 2 đơn thanh toán riêng lẻ?`)) {
            closeTableModal();
            showToast(`✓ Đã tách hóa đơn ${selectedTable.name} thành 2 đơn con thành công!`, 'success');
        }
    } else if (action === 'chuyen') {
        const toTable = prompt(`Chuyển khách từ ${selectedTable.name} sang bàn:`, 'Bàn 03');
        if (toTable) {
            closeTableModal();
            showToast(`✓ Đã chuyển toàn bộ hóa đơn từ ${selectedTable.name} sang ${toTable}!`, 'success');
        }
    }
}

// =============================================================================
// 5. TAB QR ORDER TẠI BÀN
// =============================================================================
let currentQrSelectedItem = null;

function changeQrTable(tableName) {
    document.getElementById('qr-screen-table').textContent = `${tableName} • Tầng 1`;
    document.getElementById('qr-tag-label').textContent = tableName.toUpperCase();
    showToast(`Đã đổi mã QR hiển thị sang: ${tableName}`, 'info');
}

function selectQrItem(name, price) {
    currentQrSelectedItem = { name, price };
    document.getElementById('qr-selected-item').textContent = `1x ${name} (${formatMoney(price)})`;
    showToast(`Đã chọn: ${name}`, 'info');
}

function submitQrOrder() {
    if (!currentQrSelectedItem) {
        showToast('Vui lòng chạm chọn một món trong thực đơn trước khi gửi đơn!', 'warning');
        return;
    }

    const table = document.getElementById('qr-screen-table').textContent.split('•')[0].trim();
    showToast(`🚀 Đã gửi đơn "${currentQrSelectedItem.name}" từ ${table} tới quầy Barista!`, 'success');

    // Tự động đẩy đơn vào Màn hình Barista
    const pendingList = document.getElementById('kds-list-pending');
    if (pendingList) {
        const newCard = document.createElement('div');
        newCard.className = 'kds-card';
        newCard.innerHTML = `
            <div class="kds-card-head">
                <strong style="font-size:0.95rem; color:#fff;">${table} (QR Order)</strong>
                <span class="kds-timer">00:05</span>
            </div>
            <div class="kds-items">
                • <strong>1x ${currentQrSelectedItem.name}</strong> (Món gọi qua QR tại bàn)
            </div>
            <button onclick="advanceKds(this, 'brewing')" class="btn btn-primary" style="width:100%; padding:8px; font-size:0.8rem; justify-content:center;">
                Nhận Pha Chế ➔
            </button>
        `;
        pendingList.prepend(newCard);
    }

    // Broadcast to POS screen
    if (syncChannel) {
        syncChannel.postMessage({
            type: 'KDS_NEW_ORDER',
            tableName: table + ' (QR)',
            items: [{ name: currentQrSelectedItem.name, quantity: 1, note: 'Khách tự gọi tại bàn' }],
            time: new Date().toLocaleTimeString('vi-VN')
        });
    }

    currentQrSelectedItem = null;
    document.getElementById('qr-selected-item').textContent = 'Chưa chọn món nào';
}

// =============================================================================
// 6. TAB MÀN HÌNH BARISTA (KDS)
// =============================================================================
function advanceKds(btn, targetStatus) {
    const card = btn.closest('.kds-card');
    if (!card) return;

    if (targetStatus === 'brewing') {
        const brewingList = document.getElementById('kds-list-brewing');
        btn.remove();
        card.classList.remove('urgent');
        card.style.borderColor = 'rgba(59,130,246,0.4)';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.style = 'width:100%; padding:8px; font-size:0.8rem; justify-content:center; background:#10b981; color:#000; font-weight:800;';
        nextBtn.textContent = '✓ Hoàn Tất & Trả Món';
        nextBtn.onclick = function() { advanceKds(this, 'ready'); };
        card.appendChild(nextBtn);

        brewingList.prepend(card);
        showToast('👨‍🍳 Đã tiếp nhận đơn vào hàng đợi pha chế!', 'info');
    } else if (targetStatus === 'ready') {
        const readyList = document.getElementById('kds-list-ready');
        const tableTitle = card.querySelector('.kds-card-head strong').textContent;
        btn.remove();
        card.style.opacity = '0.75';

        const tag = document.createElement('div');
        tag.style = 'font-size:0.75rem; color:#34d399; font-weight:700; margin-top:8px;';
        tag.textContent = '✓ Đã pha xong - Sẵn sàng phục vụ';
        card.appendChild(tag);

        readyList.prepend(card);
        showToast(`✅ Đơn ${tableTitle} đã hoàn tất! Báo thu ngân phục vụ.`, 'success');

        // Broadcast to POS: Order Ready!
        if (syncChannel) {
            syncChannel.postMessage({
                type: 'KDS_ORDER_READY',
                tableName: tableTitle,
                time: new Date().toLocaleTimeString('vi-VN')
            });
        }
    }
}

function addSimulatedKdsOrder() {
    const pendingList = document.getElementById('kds-list-pending');
    const randomTables = ['Bàn 03 (Sân Vườn)', 'Bàn VIP 02', 'Bàn 04 (Tầng 1)', 'Mang Đi 06'];
    const randomItems = [
        '1x Cà Phê Muối (Ít đá) + 1x Trà Đào',
        '2x Trà Sen Vàng Hạt Dẻ (Size L, 50% đường)',
        '1x Matcha Đá Xay + 1x Tiramisu'
    ];

    const randTbl = randomTables[Math.floor(Math.random() * randomTables.length)];
    const randItm = randomItems[Math.floor(Math.random() * randomItems.length)];

    const card = document.createElement('div');
    card.className = 'kds-card';
    card.innerHTML = `
        <div class="kds-card-head">
            <strong style="font-size:0.95rem; color:#fff;">${randTbl}</strong>
            <span class="kds-timer">00:01</span>
        </div>
        <div class="kds-items">
            • <strong>${randItm}</strong>
        </div>
        <button onclick="advanceKds(this, 'brewing')" class="btn btn-primary" style="width:100%; padding:8px; font-size:0.8rem; justify-content:center;">
            Nhận Pha Chế ➔
        </button>
    `;

    pendingList.prepend(card);
    showToast(`🔔 Có đơn mới vào quầy Barista: ${randTbl}`, 'info');
}

// =============================================================================
// 7. TAB CRM KHÁCH HÀNG THÂN THIẾT
// =============================================================================
function renderCrmTable(keyword = '') {
    const tbody = document.getElementById('crm-table-body');
    if (!tbody) return;

    const filtered = customersData.filter(c => {
        return c.name.toLowerCase().includes(keyword.toLowerCase()) || c.phone.includes(keyword);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">Không tìm thấy khách hàng nào</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        let badgeColor = '#94a3b8';
        if (c.tier === 'Vàng') badgeColor = '#fbbf24';
        if (c.tier === 'Kim Cương') badgeColor = '#c084fc';
        if (c.tier === 'Bạc') badgeColor = '#cbd5e1';

        return `
            <tr>
                <td style="font-weight:700; color:#fff;">${c.name}</td>
                <td style="font-family:monospace; color:#38bdf8;">${c.phone}</td>
                <td>
                    <span style="font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:4px; border:1px solid ${badgeColor}; color:${badgeColor};">
                        ${c.tier}
                    </span>
                </td>
                <td style="font-weight:700; color:#fbbf24; font-family:monospace;">${c.points} điểm</td>
                <td style="font-family:monospace; color:#cbd5e1;">${formatMoney(c.totalSpent)}</td>
                <td style="color:#94a3b8; font-size:0.8rem;">${c.lastVisit}</td>
                <td style="text-align:right;">
                    <button onclick="showToast('Đã tặng voucher 20.000đ cho khách ${c.name}!', 'success')" class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;">
                        🎁 Tặng Ưu Đãi
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterCrmTable(val) {
    renderCrmTable(val);
}

function openAddCustomerModal() {
    document.getElementById('modal-add-customer').classList.add('active');
}

function closeAddCustomerModal() {
    document.getElementById('modal-add-customer').classList.remove('active');
}

function saveCustomer(e) {
    e.preventDefault();
    const name = document.getElementById('new-cust-name').value;
    const phone = document.getElementById('new-cust-phone').value;
    const tier = document.getElementById('new-cust-tier').value;

    customersData.unshift({
        id: customersData.length + 1,
        name,
        phone,
        tier,
        points: 50,
        totalSpent: 0,
        lastVisit: 'Vừa đăng ký'
    });

    closeAddCustomerModal();
    renderCrmTable();
    showToast(`✓ Đã đăng ký thành viên mới: ${name} (${tier})!`, 'success');
}

// =============================================================================
// 8. TAB BÁO CÁO DOANH THU THỰC TẾ
// =============================================================================
function updateLiveRevenueReports() {
    const history = JSON.parse(localStorage.getItem('pos_invoices_history') || '[]');
    const validInvoices = history.filter(i => i.status !== 'voided');

    const totalRev = validInvoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const vietqrRev = validInvoices.filter(i => i.payMethod === 'vietqr').reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const cashRev = validInvoices.filter(i => i.payMethod === 'cash').reduce((sum, i) => sum + (i.totalAmount || 0), 0);

    const baseRev = 8450000;
    const finalTotalRev = baseRev + totalRev;
    const finalQrRev = 5915000 + vietqrRev;
    const finalCashRev = 2535000 + cashRev;

    const cards = document.querySelectorAll('#tab-reports .stat-card .stat-value');
    if (cards && cards.length >= 3) {
        cards[0].innerHTML = `${new Intl.NumberFormat('vi-VN').format(finalTotalRev)} <small>VNĐ</small>`;
        cards[1].innerHTML = `${new Intl.NumberFormat('vi-VN').format(finalQrRev)} <small>VNĐ</small>`;
        cards[2].innerHTML = `${new Intl.NumberFormat('vi-VN').format(finalCashRev)} <small>VNĐ</small>`;
    }
}

// =============================================================================
// 9. TOAST NOTIFICATION & HELPER
// =============================================================================
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = msg;
    toast.className = 'app-toast show';

    if (type === 'success') {
        toast.style.borderColor = '#10b981';
        toast.style.color = '#34d399';
    } else if (type === 'warning') {
        toast.style.borderColor = '#f59e0b';
        toast.style.color = '#fbbf24';
    } else {
        toast.style.borderColor = '#3b82f6';
        toast.style.color = '#60a5fa';
    }

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

function formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
}
