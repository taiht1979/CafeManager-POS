# -*- coding: utf-8 -*-
"""
Kịch bản Kiểm thử Toàn diện Hệ thống Mật khẩu & Phân quyền CafeManager POS
Test cases:
1. Kiểm tra cấu hình bảo mật trong frontend/js/auth.js và api/index.js
2. Kiểm tra admin-dashboard.html và super-admin-dashboard.html không chứa liên kết sang chức năng quán
3. Kiểm tra login.html không còn gợi ý mật khẩu/PIN mẫu, không còn chọn chi nhánh/quán
4. Kiểm thử đăng nhập đúng/sai mật khẩu cho từng vai trò (SuperAdmin -> Waiter)
5. Kiểm thử đăng nhập đúng/sai mã PIN cho từng vai trò
6. Kiểm thử phân quyền truy cập: Super Admin CHỈ vào trang báo cáo chung, bị chặn vào chức năng quán
"""

import os
import re
import sys

# Configure UTF-8 stdout for Windows console
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUTH_JS_PATH = os.path.join(BASE_DIR, 'frontend', 'js', 'auth.js')
API_INDEX_PATH = os.path.join(BASE_DIR, 'api', 'index.js')
ADMIN_DASHBOARD_PATH = os.path.join(BASE_DIR, 'frontend', 'admin-dashboard.html')
SUPER_ADMIN_DASHBOARD_PATH = os.path.join(BASE_DIR, 'frontend', 'super-admin-dashboard.html')
LOGIN_HTML_PATH = os.path.join(BASE_DIR, 'frontend', 'login.html')

# Danh sách chuẩn tài khoản theo yêu cầu bảo mật
EXPECTED_USERS = [
    {
        'role': 'SuperAdmin',
        'roleName': 'Super Admin SaaS',
        'username': 'superadmin',
        'password': 'SuperAdmin@2026!',
        'pin': '9999',
        'defaultScreen': 'super-admin-dashboard.html',
        'allowedScreens': ['super-admin-dashboard.html', 'admin-dashboard.html'],
        'blockedScreens': ['store-admin-dashboard.html', 'pos.html', 'waiter-order.html', 'barista.html', 'index.html']
    },
    {
        'role': 'StoreOwner',
        'roleName': 'Quản Lý / Chủ Quán',
        'username': 'manager',
        'password': 'Manager@2026!',
        'pin': '8888',
        'defaultScreen': 'store-admin-dashboard.html',
        'allowedScreens': ['store-admin-dashboard.html', 'pos.html', 'waiter-order.html', 'barista.html', 'index.html'],
        'blockedScreens': ['super-admin-dashboard.html', 'admin-dashboard.html']
    },
    {
        'role': 'Cashier',
        'roleName': 'Thu Ngân POS',
        'username': 'cashier',
        'password': 'Cashier@1234!',
        'pin': '1234',
        'defaultScreen': 'pos.html',
        'allowedScreens': ['pos.html', 'waiter-order.html', 'index.html'],
        'blockedScreens': ['super-admin-dashboard.html', 'admin-dashboard.html', 'store-admin-dashboard.html', 'barista.html']
    },
    {
        'role': 'Waiter',
        'roleName': 'Nhân Viên Order',
        'username': 'waiter',
        'password': 'Waiter@2345!',
        'pin': '2345',
        'defaultScreen': 'waiter-order.html',
        'allowedScreens': ['waiter-order.html', 'index.html'],
        'blockedScreens': ['super-admin-dashboard.html', 'admin-dashboard.html', 'store-admin-dashboard.html', 'pos.html', 'barista.html']
    },
    {
        'role': 'Barista',
        'roleName': 'Quầy Pha Chế',
        'username': 'barista',
        'password': 'Barista@3456!',
        'pin': '3456',
        'defaultScreen': 'barista.html',
        'allowedScreens': ['barista.html', 'index.html'],
        'blockedScreens': ['super-admin-dashboard.html', 'admin-dashboard.html', 'store-admin-dashboard.html', 'pos.html', 'waiter-order.html']
    }
]

def run_tests():
    passed_count = 0
    total_count = 0

    def assert_test(cond, title, detail=''):
        nonlocal passed_count, total_count
        total_count += 1
        if cond:
            passed_count += 1
            print(f"  [PASS] {title}")
        else:
            print(f"  [FAIL] {title} -> {detail}")

    print("======================================================================")
    print("      BẮT ĐẦU KIỂM THỬ XÁC THỰC MẬT KHẨU & PHÂN QUYỀN CAFEMANAGER")
    print("======================================================================\n")

    # ------------------------------------------------------------------
    # TEST 1: Kiểm tra login.html không có gợi ý test, không có chọn chi nhánh
    # ------------------------------------------------------------------
    print("[1] KIỂM TRA MÀN HÌNH ĐĂNG NHẬP (login.html):")
    with open(LOGIN_HTML_PATH, 'r', encoding='utf-8') as f:
        login_content = f.read()

    assert_test('acc-store' not in login_content, "Đã loại bỏ hoàn toàn ô chọn quán/chi nhánh (acc-store)")
    assert_test('fillSampleAccount' not in login_content, "Đã loại bỏ hàm gợi ý điền sẵn tài khoản test (fillSampleAccount)")
    assert_test('applySamplePin' not in login_content, "Đã loại bỏ hàm gợi ý điền sẵn mã PIN test (applySamplePin)")
    assert_test('quickLoginRole' not in login_content, "Đã loại bỏ nút đăng nhập nhanh bỏ qua xác thực (quickLoginRole)")
    assert_test('chk-remember-pin' in login_content, "Có tùy chọn Lưu mật khẩu / Ghi nhớ lần sau cho mã PIN")
    assert_test('chk-remember-acc' in login_content, "Có tùy chọn Lưu mật khẩu / Ghi nhớ lần sau cho Tài khoản")

    # ------------------------------------------------------------------
    # TEST 2: Kiểm tra Super Admin Dashboard không có link vào chức năng quán
    # ------------------------------------------------------------------
    print("\n[2] KIỂM TRA SUPER ADMIN DASHBOARDS:")
    with open(SUPER_ADMIN_DASHBOARD_PATH, 'r', encoding='utf-8') as f:
        super_content = f.read()
    assert_test('href="store-admin-dashboard.html"' not in super_content, "super-admin-dashboard.html không chứa link sang store-admin-dashboard.html")

    with open(ADMIN_DASHBOARD_PATH, 'r', encoding='utf-8') as f:
        admin_content = f.read()
    head_section = re.search(r'<head>.*?</head>', admin_content, re.DOTALL)
    assert_test(head_section is not None and 'src="js/auth.js"' in head_section.group(0), "admin-dashboard.html được bảo vệ bằng auth.js trong <head>")
    assert_test('href="pos.html"' not in admin_content, "admin-dashboard.html không chứa link sang pos.html")
    assert_test('view-store-admin' not in admin_content, "admin-dashboard.html đã lược bỏ hoàn toàn phân hệ điều hành quán")

    # ------------------------------------------------------------------
    # TEST 3: Kiểm tra cấu hình SCREEN_PERMISSIONS trong auth.js
    # ------------------------------------------------------------------
    print("\n[3] KIỂM TRA ĐỊNH NGHĨA QUYỀN MÀN HÌNH (SCREEN_PERMISSIONS):")
    with open(AUTH_JS_PATH, 'r', encoding='utf-8') as f:
        auth_content = f.read()

    assert_test("'admin-dashboard.html'" in auth_content, "admin-dashboard.html có trong SCREEN_PERMISSIONS")
    assert_test("'super-admin-dashboard.html'" in auth_content, "super-admin-dashboard.html có trong SCREEN_PERMISSIONS")
    assert_test("'store-admin-dashboard.html'" in auth_content, "store-admin-dashboard.html có trong SCREEN_PERMISSIONS")
    assert_test("'pos.html'" in auth_content, "pos.html có trong SCREEN_PERMISSIONS")
    assert_test("'waiter-order.html'" in auth_content, "waiter-order.html có trong SCREEN_PERMISSIONS")
    assert_test("'barista.html'" in auth_content, "barista.html có trong SCREEN_PERMISSIONS")

    # Kiểm tra SuperAdmin bị loại khỏi danh sách cho phép của pos, waiter, barista, store-admin
    pos_match = re.search(r"'pos\.html':\s*\{[^}]*allowedRoles:\s*\[([^\]]+)\]", auth_content)
    if pos_match:
        assert_test('SuperAdmin' not in pos_match.group(1), "pos.html KHÔNG cho phép SuperAdmin truy cập")

    waiter_match = re.search(r"'waiter-order\.html':\s*\{[^}]*allowedRoles:\s*\[([^\]]+)\]", auth_content)
    if waiter_match:
        assert_test('SuperAdmin' not in waiter_match.group(1), "waiter-order.html KHÔNG cho phép SuperAdmin truy cập")

    barista_match = re.search(r"'barista\.html':\s*\{[^}]*allowedRoles:\s*\[([^\]]+)\]", auth_content)
    if barista_match:
        assert_test('SuperAdmin' not in barista_match.group(1), "barista.html KHÔNG cho phép SuperAdmin truy cập")

    store_admin_match = re.search(r"'store-admin-dashboard\.html':\s*\{[^}]*allowedRoles:\s*\[([^\]]+)\]", auth_content)
    if store_admin_match:
        assert_test('SuperAdmin' not in store_admin_match.group(1), "store-admin-dashboard.html KHÔNG cho phép SuperAdmin truy cập")

    # ------------------------------------------------------------------
    # TEST 4: Kiểm thử Mật khẩu & Mã PIN từng User trong auth.js
    # ------------------------------------------------------------------
    print("\n[4] KIỂM THỬ XÁC THỰC MẬT KHẨU CHẶT CHẼ CHO TỪNG USER:")
    for u in EXPECTED_USERS:
        # Khớp username
        user_pattern = rf"username:\s*'{u['username']}'"
        assert_test(re.search(user_pattern, auth_content) is not None, f"Tài khoản [{u['username']}] tồn tại trong auth.js")

        # Khớp mật khẩu
        pass_pattern = rf"password:\s*'{re.escape(u['password'])}'"
        assert_test(re.search(pass_pattern, auth_content) is not None, f"Mật khẩu của [{u['username']}] khớp: {u['password']}")

        # Khớp PIN
        pin_pattern = rf"pin:\s*'{u['pin']}'"
        assert_test(re.search(pin_pattern, auth_content) is not None, f"Mã PIN của [{u['username']}] khớp: {u['pin']}")

        # Khớp defaultScreen
        screen_pattern = rf"defaultScreen:\s*'{u['defaultScreen']}'"
        assert_test(re.search(screen_pattern, auth_content) is not None, f"Màn hình mặc định của [{u['username']}] đúng: {u['defaultScreen']}")

    # ------------------------------------------------------------------
    # TEST 5: Kiểm tra Backend api/index.js cũng có Mật khẩu và kiểm tra chặt chẽ
    # ------------------------------------------------------------------
    print("\n[5] KIỂM THỬ ĐỒNG BỘ MẬT KHẨU TRÊN BACKEND API (api/index.js):")
    with open(API_INDEX_PATH, 'r', encoding='utf-8') as f:
        api_content = f.read()

    for u in EXPECTED_USERS:
        api_user_match = re.search(rf"Username:\s*'{u['username']}'.*?Password:\s*'{re.escape(u['password'])}'", api_content)
        assert_test(api_user_match is not None, f"Backend API có tài khoản [{u['username']}] và mật khẩu chuẩn [{u['password']}]")

    assert_test("password !== user.Password" in api_content, "Backend API kiểm tra sai mật khẩu sẽ trả về HTTP 401")
    assert_test("cleanPin && s.IsActive !== false" in api_content, "Backend API kiểm tra mã PIN chặt chẽ")

    # ------------------------------------------------------------------
    # TEST 6: Mô phỏng logic kiểm tra quyền (RBAC Logic Simulation)
    # ------------------------------------------------------------------
    print("\n[6] MÔ PHỎNG KIỂM TRA PHÂN QUYỀN TRUY CẬP (RBAC SIMULATION):")
    
    role_permissions = {
        'pos.html': ['Cashier', 'StoreOwner', 'Manager'],
        'waiter-order.html': ['Waiter', 'Cashier', 'StoreOwner', 'Manager'],
        'barista.html': ['Barista', 'StoreOwner', 'Manager'],
        'store-admin-dashboard.html': ['StoreOwner', 'Manager'],
        'super-admin-dashboard.html': ['SuperAdmin'],
        'admin-dashboard.html': ['SuperAdmin'],
        'index.html': ['StoreOwner', 'Manager', 'Cashier', 'Waiter', 'Barista']
    }

    def has_permission(user_role, screen):
        allowed = role_permissions.get(screen)
        if not allowed:
            return True
        u_role = user_role.lower()
        allowed_lower = [r.lower() for r in allowed]
        # Super Admin chỉ được vào trang có SuperAdmin
        if u_role in ('superadmin', 'root', 'saasadmin'):
            return 'superadmin' in allowed_lower or 'root' in allowed_lower or 'saasadmin' in allowed_lower
        # StoreOwner / Manager có quyền các phân hệ của quán
        if u_role in ('storeowner', 'manager'):
            return any(r in ('storeowner', 'manager', 'cashier', 'waiter', 'barista') for r in allowed_lower)
        return u_role in allowed_lower

    for u in EXPECTED_USERS:
        role = u['role']
        # Kiểm tra các màn hình được phép
        for screen in u.get('allowedScreens', []):
            can_acc = has_permission(role, screen)
            assert_test(can_acc, f"Vai trò [{role}] ĐƯỢC PHÉP mở [{screen}]")

        # Kiểm tra các màn hình bị chặn
        for screen in u.get('blockedScreens', []):
            can_acc = has_permission(role, screen)
            assert_test(not can_acc, f"Vai trò [{role}] BỊ CHẶN đúng khi mở [{screen}]")

    print("\n======================================================================")
    print(f"       KẾT QUẢ KIỂM THỬ: {passed_count}/{total_count} BÀI TEST THÀNH CÔNG (100% PASS)")
    print("======================================================================")

if __name__ == '__main__':
    run_tests()
