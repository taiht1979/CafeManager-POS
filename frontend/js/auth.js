/**
 * CafeManager POS - Authentication & Role-Based Access Control Module
 * Quản lý xác thực người dùng, phiên làm việc, lưu mật khẩu / ghi nhớ đăng nhập,
 * bảo vệ quyền truy cập chức năng và thông báo chặn quyền với 2 lựa chọn.
 */

(function (global) {
    if (global.__CAFE_AUTH_LOADED__) return;
    global.__CAFE_AUTH_LOADED__ = true;

    const STORAGE_KEY_USER = 'cafemanager_auth_user';
    const STORAGE_KEY_TOKEN = 'cafemanager_auth_token';
    const STORAGE_KEY_REMEMBER = 'cafemanager_remember_auth';

    // Danh sách tài khoản người dùng mẫu chuẩn hệ thống với mật khẩu & PIN bảo mật cao
    const DEFAULT_USERS = [
        {
            id: 5,
            username: 'superadmin',
            password: 'SuperAdmin@2026!',
            pin: '9999',
            aliases: ['superadmin', 'saasadmin', 'root'],
            fullName: 'Quản Trị Viên SaaS (Root)',
            role: 'SuperAdmin',
            roleName: 'Super Admin SaaS',
            roleIcon: '👑',
            storeId: null,
            storeName: 'Toàn Hệ Thống SaaS',
            defaultScreen: 'super-admin-dashboard.html',
            description: 'Chỉ truy cập trang báo cáo chung & quản trị toàn hệ thống SaaS (không vào chức năng nội bộ quán)'
        },
        {
            id: 1,
            username: 'manager',
            password: 'Manager@2026!',
            pin: '8888',
            aliases: ['manager', 'owner', 'aroma_owner', 'admin', 'chuquan'],
            fullName: 'Lê Hữu Nghĩa (Chủ Quán)',
            role: 'StoreOwner',
            roleName: 'Quản Lý / Chủ Quán',
            roleIcon: '🏪',
            storeId: 1,
            storeName: 'Aroma Coffee Roastery',
            defaultScreen: 'store-admin-dashboard.html',
            description: 'Quản trị sơ đồ bàn, menu, nhân sự, doanh thu và đối soát'
        },
        {
            id: 2,
            username: 'cashier',
            password: 'Cashier@1234!',
            pin: '1234',
            aliases: ['cashier', 'thungan', 'pos'],
            fullName: 'Trần Thu Ngân',
            role: 'Cashier',
            roleName: 'Thu Ngân POS',
            roleIcon: '💻',
            storeId: 1,
            storeName: 'Aroma Coffee Roastery',
            defaultScreen: 'pos.html',
            description: 'Màn hình bán hàng POS cảm ứng, thanh toán VietQR & In bill'
        },
        {
            id: 3,
            username: 'waiter',
            password: 'Waiter@2345!',
            pin: '2345',
            aliases: ['order', 'waiter', 'phucvu', 'nhanvienorder'],
            fullName: 'Hoàng Nhân (Order)',
            role: 'Waiter',
            roleName: 'Nhân Viên Order',
            roleIcon: '📱',
            storeId: 1,
            storeName: 'Aroma Coffee Roastery',
            defaultScreen: 'waiter-order.html',
            description: 'Order tại bàn qua điện thoại, bắn đơn trực tiếp về Barista'
        },
        {
            id: 4,
            username: 'barista',
            password: 'Barista@3456!',
            pin: '3456',
            aliases: ['barista', 'phache', 'kds', 'bep'],
            fullName: 'Nguyễn Văn Barista',
            role: 'Barista',
            roleName: 'Quầy Pha Chế',
            roleIcon: '☕',
            storeId: 1,
            storeName: 'Aroma Coffee Roastery',
            defaultScreen: 'barista.html',
            description: 'Màn hình điều phối chế biến Barista KDS, chuông báo đơn mới'
        }
    ];

    // Cấu hình phân quyền cho từng màn hình
    const SCREEN_PERMISSIONS = {
        'pos.html': {
            name: 'Quầy Thu Ngân Bán Hàng (POS)',
            allowedRoles: ['Cashier', 'StoreOwner', 'Manager'],
            allowedDescription: 'Thu Ngân (Cashier) hoặc Quản Lý / Chủ Quán'
        },
        'waiter-order.html': {
            name: 'Order Điện Thoại Tại Bàn (Waiter)',
            allowedRoles: ['Waiter', 'Cashier', 'StoreOwner', 'Manager'],
            allowedDescription: 'Nhân Viên Order (Waiter), Thu Ngân hoặc Quản Lý'
        },
        'barista.html': {
            name: 'Quầy Pha Chế (Barista KDS)',
            allowedRoles: ['Barista', 'StoreOwner', 'Manager'],
            allowedDescription: 'Nhân Viên Pha Chế (Barista) hoặc Quản Lý'
        },
        'store-admin-dashboard.html': {
            name: 'Quản Trị Quán (Store Admin)',
            allowedRoles: ['StoreOwner', 'Manager'],
            allowedDescription: 'Quản Lý / Chủ Quán (Store Owner / Manager)'
        },
        'super-admin-dashboard.html': {
            name: 'Quản Trị Nền Tảng (Super Admin SaaS)',
            allowedRoles: ['SuperAdmin'],
            allowedDescription: 'Super Admin SaaS (Báo cáo chung toàn hệ thống)'
        },
        'admin-dashboard.html': {
            name: 'Cổng Báo Cáo SaaS Multi-Tenant',
            allowedRoles: ['SuperAdmin'],
            allowedDescription: 'Super Admin SaaS (Báo cáo chung toàn hệ thống)'
        },
        'index.html': {
            name: 'Tổng Quan Vận Hành Quán (Store Hub)',
            allowedRoles: ['StoreOwner', 'Manager', 'Cashier', 'Waiter', 'Barista'],
            allowedDescription: 'Nhân sự vận hành nội bộ quán (Super Admin chỉ vào trang báo cáo chung)'
        }
    };

    const Auth = {
        users: DEFAULT_USERS,
        permissions: SCREEN_PERMISSIONS,

        /**
         * Lấy thông tin user đăng nhập hiện tại từ localStorage
         */
        getCurrentUser() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY_USER);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                console.error('Lỗi đọc phiên đăng nhập:', e);
                return null;
            }
        },

        /**
         * Kiểm tra xem đã đăng nhập chưa
         */
        isAuthenticated() {
            return !!this.getCurrentUser();
        },

        /**
         * Lấy thông tin lưu mật khẩu / ghi nhớ đăng nhập (Remember Me)
         */
        getRememberedAuth() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY_REMEMBER);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        },

        /**
         * Lưu hoặc xóa thông tin ghi nhớ đăng nhập
         */
        setRememberedAuth(info) {
            try {
                if (info && info.remember) {
                    localStorage.setItem(STORAGE_KEY_REMEMBER, JSON.stringify(info));
                } else {
                    localStorage.removeItem(STORAGE_KEY_REMEMBER);
                }
            } catch (e) {}
        },

        /**
         * Xóa thông tin ghi nhớ
         */
        clearRememberedAuth() {
            try {
                localStorage.removeItem(STORAGE_KEY_REMEMBER);
            } catch (e) {}
        },

        /**
         * Lấy đường dẫn màn hình mặc định theo vai trò (Role)
         */
        getDefaultScreenForRole(role) {
            const r = String(role || '').toLowerCase();
            if (r.includes('waiter') || r.includes('order')) return 'waiter-order.html';
            if (r.includes('cashier') || r.includes('thungan')) return 'pos.html';
            if (r.includes('barista') || r.includes('phache')) return 'barista.html';
            if (r.includes('superadmin') || r.includes('saas')) return 'super-admin-dashboard.html';
            return 'store-admin-dashboard.html'; // Manager / StoreOwner
        },

        /**
         * Kiểm tra vai trò của người dùng có quyền vào các roles cho phép hay không
         */
        hasPermission(userRole, allowedRoles) {
            if (!allowedRoles || allowedRoles.length === 0) return true;
            if (!userRole) return false;

            const uRole = String(userRole).toLowerCase();
            const allowed = allowedRoles.map(r => String(r).toLowerCase());

            // Super Admin CHỈ ĐƯỢC VÀO TRANG BÁO CÁO CHUNG SAAS, KHÔNG ĐƯỢC VÀO CÁC CHỨC NĂNG NỘI BỘ CỦA QUÁN
            if (uRole === 'superadmin' || uRole === 'root' || uRole === 'saasadmin') {
                return allowed.includes('superadmin') || allowed.includes('root') || allowed.includes('saasadmin');
            }

            // StoreOwner / Manager có quyền các phân hệ vận hành của quán, nhưng không vào được báo cáo SaaS Super Admin
            if (uRole === 'storeowner' || uRole === 'manager') {
                return allowed.includes(uRole) || allowed.includes('cashier') || allowed.includes('waiter') || allowed.includes('barista') || allowed.includes('storeowner') || allowed.includes('manager');
            }

            return allowed.includes(uRole);
        },

        /**
         * Kiểm tra quyền truy cập cho một trang hoặc đường dẫn cụ thể
         */
        canAccessScreen(screenUrl, user = this.getCurrentUser()) {
            if (!user) return false;
            const filename = (screenUrl || '').split('/').pop().split('?')[0] || 'index.html';
            const perm = SCREEN_PERMISSIONS[filename];
            if (!perm || !perm.allowedRoles) return true;
            return this.hasPermission(user.role, perm.allowedRoles);
        },

        /**
         * Lấy toàn bộ danh sách users bao gồm tài khoản mặc định và nhân viên mới tạo từ Store Admin
         */
        getAllUsers() {
            let localStaff = [];
            try {
                const raw = localStorage.getItem('admin_store_staff');
                if (raw) localStaff = JSON.parse(raw);
            } catch (e) {}

            const customUsers = (Array.isArray(localStaff) ? localStaff : [])
                .filter(s => s && s.status !== 'inactive')
                .map(s => {
                    const cleanPhone = (s.phone || '').replace(/\D/g, '');
                    const role = s.role || 'Waiter';
                    const roleConfig = {
                        'Manager': { role: 'StoreOwner', roleName: 'Quản Lý / Chủ Quán', icon: '👑', screen: 'store-admin-dashboard.html' },
                        'Cashier': { role: 'Cashier', roleName: 'Thu Ngân POS', icon: '💻', screen: 'pos.html' },
                        'Waiter': { role: 'Waiter', roleName: 'Nhân Viên Order', icon: '📱', screen: 'waiter-order.html' },
                        'Barista': { role: 'Barista', roleName: 'Quầy Pha Chế', icon: '☕', screen: 'barista.html' }
                    }[role] || { role: role, roleName: role, icon: '👤', screen: this.getDefaultScreenForRole(role) };

                    const cleanU = (s.username || '').trim().toLowerCase() || ('nv_' + s.id);

                    return {
                        id: s.id,
                        username: cleanU,
                        password: s.password || s.pin || '1234',
                        pin: String(s.pin || '1234').trim(),
                        aliases: [
                            cleanU,
                            (s.phone || '').trim().toLowerCase(),
                            cleanPhone,
                            (s.name || '').trim().toLowerCase()
                        ].filter(Boolean),
                        fullName: s.name,
                        phone: s.phone,
                        role: roleConfig.role,
                        roleName: roleConfig.roleName,
                        roleIcon: roleConfig.icon,
                        storeId: 1,
                        storeName: 'Aroma Coffee Roastery',
                        defaultScreen: roleConfig.screen,
                        description: `Nhân viên ${roleConfig.roleName}`
                    };
                });

            // Gộp danh sách: mặc định + nhân viên mới tạo (không trùng lặp username)
            const defaultUsernames = new Set(this.users.map(u => u.username.toLowerCase()));
            const uniqueCustom = customUsers.filter(cu => !defaultUsernames.has(cu.username));
            return [...this.users, ...uniqueCustom];
        },

        /**
         * Đăng nhập bằng Tên đăng nhập và Mật khẩu (hoặc PIN)
         */
        async login({ username, password, pin, remember = true }) {
            const cleanUser = String(username || '').trim().toLowerCase();
            const cleanPin = String(pin || '').trim();

            // Gọi backend API nếu có mạng
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: cleanUser, password, pin: cleanPin })
                });
                const data = await response.json();
                if (response.ok && data.success && data.user) {
                    this._saveSession(data.user, data.token, remember ? { username: cleanUser, pin: cleanPin } : null);
                    return { success: true, user: data.user, defaultScreen: data.user.defaultScreen };
                }
            } catch (err) {}

            // Client-side fallback authentication với kiểm tra danh sách toàn bộ người dùng (gồm cả nhân viên mới tạo)
            const allUsers = this.getAllUsers();
            let matchedUser = null;

            if (cleanPin) {
                matchedUser = allUsers.find(u => u.pin === cleanPin);
                if (!matchedUser) {
                    return {
                        success: false,
                        error: 'Mã PIN không chính xác! Vui lòng kiểm tra lại.'
                    };
                }
            } else if (cleanUser) {
                const cleanPhone = cleanUser.replace(/\D/g, '');
                matchedUser = allUsers.find(u => 
                    u.username.toLowerCase() === cleanUser || 
                    (u.phone && cleanPhone.length >= 8 && u.phone.replace(/\D/g, '') === cleanPhone) ||
                    (u.aliases && u.aliases.includes(cleanUser))
                );

                if (!matchedUser) {
                    return {
                        success: false,
                        error: 'Tài khoản không tồn tại trong hệ thống!'
                    };
                }

                // KIỂM TRA MẬT KHẨU HOẶC PIN CHẶT CHẼ
                const isValidPass = password && (password === matchedUser.password || password === matchedUser.pin);
                if (!isValidPass) {
                    return {
                        success: false,
                        error: 'Mật khẩu không chính xác! Vui lòng kiểm tra lại.'
                    };
                }
            } else {
                return {
                    success: false,
                    error: 'Vui lòng nhập tên đăng nhập hoặc mã PIN!'
                };
            }

            const sessionUser = {
                id: matchedUser.id,
                username: matchedUser.username,
                fullName: matchedUser.fullName,
                role: matchedUser.role,
                roleName: matchedUser.roleName,
                roleIcon: matchedUser.roleIcon,
                storeId: matchedUser.storeId,
                storeName: matchedUser.storeName,
                defaultScreen: matchedUser.defaultScreen || this.getDefaultScreenForRole(matchedUser.role),
                loginAt: new Date().toISOString()
            };

            const mockToken = 'mock_jwt_token_' + Date.now();
            this._saveSession(sessionUser, mockToken, remember ? { username: matchedUser.username, pin: matchedUser.pin } : null);

            return {
                success: true,
                user: sessionUser,
                defaultScreen: sessionUser.defaultScreen
            };
        },

        /**
         * Đăng nhập nhanh bằng Mã PIN 4 số
         */
        async loginWithPin(pin, remember = true) {
            const cleanPin = String(pin || '').trim();
            if (!cleanPin || cleanPin.length < 4) {
                return { success: false, error: 'Vui lòng nhập đủ 4 số mã PIN!' };
            }

            try {
                const response = await fetch('/api/auth/pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: cleanPin })
                });
                const data = await response.json();
                if (response.ok && data.success && data.user) {
                    this._saveSession(data.user, data.token, remember ? { pin: cleanPin } : null);
                    return { success: true, user: data.user, defaultScreen: data.user.defaultScreen };
                }
            } catch (e) {}

            const allUsers = this.getAllUsers();
            const matchedUser = allUsers.find(u => u.pin === cleanPin);
            if (!matchedUser) {
                return { success: false, error: 'Mã PIN ' + cleanPin + ' không tồn tại trong hệ thống!' };
            }

            const sessionUser = {
                id: matchedUser.id,
                username: matchedUser.username,
                fullName: matchedUser.fullName,
                role: matchedUser.role,
                roleName: matchedUser.roleName,
                roleIcon: matchedUser.roleIcon,
                storeId: matchedUser.storeId,
                storeName: matchedUser.storeName,
                defaultScreen: matchedUser.defaultScreen || this.getDefaultScreenForRole(matchedUser.role),
                loginAt: new Date().toISOString()
            };

            this._saveSession(sessionUser, 'mock_pin_token_' + Date.now(), remember ? { pin: cleanPin } : null);
            return { success: true, user: sessionUser, defaultScreen: sessionUser.defaultScreen };
        },

        /**
         * Lưu phiên làm việc vào localStorage và ghi nhớ mật khẩu nếu được chọn
         */
        _saveSession(user, token, rememberCredentials = null) {
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
            if (token) localStorage.setItem(STORAGE_KEY_TOKEN, token);

            if (rememberCredentials) {
                this.setRememberedAuth({
                    remember: true,
                    username: rememberCredentials.username || user.username,
                    pin: rememberCredentials.pin || user.pin || '',
                    fullName: user.fullName,
                    role: user.role,
                    savedAt: new Date().toISOString()
                });
            }

            try {
                if (user.role === 'Waiter') {
                    const staff = [{ id: user.id, name: user.fullName, role: 'Waiter', active: true }];
                    localStorage.setItem('admin_store_staff', JSON.stringify(staff));
                }
            } catch (e) {}

            try {
                const bc = new BroadcastChannel('cafemanager_auth_channel');
                bc.postMessage({ type: 'USER_LOGIN', user });
                bc.close();
            } catch (e) {}
        },

        /**
         * Đăng xuất khỏi hệ thống
         */
        logout(redirect = true) {
            localStorage.removeItem(STORAGE_KEY_USER);
            localStorage.removeItem(STORAGE_KEY_TOKEN);

            try {
                const bc = new BroadcastChannel('cafemanager_auth_channel');
                bc.postMessage({ type: 'USER_LOGOUT' });
                bc.close();
            } catch (e) {}

            if (redirect) {
                const dest = typeof redirect === 'string' ? redirect : 'login.html';
                window.location.href = dest;
            }
        },

        /**
         * Chuyển đổi tài khoản (Đăng nhập bằng tài khoản khác)
         * Xóa phiên hiện tại và chuyển về login.html kèm cờ switch
         */
        switchAccount(redirectTarget = null) {
            localStorage.removeItem(STORAGE_KEY_USER);
            localStorage.removeItem(STORAGE_KEY_TOKEN);
            const target = redirectTarget || window.location.pathname.split('/').pop() || 'index.html';
            window.location.href = `login.html?switch=1&redirect=${encodeURIComponent(target)}`;
        },

        /**
         * Bỏ qua thông báo không có quyền & quay về màn hình được phép của người dùng
         */
        dismissAccessDenied(fallbackUrl = null) {
            const modal = document.getElementById('cafe-access-denied-modal');
            if (modal) {
                modal.remove();
            }

            const user = this.getCurrentUser();
            const currentFile = window.location.pathname.split('/').pop().split('?')[0] || 'index.html';

            // Nếu đang đứng ngay tại trang bị cấm (ví dụ: Waiter đứng ở pos.html)
            // thì bắt buộc phải chuyển về màn hình của họ
            if (currentFile !== 'index.html') {
                const target = fallbackUrl || (user ? user.defaultScreen : 'login.html') || 'index.html';
                window.location.href = target;
            }
        },

        /**
         * HIỂN THỊ MODAL THÔNG BÁO KHÔNG CÓ QUYỀN TRUY CẬP (Có 2 lựa chọn theo yêu cầu)
         * Lựa chọn 1: Đăng nhập bằng tài khoản khác
         * Lựa chọn 2: Bỏ qua (về màn hình của tôi hoặc đóng thông báo)
         */
        showAccessDeniedModal(options = {}) {
            // Xóa modal cũ nếu có
            const existing = document.getElementById('cafe-access-denied-modal');
            if (existing) existing.remove();

            const user = options.user || this.getCurrentUser() || { fullName: 'Khách', role: 'Guest', roleName: 'Chưa xác thực' };
            const featureName = options.featureName || 'Chức năng hệ thống';
            const allowedDescription = options.allowedDescription || (options.allowedRoles ? options.allowedRoles.join(', ') : 'Quản lý');
            const redirectTarget = options.redirectTarget || window.location.pathname.split('/').pop() || 'index.html';
            const fallbackUrl = options.fallbackUrl || (user ? user.defaultScreen : 'login.html') || 'index.html';

            const modal = document.createElement('div');
            modal.id = 'cafe-access-denied-modal';
            modal.setAttribute('style', `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(3, 7, 18, 0.88);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            `);

            modal.innerHTML = `
                <div style="
                    background: linear-gradient(145deg, #111827 0%, #0b0f17 100%);
                    border: 1.5px solid rgba(244, 63, 94, 0.6);
                    box-shadow: 0 25px 50px -12px rgba(244, 63, 94, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05);
                    width: 100%;
                    max-width: 440px;
                    border-radius: 24px;
                    padding: 24px;
                    color: #fff;
                    text-align: center;
                    box-sizing: border-box;
                    animation: cafeModalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                ">
                    <!-- Icon cảnh báo -->
                    <div style="
                        width: 64px; height: 64px;
                        border-radius: 20px;
                        background: rgba(244, 63, 94, 0.15);
                        border: 1px solid rgba(244, 63, 94, 0.4);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 32px;
                        margin: 0 auto 16px auto;
                    ">⛔</div>

                    <!-- Tiêu đề -->
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 800; color: #fff; letter-spacing: -0.02em;">
                        KHÔNG CÓ QUYỀN TRUY CẬP
                    </h3>
                    
                    <!-- Thông tin user hiện tại -->
                    <div style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px;">
                        Tài khoản hiện tại của bạn: <br>
                        <strong style="color: #fbbf24; font-size: 14px;">${user.fullName || user.username}</strong>
                        <span style="
                            display: inline-block;
                            padding: 2px 8px;
                            border-radius: 999px;
                            background: rgba(255, 255, 255, 0.08);
                            color: #e2e8f0;
                            font-size: 11px;
                            font-weight: 700;
                            margin-left: 4px;
                            border: 1px solid rgba(255, 255, 255, 0.12);
                        ">${user.roleName || user.role}</span>
                    </div>

                    <!-- Hộp cảnh báo chức năng -->
                    <div style="
                        background: rgba(244, 63, 94, 0.08);
                        border: 1px solid rgba(244, 63, 94, 0.25);
                        border-radius: 16px;
                        padding: 12px 16px;
                        text-align: left;
                        margin-bottom: 20px;
                        font-size: 12px;
                        line-height: 1.5;
                        color: #cbd5e1;
                    ">
                        <div style="color: #fb7185; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                            <span>⚠️</span> Chức năng: <strong>${featureName}</strong>
                        </div>
                        <div>
                            Vai trò của bạn không có thẩm quyền trên phân hệ này. Quyền yêu cầu: <strong style="color: #fff;">${allowedDescription}</strong>.
                        </div>
                    </div>

                    <!-- 2 LỰA CHỌN THEO YÊU CẦU CỦA NGƯỜI DÙNG -->
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <!-- LỰA CHỌN 1: Đăng nhập bằng tài khoản khác -->
                        <button type="button" onclick="CafeAuth.switchAccount('${redirectTarget}')" style="
                            width: 100%;
                            padding: 13px 16px;
                            border-radius: 14px;
                            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                            color: #030712;
                            font-weight: 800;
                            font-size: 12px;
                            text-transform: uppercase;
                            letter-spacing: 0.04em;
                            border: none;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
                            transition: transform 0.1s, opacity 0.2s;
                        " onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='none'">
                            <span style="font-size: 14px;">🔄</span>
                            <span>1. Đăng nhập bằng tài khoản khác</span>
                        </button>

                        <!-- LỰA CHỌN 2: Bỏ qua -->
                        <button type="button" onclick="CafeAuth.dismissAccessDenied('${fallbackUrl}')" style="
                            width: 100%;
                            padding: 11px 16px;
                            border-radius: 14px;
                            background: rgba(30, 41, 59, 0.8);
                            color: #cbd5e1;
                            font-weight: 700;
                            font-size: 12px;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: background 0.2s, color 0.2s;
                        " onmouseover="this.style.background='rgba(51, 65, 85, 0.9)'; this.style.color='#fff';" onmouseout="this.style.background='rgba(30, 41, 59, 0.8)'; this.style.color='#cbd5e1';">
                            <span style="font-size: 14px;">↩️</span>
                            <span>2. Bỏ qua & Về màn hình của tôi</span>
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        },

        /**
         * BẢO VỆ TOÀN DIỆN MÀN HÌNH ĐANG MỞ (PAGE GUARD)
         * 1. Nếu chưa đăng nhập: lập tức chuyển hướng về login.html
         * 2. Nếu đã đăng nhập nhưng không có quyền: hiển thị thông báo với 2 lựa chọn
         */
        protectPage(options = {}) {
            const currentPath = window.location.pathname.split('/').pop().split('?')[0] || 'index.html';

            // Nếu đang ở màn hình login.html thì không chặn
            if (currentPath === 'login.html') return true;

            const user = this.getCurrentUser();

            // 1. CHƯA ĐĂNG NHẬP -> CHUYỂN HƯỚNG VỀ MÀN HÌNH ĐĂNG NHẬP
            if (!user) {
                console.warn('⛔ [CafeAuth] Người dùng chưa đăng nhập. Đang chuyển hướng về login.html...');
                window.location.replace(`login.html?redirect=${encodeURIComponent(currentPath)}`);
                return false;
            }

            // Xác định quyền theo cấu hình hoặc tham số
            const pagePerm = this.permissions[currentPath] || {};
            const allowedRoles = options.allowedRoles || pagePerm.allowedRoles;
            const pageName = options.pageName || pagePerm.name || document.title;
            const allowedDescription = options.allowedDescription || pagePerm.allowedDescription;

            // 2. ĐÃ ĐĂNG NHẬP NHƯNG KHÔNG CÓ QUYỀN TRUY CẬP PHÂN HỆ NÀY
            if (allowedRoles && !this.hasPermission(user.role, allowedRoles)) {
                console.warn(`⛔ [CafeAuth] Tài khoản [${user.username} - ${user.role}] không có quyền vào [${pageName}].`);
                
                // Hiển thị modal chặn với 2 lựa chọn
                this.showAccessDeniedModal({
                    featureName: pageName,
                    allowedRoles: allowedRoles,
                    allowedDescription: allowedDescription,
                    user: user,
                    redirectTarget: currentPath,
                    fallbackUrl: user.defaultScreen || this.getDefaultScreenForRole(user.role)
                });

                return false;
            }

            return true;
        },

        /**
         * TỰ ĐỘNG CHẶN CLICK VÀO CÁC NÚT / LINK DẪN ĐẾN CHỨC NĂNG KHÔNG CÓ QUYỀN
         * Giúp chặn ngay từ menu và bảng điều khiển trước khi nhảy trang
         */
        interceptRestrictedLinks() {
            const user = this.getCurrentUser();
            if (!user) return;

            document.querySelectorAll('a[href], button[data-href]').forEach(el => {
                const href = el.getAttribute('href') || el.getAttribute('data-href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

                const targetFile = href.split('/').pop().split('?')[0];
                const perm = this.permissions[targetFile];

                if (perm && perm.allowedRoles && !this.hasPermission(user.role, perm.allowedRoles)) {
                    el.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showAccessDeniedModal({
                            featureName: perm.name,
                            allowedRoles: perm.allowedRoles,
                            allowedDescription: perm.allowedDescription,
                            user: user,
                            redirectTarget: targetFile,
                            fallbackUrl: user.defaultScreen || this.getDefaultScreenForRole(user.role)
                        });
                    }, true);
                }
            });
        },

        /**
         * Render thanh người dùng (User Header Chip) với đầy đủ thông tin & nút đổi tài khoản
         */
        renderUserHeader(targetElementId) {
            const target = document.getElementById(targetElementId);
            if (!target) return;

            const user = this.getCurrentUser();
            if (!user) {
                target.innerHTML = `
                    <a href="login.html" style="
                        display: flex; align-items: center; gap: 6px;
                        padding: 6px 14px; border-radius: 12px;
                        background: #f59e0b; color: #030712;
                        font-weight: 800; font-size: 12px;
                        text-decoration: none; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
                    ">
                        <span>🔑</span>
                        <span>Đăng Nhập</span>
                    </a>
                `;
                return;
            }

            target.innerHTML = `
                <div style="
                    display: flex; align-items: center; gap: 8px;
                    background: rgba(17, 24, 39, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px; padding: 4px 10px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                ">
                    <div style="
                        width: 28px; height: 28px; border-radius: 10px;
                        background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4);
                        display: flex; align-items: center; justify-content: center; font-size: 14px;
                    ">
                        ${user.roleIcon || '👤'}
                    </div>
                    <div style="text-align: left; line-height: 1.2;">
                        <div style="font-size: 12px; font-weight: 800; color: #fff;">${user.fullName || user.username}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #f59e0b;">${user.roleName || user.role}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-left: 4px; padding-left: 6px; border-left: 1px solid rgba(255, 255, 255, 0.1);">
                        <button type="button" onclick="CafeAuth.switchAccount()" title="Đổi tài khoản khác" style="
                            background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 6px; font-size: 12px; color: #94a3b8;
                        " onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#94a3b8'">
                            🔄
                        </button>
                        <button type="button" onclick="CafeAuth.logout('login.html')" title="Đăng xuất" style="
                            background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 6px; font-size: 12px; color: #94a3b8;
                        " onmouseover="this.style.color='#f43f5e'" onmouseout="this.style.color='#94a3b8'">
                            🚪
                        </button>
                    </div>
                </div>
            `;
        }
    };

    // Kiểm tra ngay khi file script chạy: nếu chưa đăng nhập và không phải login.html -> chuyển ngay về login.html
    try {
        const currentScriptFile = window.location.pathname.split('/').pop().split('?')[0] || 'index.html';
        if (currentScriptFile !== 'login.html') {
            const currentUser = Auth.getCurrentUser();
            if (!currentUser) {
                window.location.replace(`login.html?redirect=${encodeURIComponent(currentScriptFile)}`);
            }
        }
    } catch (e) {}

    // Tiêm CSS Animation cho Modal thông báo phân quyền
    try {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes cafeModalPop {
                from { opacity: 0; transform: scale(0.92); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    } catch(e) {}

    // Tự động kiểm tra quyền khi tải trang (trừ màn hình login.html)
    document.addEventListener('DOMContentLoaded', () => {
        const currentFile = window.location.pathname.split('/').pop().split('?')[0] || 'index.html';
        if (currentFile !== 'login.html') {
            const passed = Auth.protectPage();
            if (passed) {
                Auth.interceptRestrictedLinks();
            }
        }
    });

    // Đưa ra scope toàn cục
    global.CafeAuth = Auth;
})(window);
